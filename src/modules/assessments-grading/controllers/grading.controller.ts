import { Request, Response, NextFunction } from 'express';
import { GradingService } from '../services/grading.service';
import { gradeSubmissionDtoSchema } from '../dto/grade-submission.dto';

export class GradingController {
  constructor(private gradingService: GradingService) {}

  /**
   * Retrieves all quiz submissions with filters and analytics
   * GET /api/v1/admin/submissions
   */
  getAllSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessmentId = req.query.assessmentId as string | undefined;
      const curriculum = req.query.curriculum as string | undefined;
      const gradeLevel = req.query.gradeLevel as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await this.gradingService.getAllSubmissions({
        assessmentId,
        curriculum,
        gradeLevel,
        status,
        search,
        page,
        limit
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retrieves submissions pending manual grading review
   * GET /api/v1/admin/submissions/pending-review
   */
  getPendingSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessmentId = req.query.assessmentId as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await this.gradingService.getPendingSubmissions({
        assessmentId,
        page,
        limit
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Grades a submission, records custom mistake notes & YouTube solution links, and awards XP
   * POST /api/v1/admin/submissions/:id/grade
   */
  gradeSubmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = gradeSubmissionDtoSchema.parse(req.body);
      const submission = await this.gradingService.gradeSubmission(
        req.user!.sub,
        req.params.id as string,
        dto
      );

      res.status(200).json({
        success: true,
        data: submission
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Approves and publishes a submission with one click
   * POST /api/v1/admin/submissions/:id/approve
   */
  approveSubmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submission = await this.gradingService.approveSubmission(
        req.user!.sub,
        req.params.id as string
      );

      res.status(200).json({
        success: true,
        data: submission
      });
    } catch (error) {
      next(error);
    }
  };
}
