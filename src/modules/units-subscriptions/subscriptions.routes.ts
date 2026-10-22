import { Router } from 'express';
import { subscriptionsController } from './controllers/subscriptions.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { ROLES } from '../../common/constants/roles.constant';
import {
  whatsappSubRequestDtoSchema,
  activateSubscriptionDtoSchema,
  updateSubscriptionStatusDtoSchema
} from './dto/subscription.dto';

export const subscriptionsRouter = Router();
export const adminSubscriptionsRouter = Router();

// =============================================================================
// Student Subscription Requests (/api/v1/subscriptions)
// =============================================================================

subscriptionsRouter.post(
  '/whatsapp-request-link',
  authenticateJwt,
  requireRoles(ROLES.STUDENT),
  validateBody(whatsappSubRequestDtoSchema),
  subscriptionsController.generateWhatsAppRequestLink
);

// =============================================================================
// Super Admin Subscription Management (/api/v1/admin/subscriptions)
// =============================================================================

adminSubscriptionsRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

/**
 * POST /api/v1/admin/subscriptions/activate
 * One-click subscription activation.
 */
adminSubscriptionsRouter.post(
  '/activate',
  validateBody(activateSubscriptionDtoSchema),
  subscriptionsController.activateSubscription
);

/**
 * PATCH /api/v1/admin/subscriptions/:id/status
 * Enforces Subscription State Pattern (ACTIVE, FROZEN, EXPIRED, CANCELLED).
 */
adminSubscriptionsRouter.patch(
  '/:id/status',
  validateBody(updateSubscriptionStatusDtoSchema),
  subscriptionsController.updateSubscriptionStatus
);
