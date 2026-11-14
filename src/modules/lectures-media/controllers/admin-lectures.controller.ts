import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { CryptoProxyService } from '../../../common/utils/crypto.util';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { fetchYouTubeVideoDurationSec } from '../utils/youtube-duration.util';
import { publicCmsCache } from '../../../config/cache.config';

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
        isFreeTrial,
        xpReward
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

      const pdfMaterials: any[] = [];
      if (Array.isArray(req.body.pdfMaterials) && req.body.pdfMaterials.length > 0) {
        pdfMaterials.push(
          ...req.body.pdfMaterials
            .map((p: any) => ({
              title: p.title || `ملخص ومذكرة: ${titleAr.trim()}`,
              storage_file_id: (p.storage_file_id || p.storageFileId || p.fileId || '').trim(),
              google_drive_url: (p.google_drive_url || p.googleDriveUrl || '').trim(),
              is_print_allowed: p.is_print_allowed !== undefined ? !!p.is_print_allowed : (p.isPrintAllowed !== undefined ? !!p.isPrintAllowed : !!isPrintAllowed),
              pages_count: Number(p.pages_count || p.pagesCount || 1)
            }))
            .filter((p: any) => p.storage_file_id)
        );
      } else if (googleDrivePdfFileId && googleDrivePdfFileId.trim()) {
        pdfMaterials.push({
          title: `ملخص ومذكرة: ${titleAr.trim()}`,
          storage_file_id: googleDrivePdfFileId.trim(),
          is_print_allowed: !!isPrintAllowed,
          pages_count: 1
        });
      }

      const rawYoutube = youtubeUrl ? youtubeUrl.trim() : '';
      let cleanVideoId = '';
      let encryptedYoutube = '';
      let durationSec = 0;

      if (rawYoutube) {
        cleanVideoId = CryptoProxyService.extractYoutubeId(rawYoutube);
        if (!cleanVideoId) {
          throw new AppError('يرجى إدخال رابط يوتيوب صالح للشرح (YouTube Video URL is invalid)', 400, ERROR_CODES.BAD_REQUEST_400);
        }
        encryptedYoutube = CryptoProxyService.encrypt(cleanVideoId);
        durationSec = durationMinutes ? Math.max(0, Math.round(Number(durationMinutes) * 60)) : 300;
        try {
          const ytDuration = await fetchYouTubeVideoDurationSec(cleanVideoId);
          if (ytDuration && ytDuration > 0) {
            durationSec = ytDuration;
          }
        } catch {
          // Keep durationSec fallback
        }
      }

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
        video_duration_sec: durationSec,
        completion_threshold_pct: 85,
        xp_reward_on_complete: xpReward !== undefined ? Number(xpReward) : 50,
        pdf_materials: pdfMaterials,
        google_drive_pdf_id: googleDrivePdfFileId ? googleDrivePdfFileId.trim() : '',
        is_print_allowed: !!isPrintAllowed,
        is_free: req.body.isFree !== undefined ? !!req.body.isFree : (req.body.is_free !== undefined ? !!req.body.is_free : !!isFreeTrial),
        is_free_trial: req.body.isFree !== undefined ? !!req.body.isFree : (req.body.is_free !== undefined ? !!req.body.is_free : !!isFreeTrial),
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
        isPublished,
        xpReward
      } = req.body;

      const lecture = await LectureMaterialModel.findById(lectureId);
      if (!lecture) {
        throw new AppError('Lecture not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
      }

      if (titleAr) lecture.lecture_title_ar = titleAr.trim();
      if (titleEn) lecture.lecture_title_en = titleEn.trim();
      const updatedFree = req.body.isFree !== undefined ? !!req.body.isFree : (req.body.is_free !== undefined ? !!req.body.is_free : (isFreeTrial !== undefined ? !!isFreeTrial : undefined));
      if (updatedFree !== undefined) {
        lecture.is_free = updatedFree;
        lecture.is_free_trial = updatedFree;
      }
      if (isPublished !== undefined) lecture.is_published = isPublished;
      if (xpReward !== undefined) lecture.xp_reward_on_complete = Number(xpReward);

      if (youtubeUrl !== undefined) {
        const rawYt = youtubeUrl ? youtubeUrl.trim() : '';
        if (rawYt) {
          const cleanVideoId = CryptoProxyService.extractYoutubeId(rawYt);
          if (!cleanVideoId) {
            throw new AppError('يرجى إدخال رابط يوتيوب صالح للشرح (YouTube Video URL is invalid or ID could not be extracted)', 400, ERROR_CODES.BAD_REQUEST_400);
          }
          lecture.youtube_encrypted_id = CryptoProxyService.encrypt(cleanVideoId);
          lecture.youtube_video_id = cleanVideoId;
          lecture.youtube_url = rawYt;
          try {
            const ytDuration = await fetchYouTubeVideoDurationSec(cleanVideoId);
            if (ytDuration && ytDuration > 0) {
              lecture.video_duration_sec = ytDuration;
            } else if (durationMinutes) {
              lecture.video_duration_sec = Math.round(Number(durationMinutes) * 60);
            }
          } catch {
            if (durationMinutes) {
              lecture.video_duration_sec = Math.round(Number(durationMinutes) * 60);
            }
          }
        } else {
          // YouTube URL was intentionally cleared -> lecture has no video (files only)
          lecture.youtube_encrypted_id = '';
          lecture.youtube_video_id = '';
          lecture.youtube_url = '';
          lecture.video_duration_sec = 0;
        }
      } else if (durationMinutes && (lecture.youtube_video_id || lecture.youtube_url)) {
        lecture.video_duration_sec = Math.round(Number(durationMinutes) * 60);
      }

      if (req.body.pdfMaterials !== undefined && Array.isArray(req.body.pdfMaterials)) {
        lecture.pdf_materials = req.body.pdfMaterials.map((p: any) => ({
          title: p.title || `ملخص ومذكرة: ${lecture.lecture_title_ar}`,
          storage_file_id: (p.storage_file_id || p.storageFileId || p.fileId || '').trim(),
          google_drive_url: (p.google_drive_url || p.googleDriveUrl || '').trim(),
          is_print_allowed: p.is_print_allowed !== undefined ? !!p.is_print_allowed : (p.isPrintAllowed !== undefined ? !!p.isPrintAllowed : !!lecture.is_print_allowed),
          pages_count: Number(p.pages_count || p.pagesCount || 1)
        })).filter((p: any) => p.storage_file_id);
        if (lecture.pdf_materials.length > 0) {
          lecture.google_drive_pdf_id = lecture.pdf_materials[0].storage_file_id;
        }
      } else if (googleDrivePdfFileId !== undefined) {
        lecture.google_drive_pdf_id = googleDrivePdfFileId ? googleDrivePdfFileId.trim() : '';
        if (googleDrivePdfFileId && googleDrivePdfFileId.trim()) {
          lecture.pdf_materials = [
            {
              title: `ملخص ومذكرة: ${lecture.lecture_title_ar}`,
              storage_file_id: googleDrivePdfFileId.trim(),
              is_print_allowed: isPrintAllowed !== undefined ? !!isPrintAllowed : (lecture.is_print_allowed ?? true),
              pages_count: 1
            } as any
          ];
        } else {
          lecture.pdf_materials = [];
        }
      }

      if (isPrintAllowed !== undefined) {
        lecture.is_print_allowed = !!isPrintAllowed;
        if (lecture.pdf_materials && lecture.pdf_materials.length > 0) {
          lecture.pdf_materials.forEach((p: any) => {
            p.is_print_allowed = !!isPrintAllowed;
          });
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

  /**
   * PATCH /api/v1/admin/lectures/:id/toggle-free or /api/v1/lectures/:id/toggle-free
   */
  public async toggleLectureFree(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id;
      if (!lectureId || !Types.ObjectId.isValid(lectureId)) {
        throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      const lecture = await LectureMaterialModel.findById(lectureId);
      if (!lecture) {
        throw new AppError('Lecture not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
      }

      const newStatus = !(lecture.is_free || lecture.is_free_trial);
      lecture.is_free = newStatus;
      lecture.is_free_trial = newStatus;
      await lecture.save();

      publicCmsCache.clear();

      res.status(200).json({
        success: true,
        data: lecture,
        message: newStatus
          ? 'تم تفعيل إتاحة المحاضرة مجاناً لجميع الطلاب'
          : 'تم قفل المحاضرة لتكون خاصة بالطلاب المشتركين فقط'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminLecturesController = new AdminLecturesController();
