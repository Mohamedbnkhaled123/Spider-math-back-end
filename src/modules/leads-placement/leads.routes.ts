import { Router } from 'express';
import { leadsController } from './controllers/leads.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { validateRequest, validateBody } from '../../middlewares/validate.middleware';
import { ROLES } from '../../common/constants/roles.constant';
import { leadsFilterDtoSchema } from './dto/leads-filter.dto';
import { leadStatusDtoSchema } from './dto/lead-status.dto';

export const leadsRouter = Router();

// All leads routes require SUPER_ADMIN privileges
leadsRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

/**
 * GET /api/v1/admin/leads
 * Paginated and filterable Leads CRM list
 */
leadsRouter.get(
  '/',
  validateRequest({ query: leadsFilterDtoSchema }),
  leadsController.getLeads
);

/**
 * PATCH /api/v1/admin/leads/:id/status
 * State machine status updates
 */
leadsRouter.patch(
  '/:id/status',
  validateBody(leadStatusDtoSchema),
  leadsController.updateLeadStatus
);
