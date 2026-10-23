import { Router } from 'express';
import { authController } from './controllers/auth.controller';
import { validateBody } from '../../middlewares/validate.middleware';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { deviceLockGuard } from '../../middlewares/device-lock.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';
import { googleLoginDtoSchema } from './dto/google-login.dto';
import { completeProfileDtoSchema } from './dto/complete-profile.dto';
import {
  parentActivateLoginDtoSchema,
  parentLinkChildDtoSchema
} from './dto/parent-auth.dto';
import { deviceDecisionDtoSchema } from './dto/device-decision.dto';

// Router for /api/v1/auth
export const authRouter = Router();

// Router for /api/v1/admin/device-requests
export const adminDeviceRouter = Router();

// =============================================================================
// Public & Student Auth Endpoints (/api/v1/auth)
// =============================================================================

/**
 * POST /api/v1/auth/google-login
 * Public endpoint: verifies Google ID Token, handles 1st device auto-approval vs 2nd device approval request.
 */
authRouter.post(
  '/google-login',
  validateBody(googleLoginDtoSchema),
  authController.googleLogin
);

/**
 * POST /api/v1/auth/student-code-login
 * Direct HA Code authentication for enrolled students.
 */
authRouter.post(
  '/student-code-login',
  authController.studentCodeLogin
);

/**
 * POST /api/v1/auth/complete-student-profile
 * Protected student endpoint: validates 5-level placement + governorate, generates atomic HAxxxx code.
 */
authRouter.post(
  '/complete-student-profile',
  authenticateJwt,
  deviceLockGuard,
  requireRoles(ROLES.STUDENT),
  validateBody(completeProfileDtoSchema),
  authController.completeStudentProfile
);

/**
 * POST /api/v1/auth/parent-activate-login
 * Public parent endpoint: matches parentPhone + studentCode (HAxxxx), links student and signs parent JWT.
 */
authRouter.post(
  '/parent-activate-login',
  validateBody(parentActivateLoginDtoSchema),
  authController.parentActivateLogin
);

/**
 * POST /api/v1/auth/parent/link-additional-child
 * Protected parent endpoint: links additional child to authenticated parent.
 */
authRouter.post(
  '/parent/link-additional-child',
  authenticateJwt,
  requireRoles(ROLES.PARENT),
  validateBody(parentLinkChildDtoSchema),
  authController.parentLinkAdditionalChild
);

// =============================================================================
// Super Admin Device Management Endpoints (/api/v1/admin/device-requests)
// =============================================================================

/**
 * GET /api/v1/admin/device-requests
 * Protected Super Admin endpoint: lists all pending device requests.
 */
adminDeviceRouter.get(
  '/',
  authenticateJwt,
  requireRoles(ROLES.SUPER_ADMIN),
  authController.getPendingDeviceRequests
);

/**
 * POST /api/v1/admin/device-requests/:studentId/decide
 * Protected Super Admin endpoint: approves additively via $push or rejects device request.
 */
adminDeviceRouter.post(
  '/:studentId/decide',
  authenticateJwt,
  requireRoles(ROLES.SUPER_ADMIN),
  validateBody(deviceDecisionDtoSchema),
  authController.decideDeviceRequest
);

// Router for /api/v1/admin/users
export const adminUsersRouter = Router();

adminUsersRouter.get(
  '/students',
  authController.getAllStudents
);
