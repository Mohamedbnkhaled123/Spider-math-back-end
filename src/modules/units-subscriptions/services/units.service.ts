import { Types } from 'mongoose';
import { UnitPackageModel, IUnitPackage } from '../../../models/unit-package.model';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { publicCmsCache } from '../../../config/cache.config';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { UnitsQueryDto } from '../dto/units-query.dto';
import { CreateUnitPackageDto, UpdateUnitPackageDto } from '../dto/unit-crud.dto';

export class UnitsService {
  /**
   * Retrieves published educational units and revision packages.
   * Scoped by the 5-level compound index and optionally hydrated with isSubscribed flag.
   */
  public async getUnitsCatalog(query: UnitsQueryDto, studentId?: string) {
    const filter: Record<string, unknown> = { is_published: true };

    if (query.curriculum) {
      filter.curriculum = query.curriculum;
    }
    if (query.gradeLevel) {
      filter.grade_level = query.gradeLevel;
    }
    if (query.term) {
      filter.academic_term = query.term;
    }
    if (query.type) {
      filter.package_type = query.type;
    }

    const units = await UnitPackageModel.find(filter)
      .sort({ order_index: 1, createdAt: 1 })
      .lean();

    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return units.map((u) => ({ ...u, isSubscribed: false }));
    }

    // Hydrate subscription status for authenticated student
    const activeSubs = await SubscriptionModel.find({
      student_id: studentId,
      subscription_status: 'ACTIVE',
      expires_at: { $gt: new Date() }
    })
      .select('unit_package_id expires_at')
      .lean();

    const subMap = new Map<string, Date>();
    activeSubs.forEach((s) => {
      subMap.set(s.unit_package_id.toString(), s.expires_at);
    });

    return units.map((u) => ({
      ...u,
      isSubscribed: subMap.has(u._id.toString()),
      subscriptionExpiresAt: subMap.get(u._id.toString()) || null
    }));
  }

  /**
   * Retrieves the curriculum contents (ordered lectures & sanitized assessments) inside a UnitPackage.
   */
  public async getUnitCurriculumContents(unitId: string, studentId?: string, isSuperAdmin?: boolean) {
    if (!Types.ObjectId.isValid(unitId)) {
      throw new AppError('Invalid unitId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const unit = await UnitPackageModel.findById(unitId).lean();
    if (!unit) {
      throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    // Check subscription status
    let isSubscribed = !!isSuperAdmin;
    if (!isSubscribed && studentId && Types.ObjectId.isValid(studentId)) {
      const activeSub = await SubscriptionModel.findOne({
        student_id: studentId,
        unit_package_id: unitId,
        subscription_status: 'ACTIVE',
        expires_at: { $gt: new Date() }
      }).lean();
      isSubscribed = !!activeSub;
    }

    // Fetch ordered lectures (excluding raw cipher details if not authorized, but keeping metadata)
    const lectures = await LectureMaterialModel.find({
      unit_package_id: unitId,
      is_published: true
    })
      .sort({ order_index: 1 })
      .select('-youtube_encrypted_id')
      .lean();

    // Fetch ordered assessments with sanitized answer keys
    const assessments = await AssessmentModel.find({
      unit_package_id: unitId,
      is_published: true
    })
      .sort({ createdAt: 1 })
      .select('-questions.correct_option_index -questions.model_answer_text -questions.youtube_solution_url')
      .lean();

    // Hydrate student progress if authenticated
    let progressMap = new Map<string, any>();
    if (studentId && Types.ObjectId.isValid(studentId)) {
      const progresses = await WatchProgressModel.find({
        student_id: studentId,
        unit_package_id: unitId
      }).lean();

      progresses.forEach((p) => {
        progressMap.set(p.lecture_id.toString(), {
          isCompleted: p.is_completed,
          watchPercentage: p.watch_percentage,
          lastPlaybackPositionSec: p.last_playback_position_sec
        });
      });
    }

    const hydratedLectures = lectures.map((lec) => {
      const prog = progressMap.get(lec._id.toString());
      return {
        ...lec,
        isCompleted: prog?.isCompleted || false,
        watchPercentage: prog?.watchPercentage || 0,
        lastPlaybackPositionSec: prog?.lastPlaybackPositionSec || 0,
        isAccessible: isSubscribed || lec.is_free_trial
      };
    });

    return {
      unit,
      isSubscribed,
      lecturesCount: hydratedLectures.length,
      assessmentsCount: assessments.length,
      lectures: hydratedLectures,
      assessments: assessments.map((ass) => ({
        ...ass,
        isAccessible: isSubscribed
      }))
    };
  }

  /**
   * Super Admin: Creates new educational UnitPackage.
   */
  public async createUnitPackage(dto: CreateUnitPackageDto): Promise<IUnitPackage> {
    const existingSlug = await UnitPackageModel.findOne({ slug: dto.slug.toLowerCase().trim() });
    if (existingSlug) {
      throw new AppError(`Unit package slug '${dto.slug}' already exists`, 409, ERROR_CODES.CONFLICT_409);
    }

    const unit = await UnitPackageModel.create({
      ...dto,
      slug: dto.slug.toLowerCase().trim()
    });

    publicCmsCache.clear();

    return unit;
  }

  /**
   * Super Admin: Updates an existing UnitPackage.
   */
  public async updateUnitPackage(unitId: string, dto: UpdateUnitPackageDto) {
    if (!Types.ObjectId.isValid(unitId)) {
      throw new AppError('Invalid unitId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    if (dto.slug) {
      dto.slug = dto.slug.toLowerCase().trim();
      const existingSlug = await UnitPackageModel.findOne({
        slug: dto.slug,
        _id: { $ne: unitId }
      });
      if (existingSlug) {
        throw new AppError(`Slug '${dto.slug}' is already in use by another package`, 409, ERROR_CODES.CONFLICT_409);
      }
    }

    const updated = await UnitPackageModel.findByIdAndUpdate(
      unitId,
      { $set: dto },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    publicCmsCache.clear();

    return updated;
  }

  /**
   * Super Admin: Deletes an existing UnitPackage.
   */
  public async deleteUnitPackage(unitId: string) {
    if (!Types.ObjectId.isValid(unitId)) {
      throw new AppError('Invalid unitId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const deleted = await UnitPackageModel.findByIdAndDelete(unitId);
    if (!deleted) {
      throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    publicCmsCache.clear();

    return { success: true, deletedUnitId: unitId };
  }
}

export const unitsService = new UnitsService();
