import { Request, Response, NextFunction } from 'express';
import { ParentService } from '../services/parent.service';

export class ParentController {
  constructor(private parentService: ParentService) {}

  /**
   * Retrieves all linked children for the parent with instant presence
   * GET /api/v1/parent/children-list
   */
  getChildrenList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.parentService.getChildrenList(req.user!.sub);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retrieves full academic and attendance report for a specific child
   * GET /api/v1/parent/child/:studentId/full-report
   */
  getChildFullReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.parentService.getChildFullReport(
        req.user!.sub,
        req.user!.role,
        req.params.studentId as string
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
