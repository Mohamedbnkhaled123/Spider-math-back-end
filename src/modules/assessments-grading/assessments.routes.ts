import { Router } from 'express';
import { AssessmentsService } from './services/assessments.service';
import { GradingService } from './services/grading.service';
import { AssessmentsController } from './controllers/assessments.controller';
import { GradingController } from './controllers/grading.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { deviceLockGuard } from '../../middlewares/device-lock.middleware';
import { authorizeRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

// Instantiate Services
const assessmentsService = new AssessmentsService();
const gradingService = new GradingService();

// Instantiate Controllers
export const assessmentsController = new AssessmentsController(assessmentsService);
export const gradingController = new GradingController(gradingService);

// 1. Student / Public Assessment Routers (/api/v1/assessments)
export const assessmentsRouter = Router();

// Upload signature for direct client-to-CDN upload (<= 150KB WebP)
// Target 'question' requires SUPER_ADMIN; Target 'homework' requires STUDENT (enforced in adapter)
assessmentsRouter.get(
  '/upload-signature',
  authenticateJwt,
  deviceLockGuard,
  assessmentsController.getUploadSignature
);

// Start assessment attempt & pre-cache sanitized questions
assessmentsRouter.post(
  '/:id/start-and-cache',
  authenticateJwt,
  deviceLockGuard,
  assessmentsController.startAndCacheAssessment
);

// Synchronize and grade assessment attempt (500-Concurrent Request Shield)
assessmentsRouter.post(
  '/:id/sync-submission',
  authenticateJwt,
  deviceLockGuard,
  assessmentsController.syncSubmission
);

// Get submission feedback and mistake breakdown
assessmentsRouter.get(
  '/submissions/:id/feedback',
  authenticateJwt,
  assessmentsController.getSubmissionFeedback
);

// List assessments with filters
assessmentsRouter.get(
  '/',
  authenticateJwt,
  assessmentsController.getAssessments
);

// Get single assessment details
assessmentsRouter.get(
  '/:id',
  authenticateJwt,
  assessmentsController.getAssessmentById
);

// 2. Admin Assessments Router (/api/v1/admin/assessments)
export const adminAssessmentsRouter = Router();

adminAssessmentsRouter.get(
  '/',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  assessmentsController.getAssessments
);

adminAssessmentsRouter.post(
  '/',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  assessmentsController.createAssessment
);

adminAssessmentsRouter.patch(
  '/:id',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  assessmentsController.updateAssessment
);

adminAssessmentsRouter.delete(
  '/:id',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  assessmentsController.deleteAssessment
);

// 3. Admin Submissions Router (/api/v1/admin/submissions)
export const adminSubmissionsRouter = Router();

adminSubmissionsRouter.get(
  '/',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  gradingController.getAllSubmissions
);

adminSubmissionsRouter.get(
  '/pending-review',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  gradingController.getPendingSubmissions
);

adminSubmissionsRouter.post(
  '/:id/grade',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  gradingController.gradeSubmission
);
