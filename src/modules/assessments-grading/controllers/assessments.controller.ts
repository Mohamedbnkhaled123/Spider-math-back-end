import { Request, Response, NextFunction } from 'express';
import { AssessmentsService } from '../services/assessments.service';
import { CloudinarySignedUploadAdapter, UploadTargetType } from '../adapters/cloudinary-signed-upload.adapter';
import { createAssessmentDtoSchema } from '../dto/assessment-create.dto';
import { updateAssessmentDtoSchema } from '../dto/assessment-update.dto';
import { submissionSyncDtoSchema } from '../dto/submission-sync.dto';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES } from '../../../common/constants/roles.constant';

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

  /**
   * Deletes an assessment in Admin Studio
   * DELETE /api/v1/admin/assessments/:id
   */
  deleteAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.assessmentsService.deleteAssessment(req.params.id as string);
      res.status(200).json({
        success: true,
        message: 'Assessment deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Lists assessments with optional filters
   * GET /api/v1/assessments
   */
  getAssessments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;
      const assessments = await this.assessmentsService.getAssessments(
        {
          unitPackageId: (req.query.unitPackageId || req.query.unit_package_id) as string,
          curriculum: req.query.curriculum as string,
          gradeLevel: (req.query.gradeLevel || req.query.grade_level) as string,
          academicTerm: (req.query.academicTerm || req.query.academic_term || req.query.term) as string,
          isPublished: req.query.isPublished ? req.query.isPublished === 'true' : undefined,
          studentId: req.user?.sub
        },
        isSuperAdmin
      );
      res.status(200).json({
        success: true,
        data: assessments
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Gets a single assessment by ID
   * GET /api/v1/assessments/:id
   */
  getAssessmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;
      const assessment = await this.assessmentsService.getAssessmentById(
        req.params.id as string,
        isSuperAdmin,
        req.user?.sub
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
   * Retrieves full submission feedback for student or parent
   * GET /api/v1/assessments/submissions/:id/feedback
   */
  getSubmissionFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feedback = await this.assessmentsService.getSubmissionFeedback(
        req.user!.sub,
        req.user!.role,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: feedback
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retrieves all submissions for the logged in student
   * GET /api/v1/assessments/my-submissions
   */
  getMySubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submissions = await this.assessmentsService.getMySubmissions(req.user!.sub);
      res.status(200).json({
        success: true,
        data: submissions
      });
    } catch (error) {
      next(error);
    }
  };
}

