import { Router } from 'express';
import { cmsController } from './controllers/cms.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { ROLES } from '../../common/constants/roles.constant';
import { updateCmsDtoSchema } from './dto/update-cms.dto';

export const cmsRouter = Router();

// All CMS administration routes require SUPER_ADMIN privileges
cmsRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

/**
 * GET /api/v1/admin/cms-config
 * Retrieve CMS config
 */
cmsRouter.get('/', cmsController.getCmsConfig);

/**
 * PUT /api/v1/admin/cms-config
 * Update CMS config and invalidate cache
 */
cmsRouter.put('/', validateBody(updateCmsDtoSchema), cmsController.updateCmsConfig);
