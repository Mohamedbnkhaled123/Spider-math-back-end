import { Request, Response, NextFunction } from 'express';
import { GamificationService } from '../services/gamification.service';
import { leaderboardQueryDtoSchema } from '../dto/leaderboard-query.dto';
import { adjustXpDtoSchema } from '../dto/adjust-xp.dto';

export class GamificationController {
  constructor(private gamificationService: GamificationService) {}

  /**
   * Retrieves 5-level leaderboard top students
   * GET /api/v1/gamification/leaderboard?curriculum=EGYPTIAN&gradeLevel=SEC_3
   */
  getLeaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = leaderboardQueryDtoSchema.parse(req.query);
      const result = await this.gamificationService.getLeaderboard(query);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Adjusts student XP and leaderboard visibility
   * POST /api/v1/admin/gamification/adjust-xp
   */
  adjustStudentXp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = adjustXpDtoSchema.parse(req.body);
      const result = await this.gamificationService.adjustStudentXp(req.user!.sub, dto);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };
}
