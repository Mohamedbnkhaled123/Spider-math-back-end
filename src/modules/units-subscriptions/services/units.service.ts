import { Types } from 'mongoose';
import { UnitPackageModel, IUnitPackage } from '../../../models/unit-package.model';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { SubmissionModel } from '../../../models/submission.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { UserModel } from '../../../models/user.model';
import { publicCmsCache } from '../../../config/cache.config';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES } from '../../../common/constants/roles.constant';
import { UnitsQueryDto } from '../dto/units-query.dto';
import { CreateUnitPackageDto, UpdateUnitPackageDto } from '../dto/unit-crud.dto';

export class UnitsService {
  /**
   * Retrieves all unit packages in the platform for Super Admin management.
   */
  public async getAllUnitsAdmin() {
    return UnitPackageModel.find({})
      .sort({ curriculum: 1, grade_level: 1, order_index: 1, createdAt: 1 })
      .lean();
  }

  /**
   * Retrieves published educational units and revision packages.
   * Scoped by the 5-level compound index and optionally hydrated with isSubscribed flag.
   */
  public async getUnitsCatalog(query: UnitsQueryDto, studentId?: string, isSuperAdmin: boolean = false) {
    const isAnonymousVisitor = (!studentId || !Types.ObjectId.isValid(studentId)) && !isSuperAdmin;
    const cacheKey = `units_catalog:${query.curriculum || 'ALL'}:${query.gradeLevel || 'ALL'}:${query.term || 'ALL'}:${query.type || 'ALL'}`;

    if (isAnonymousVisitor) {
      const cached = publicCmsCache.get(cacheKey) as any[] | undefined;
      if (cached) {
        return cached;
      }
    }

    const filter: Record<string, unknown> = isSuperAdmin ? {} : { is_published: true };

    if (!isSuperAdmin && studentId && Types.ObjectId.isValid(studentId)) {
      const student = await UserModel.findById(studentId).select('grade_level curriculum role');
      if (student && student.role === ROLES.STUDENT && student.grade_level) {
        filter.grade_level = student.grade_level;
        if (student.curriculum) {
          filter.curriculum = student.curriculum;
        }
      } else {
        if (query.curriculum) filter.curriculum = query.curriculum;
        if (query.gradeLevel) filter.grade_level = query.gradeLevel;
      }
    } else {
      if (query.curriculum) filter.curriculum = query.curriculum;
      if (query.gradeLevel) filter.grade_level = query.gradeLevel;
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

    if (units.length === 0) {
      return [];
    }

    const unitIds = units.map((u) => u._id);

    // Dynamically aggregate real published lectures and assessments counts directly from database
    const [lectureCounts, quizCounts] = await Promise.all([
      LectureMaterialModel.aggregate([
        { $match: { unit_package_id: { $in: unitIds }, is_published: true } },
        { $group: { _id: '$unit_package_id', count: { $sum: 1 } } }
      ]),
      AssessmentModel.aggregate([
        { $match: { unit_package_id: { $in: unitIds }, is_published: true } },
        { $group: { _id: '$unit_package_id', count: { $sum: 1 } } }
      ])
    ]);

    const lectureMap = new Map<string, number>(lectureCounts.map((l: any) => [l._id.toString(), l.count]));
    const quizMap = new Map<string, number>(quizCounts.map((q: any) => [q._id.toString(), q.count]));

    if (isAnonymousVisitor) {
      const mapped = units.map((u) => {
        const lecturesCount = lectureMap.get(u._id.toString()) || 0;
        const quizzesCount = quizMap.get(u._id.toString()) || 0;
        return {
          ...u,
          lectures_count: lecturesCount,
          quizzes_count: quizzesCount,
          total_lectures_count: lecturesCount,
          total_assessments_count: quizzesCount,
          isSubscribed: false
        };
      });
      publicCmsCache.set(cacheKey, mapped as any, 12 * 60 * 60 * 1000); // 12 hours TTL
      return mapped;
    }

    // Hydrate subscription status for authenticated student
    const activeSubs = await SubscriptionModel.find({
      student_id: studentId,
      subscription_status: 'ACTIVE',
      expires_at: { $gt: new Date() }
    })
      .select('unit_package_id expires_at access_scope')
      .lean();

    const subMap = new Map<string, { expiresAt: Date; accessScope: string }>();
    activeSubs.forEach((s: any) => {
      subMap.set(s.unit_package_id.toString(), { expiresAt: s.expires_at, accessScope: s.access_scope || 'FULL' });
    });

    return units.map((u) => {
      const subInfo = subMap.get(u._id.toString());
      const lecturesCount = lectureMap.get(u._id.toString()) || 0;
      const quizzesCount = quizMap.get(u._id.toString()) || 0;
      return {
        ...u,
        lectures_count: lecturesCount,
        quizzes_count: quizzesCount,
        total_lectures_count: lecturesCount,
        total_assessments_count: quizzesCount,
        isSubscribed: !!subInfo,
        accessScope: subInfo ? subInfo.accessScope : null,
        subscriptionExpiresAt: subInfo ? subInfo.expiresAt : null
      };
    });
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
    let accessScope: 'FULL' | 'ASSESSMENTS_ONLY' | null = isSuperAdmin ? 'FULL' : null;
    let subscriptionExpiresAt: string | null = null;
    let isExpired = false;

    if (!isSubscribed && studentId && Types.ObjectId.isValid(studentId)) {
      const latestSub = await SubscriptionModel.findOne({
        student_id: studentId,
        unit_package_id: unitId
      }).sort({ createdAt: -1 }).lean();

      if (latestSub) {
        subscriptionExpiresAt = latestSub.expires_at ? new Date(latestSub.expires_at).toISOString() : null;
        if (latestSub.subscription_status === 'ACTIVE' && (!latestSub.expires_at || new Date(latestSub.expires_at) > new Date())) {
          isSubscribed = true;
          accessScope = (latestSub as any).access_scope || 'FULL';
          isExpired = false;
        } else {
          isSubscribed = false;
          isExpired = true;
        }
      }
    }

    // Check grade-level compatibility if not subscribed
    if (!isSubscribed && studentId && Types.ObjectId.isValid(studentId)) {
      const student = await UserModel.findById(studentId).select('grade_level curriculum');
      if (student && student.grade_level && unit.grade_level) {
        const normStudentGrade = (student.grade_level || '').trim().toUpperCase();
        const normUnitGrade = (unit.grade_level || '').trim().toUpperCase();
        const normalizeGrade = (g: string) => {
          if (g.includes('SEC_1') || g.includes('الأول الثانوي') || g.includes('SECONDARY 1') || g.includes('1ST SEC')) return 'SEC_1';
          if (g.includes('SEC_2') || g.includes('الثاني الثانوي') || g.includes('SECONDARY 2') || g.includes('2ND SEC')) return 'SEC_2';
          if (g.includes('SEC_3') || g.includes('الثالث الثانوي') || g.includes('SECONDARY 3') || g.includes('THANAWEYA') || g.includes('3RD SEC')) return 'SEC_3';
          if (g.includes('PREP_1') || g.includes('الأول الإعدادي')) return 'PREP_1';
          if (g.includes('PREP_2') || g.includes('الثاني الإعدادي')) return 'PREP_2';
          if (g.includes('PREP_3') || g.includes('الثالث الإعدادي')) return 'PREP_3';
          if (g.includes('GRADE_12') || g.includes('الثاني عشر') || g.includes('توجيهي')) return 'GRADE_12';
          if (g.includes('GRADE_11') || g.includes('الحادي عشر')) return 'GRADE_11';
          if (g.includes('GRADE_10') || g.includes('العاشر')) return 'GRADE_10';
          if (g.includes('GRADE_9') || g.includes('التاسع')) return 'GRADE_9';
          return g;
        };

        if (normalizeGrade(normUnitGrade) !== normalizeGrade(normStudentGrade)) {
          // Check if this unit has free trial lectures - all registered students are allowed to preview free trial lectures
          const hasFreeLectures = await LectureMaterialModel.exists({
            unit_package_id: unitId,
            is_published: true,
            $or: [{ is_free: true }, { is_free_trial: true }]
          });
          if (!hasFreeLectures) {
            throw new AppError('عذراً، هذه الوحدة التعليمية مخصصة لصف دراسي آخر فقط.', 403, ERROR_CODES.FORBIDDEN_403);
          }
        }
      }
    }

    const hasFullAccess = isSuperAdmin || (isSubscribed && accessScope !== 'ASSESSMENTS_ONLY');

    // Fetch ordered lectures (excluding sensitive links & cipher from default query for non-subscribed)
    const lectures = await LectureMaterialModel.find({
      unit_package_id: unitId,
      is_published: true
    })
      .sort({ order_index: 1 })
      .select(
        hasFullAccess
          ? '-youtube_encrypted_id'
          : '-youtube_encrypted_id -youtube_url -youtube_video_id'
      )
      .lean();

    // For non-subscribed users, selectively query playback and PDF credentials for free-trial lectures only
    const freeTrialLectureMap = new Map<string, any>();
    if (!hasFullAccess) {
      const trialIds = lectures.filter((l) => l.is_free || l.is_free_trial).map((l) => l._id);
      if (trialIds.length > 0) {
        const trialLecs = await LectureMaterialModel.find({
          _id: { $in: trialIds }
        })
          .select('youtube_video_id youtube_url google_drive_pdf_id pdf_materials is_print_allowed')
          .lean();
        trialLecs.forEach((t) => freeTrialLectureMap.set(t._id.toString(), t));
      }
    }

    // Fetch ordered assessments with sanitized answer keys (hide empty assessments from students)
    const assessmentsFilter: Record<string, any> = {
      unit_package_id: unitId,
      is_published: true
    };
    if (!isSuperAdmin) {
      assessmentsFilter['questions.0'] = { $exists: true };
    }
    const assessmentQuery = AssessmentModel.find(assessmentsFilter).sort({ createdAt: 1 });
    if (!isSuperAdmin) {
      assessmentQuery.select('-questions.correct_option_index -questions.model_answer_text -questions.youtube_solution_url');
    }
    const assessments = await assessmentQuery.lean();

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

    const hydratedLectures = lectures.map((lec: any) => {
      const prog = progressMap.get(lec._id.toString());
      const isLectureAllowed = (isSubscribed && accessScope !== 'ASSESSMENTS_ONLY') || !!lec.is_free || !!lec.is_free_trial;
      const trialData = freeTrialLectureMap.get(lec._id.toString());

      // If lecture is not authorized, zero-out sensitive DRM video & PDF credentials
      if (!isLectureAllowed) {
        const {
          youtube_video_id,
          youtube_url,
          google_drive_pdf_id,
          pdf_materials,
          youtube_encrypted_id,
          ...safeLec
        } = lec;

        return {
          ...safeLec,
          isCompleted: prog?.isCompleted || false,
          watchPercentage: prog?.watchPercentage || 0,
          lastPlaybackPositionSec: prog?.lastPlaybackPositionSec || 0,
          isAccessible: false,
          is_free_trial: false,
          youtube_video_id: '',
          youtube_url: '',
          google_drive_pdf_id: '',
          pdf_materials: [],
          is_print_allowed: false
        };
      }

      // Authorized lecture (subscribed student or free trial)
      const effectivePdfMaterials = trialData ? (trialData.pdf_materials || []) : (lec.pdf_materials || []);
      const primaryPdf = (effectivePdfMaterials && effectivePdfMaterials.length > 0) ? effectivePdfMaterials[0] : null;
      const effectiveVideoId = trialData ? (trialData.youtube_video_id || '') : (lec.youtube_video_id || '');
      const effectiveYoutubeUrl = trialData ? (trialData.youtube_url || '') : (lec.youtube_url || '');
      const effectiveGoogleDrivePdfId = primaryPdf
        ? (primaryPdf.storage_file_id || primaryPdf._id?.toString() || '')
        : (trialData ? trialData.google_drive_pdf_id : lec.google_drive_pdf_id) || '';
      const effectivePrintAllowed = primaryPdf ? !!primaryPdf.is_print_allowed : false;

      return {
        ...lec,
        isCompleted: prog?.isCompleted || false,
        watchPercentage: prog?.watchPercentage || 0,
        lastPlaybackPositionSec: prog?.lastPlaybackPositionSec || 0,
        isAccessible: true,
        youtube_video_id: effectiveVideoId,
        youtube_url: effectiveYoutubeUrl,
        google_drive_pdf_id: effectiveGoogleDrivePdfId,
        pdf_materials: effectivePdfMaterials,
        is_print_allowed: effectivePrintAllowed
      };
    });

    // Hydrate student assessment attempt statuses
    let submissionsByAssessment = new Map<string, any[]>();
    if (studentId && Types.ObjectId.isValid(studentId) && assessments.length > 0) {
      const assessmentIds = assessments.map((a) => a._id);
      const studentSubmissions = await SubmissionModel.find({
        student_id: new Types.ObjectId(studentId),
        assessment_id: { $in: assessmentIds }
      })
        .sort({ attempt_number: -1, createdAt: -1 })
        .lean();

      studentSubmissions.forEach((sub: any) => {
        const key = sub.assessment_id.toString();
        const list = submissionsByAssessment.get(key) || [];
        list.push(sub);
        submissionsByAssessment.set(key, list);
      });
    }

    // Calculate total submissions count per assessment
    const assessmentIdsForCount = assessments.map((a) => a._id);
    const totalSubmissionsCountMap = new Map<string, number>();
    if (assessmentIdsForCount.length > 0) {
      const allCounts = await SubmissionModel.aggregate([
        { $match: { assessment_id: { $in: assessmentIdsForCount } } },
        { $group: { _id: '$assessment_id', count: { $sum: 1 } } }
      ]);
      allCounts.forEach((c: any) => totalSubmissionsCountMap.set(c._id.toString(), c.count));
    }

    const now = new Date();

    const hydratedAssessments = assessments.map((ass) => {
      const totalSubsCount = totalSubmissionsCountMap.get(ass._id.toString()) || 0;
      const subs = submissionsByAssessment.get(ass._id.toString()) || [];
      const completedAttemptsCount = subs.filter((s: any) => s.sync_queue_status === 'SYNCED_ONLINE').length;
      const inProgressSub = subs.find((s: any) => s.sync_queue_status === 'IN_PROGRESS');
      const latestSub = subs[0] || null;

      let timeWindowState: 'UPCOMING' | 'EXPIRED' | 'OPEN' = 'OPEN';
      if (ass.available_from && now < new Date(ass.available_from)) {
        timeWindowState = 'UPCOMING';
      } else if (ass.available_until && now > new Date(ass.available_until)) {
        timeWindowState = 'EXPIRED';
      }

      return {
        ...ass,
        submissions_count: totalSubsCount,
        isAccessible: isSubscribed || !!ass.is_free || !!ass.is_placement_test,
        studentAttemptStatus: {
          completedAttemptsCount,
          inProgressSubmissionId: inProgressSub ? inProgressSub._id.toString() : null,
          latestSubmissionId: latestSub ? latestSub._id.toString() : null,
          resultVisibility: latestSub ? latestSub.result_visibility : null,
          finalTotalScore: latestSub ? latestSub.final_total_score : null,
          timeWindowState
        }
      };
    });

    return {
      unit,
      isSubscribed,
      accessScope,
      subscriptionExpiresAt,
      isExpired,
      lecturesCount: hydratedLectures.length,
      assessmentsCount: assessments.length,
      lectures: hydratedLectures,
      assessments: hydratedAssessments
    };
  }

  /**
   * Super Admin: Creates new educational UnitPackage.
   */
  public async createUnitPackage(dto: CreateUnitPackageDto): Promise<IUnitPackage> {
    let slug = (dto.slug || '').toLowerCase().trim();
    if (!slug) {
      slug = `unit-${Date.now().toString(36)}`;
    }

    const existingSlug = await UnitPackageModel.findOne({ slug });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const unit = await UnitPackageModel.create({
      ...dto,
      slug
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
