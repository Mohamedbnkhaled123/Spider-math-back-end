import { Request, Response, NextFunction } from 'express';
import { AssessmentsService } from '../services/assessments.service';
import { CloudinarySignedUploadAdapter, UploadTargetType } from '../adapters/cloudinary-signed-upload.adapter';
import { createAssessmentDtoSchema } from '../dto/assessment-create.dto';
import { updateAssessmentDtoSchema } from '../dto/assessment-update.dto';
import { submissionSyncDtoSchema } from '../dto/submission-sync.dto';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  /**
   * Issues signed Cloudinary parameters for direct client-to-CDN upload (<= 150KB WebP)
   * GET /api/v1/assessments/upload-signature?target=question|homework
   */
  getUploadSignature = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = req.query.target as UploadTargetType;
      if (!target || (target !== 'question' && target !== 'homework')) {
        throw new AppError(
          'Query param "target" must be either "question" or "homework"',
          400,
          ERROR_CODES.BAD_REQUEST_400
        );
      }

      const signatureData = CloudinarySignedUploadAdapter.generateSignature(target, req.user!.role);
      res.status(200).json({
        success: true,
        data: signatureData
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Creates a new assessment in Admin Studio
   * POST /api/v1/admin/assessments
   */
  createAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = createAssessmentDtoSchema.parse(req.body);
      const assessment = await this.assessmentsService.createAssessment(req.user!.sub, dto);
      res.status(201).json({
        success: true,
        data: assessment
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Updates an assessment with safe mid-exam editing & auto-regrade
   * PATCH /api/v1/admin/assessments/:id
   */
  updateAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = updateAssessmentDtoSchema.parse(req.body);
      const assessment = await this.assessmentsService.updateAssessment(
        req.user!.sub,
        req.params.id as string,
        dto
      );
      res.status(200).json({
        success: true,
        data: assessment
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Starts an assessment attempt, pre-caches sanitized questions
   * POST /api/v1/assessments/:id/start-and-cache
   */
  startAndCacheAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientStartedAt = req.body.client_started_at;
      const result = await this.assessmentsService.startAndCacheAssessment(
        req.user!.sub,
        req.user!.role,
        req.params.id as string,
        clientStartedAt
      );
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Syncs and grades an assessment submission (500-Concurrent Request Shield)
   * POST /api/v1/assessments/:id/sync-submission
   */
  syncSubmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = submissionSyncDtoSchema.parse(req.body);
      const result = await this.assessmentsService.syncSubmission(
        req.user!.sub,
        req.params.id as string,
        dto
      );
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };
}
