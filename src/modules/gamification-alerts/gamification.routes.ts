import { Router } from 'express';
import { GamificationService } from './services/gamification.service';
import { GamificationController } from './controllers/gamification.controller';
import { authenticateJwt, optionalAuthenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

const gamificationService = new GamificationService();
export const gamificationController = new GamificationController(gamificationService);

// 1. Public / Student Gamification Router (/api/v1/gamification)
export const gamificationRouter = Router();

// Fast compound-index leaderboard query (< 5ms)
gamificationRouter.get(
  '/leaderboard',
  optionalAuthenticateJwt,
  gamificationController.getLeaderboard
);

// 2. Admin Gamification Router (/api/v1/admin/gamification)
export const adminGamificationRouter = Router();

// Manual XP adjustments, penalties, and leaderboard hiding
adminGamificationRouter.post(
  '/adjust-xp',
  authenticateJwt,
  requireRoles(ROLES.SUPER_ADMIN),
  gamificationController.adjustStudentXp
);
