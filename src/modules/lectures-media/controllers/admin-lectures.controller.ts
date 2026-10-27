import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { CryptoProxyService } from '../../../common/utils/crypto.util';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';

export class AdminLecturesController {
  /**
   * POST /api/v1/admin/lectures
   * Create a new lecture inside a Unit Package
   */
  public async createLecture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        unitId,
        unitPackageId,
        titleAr,
        titleEn,
        youtubeUrl,
        googleDrivePdfFileId,
        isPrintAllowed,
        durationMinutes,
        isFreeTrial
      } = req.body;

      const targetUnitId = unitId || unitPackageId;
      if (!targetUnitId || !Types.ObjectId.isValid(targetUnitId)) {
        throw new AppError('يرجى تحديد وحدة دراسية صالحة ومحفوظة بقاعدة البيانات (Valid unitId is required)', 400, ERROR_CODES.BAD_REQUEST_400);
      }

      if (!titleAr || !titleAr.trim()) {
        throw new AppError('Lecture title (titleAr) is required', 400, ERROR_CODES.BAD_REQUEST_400);
      }

      const unit = await UnitPackageModel.findById(targetUnitId);
      if (!unit) {
        throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
      }

      // Count existing lectures for order index
      const existingCount = await LectureMaterialModel.countDocuments({ unit_package_id: unit._id });

      const pdfMaterials = [];
      if (googleDrivePdfFileId && googleDrivePdfFileId.trim()) {
        pdfMaterials.push({
          title: `ملخص ومذكرة: ${titleAr.trim()}`,
          storage_file_id: googleDrivePdfFileId.trim(),
          is_print_allowed: !!isPrintAllowed,
          pages_count: 1
        });
      }

      const rawYoutube = youtubeUrl ? youtubeUrl.trim() : '';
      const cleanVideoId = CryptoProxyService.extractYoutubeId(rawYoutube);
      if (!cleanVideoId) {
        throw new AppError('يرجى إدخال رابط يوتيوب صالح للشرح (YouTube Video URL is required)', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      const encryptedYoutube = CryptoProxyService.encrypt(cleanVideoId);

      const lecture = await LectureMaterialModel.create({
        unit_package_id: unit._id,
        curriculum: unit.curriculum,
        grade_level: unit.grade_level,
        academic_term: unit.academic_term,
        lecture_title_ar: titleAr.trim(),
        lecture_title_en: titleEn ? titleEn.trim() : titleAr.trim(),
        description: '',
        order_index: existingCount + 1,
        youtube_encrypted_id: encryptedYoutube,
        youtube_video_id: cleanVideoId,
        youtube_url: rawYoutube,
        video_duration_sec: durationMinutes ? Math.max(1, Math.round(Number(durationMinutes) * 60)) : 300,
        completion_threshold_pct: 85,
        xp_reward_on_complete: 50,
        pdf_materials: pdfMaterials,
        google_drive_pdf_id: googleDrivePdfFileId ? googleDrivePdfFileId.trim() : '',
        is_print_allowed: !!isPrintAllowed,
        is_free_trial: !!isFreeTrial,
        is_published: true
      });

      // Update unit lecture count
      unit.lectures_count = existingCount + 1;
      await unit.save();

      res.status(201).json(createSuccessResponse(lecture));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/lectures/:id
   * Update lecture metadata
   */
  public async updateLecture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id;
      if (!lectureId || !Types.ObjectId.isValid(lectureId)) {
        throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
      }

      const {
        titleAr,
        titleEn,
        youtubeUrl,
        googleDrivePdfFileId,
        isPrintAllowed,
        durationMinutes,
        isFreeTrial,
        isPublished
      } = req.body;

      const lecture = await LectureMaterialModel.findById(lectureId);
      if (!lecture) {
        throw new AppError('Lecture not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
      }

      if (titleAr) lecture.lecture_title_ar = titleAr.trim();
      if (titleEn) lecture.lecture_title_en = titleEn.trim();
      if (durationMinutes) lecture.video_duration_sec = durationMinutes * 60;
      if (isFreeTrial !== undefined) lecture.is_free_trial = isFreeTrial;
      if (isPublished !== undefined) lecture.is_published = isPublished;

      if (youtubeUrl) {
        const cleanVideoId = CryptoProxyService.extractYoutubeId(youtubeUrl.trim());
        lecture.youtube_encrypted_id = CryptoProxyService.encrypt(cleanVideoId);
        lecture.youtube_video_id = cleanVideoId;
        lecture.youtube_url = youtubeUrl.trim();
      }

      if (googleDrivePdfFileId !== undefined) {
        lecture.google_drive_pdf_id = googleDrivePdfFileId ? googleDrivePdfFileId.trim() : '';
        if (isPrintAllowed !== undefined) lecture.is_print_allowed = !!isPrintAllowed;
        if (googleDrivePdfFileId && googleDrivePdfFileId.trim()) {
          lecture.pdf_materials = [
            {
              title: `ملخص ومذكرة: ${lecture.lecture_title_ar}`,
              storage_file_id: googleDrivePdfFileId.trim(),
              is_print_allowed: isPrintAllowed !== undefined ? !!isPrintAllowed : true,
              pages_count: 1
            } as any
          ];
        } else {
          lecture.pdf_materials = [];
        }
      }

      await lecture.save();
      res.status(200).json(createSuccessResponse(lecture));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/lectures/:id
   * Delete lecture and decrement unit count
   */
  public async deleteLecture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id;
      if (!lectureId || !Types.ObjectId.isValid(lectureId)) {
        throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
      }

      const lecture = await LectureMaterialModel.findById(lectureId);
      if (!lecture) {
        throw new AppError('Lecture not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
      }

      const unitId = lecture.unit_package_id;
      await LectureMaterialModel.findByIdAndDelete(lectureId);

      // Decrement count in UnitPackage
      await UnitPackageModel.findByIdAndUpdate(unitId, {
        $inc: { lectures_count: -1 }
      });

      res.status(200).json(createSuccessResponse({ deletedId: lectureId }));
    } catch (error) {
      next(error);
    }
  }
}

export const adminLecturesController = new AdminLecturesController();
