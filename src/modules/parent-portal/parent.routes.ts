import { Router } from 'express';
import { ParentService } from './services/parent.service';
import { ParentController } from './controllers/parent.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

const parentService = new ParentService();
export const parentController = new ParentController(parentService);

export const parentRouter = Router();

// Parent portal routes require PARENT or SUPER_ADMIN role
parentRouter.use(authenticateJwt, requireRoles(ROLES.PARENT, ROLES.SUPER_ADMIN));

// List of linked children with live presence status
parentRouter.get('/children-list', parentController.getChildrenList);

// Comprehensive academic report for a specific child
parentRouter.get('/child/:studentId/full-report', parentController.getChildFullReport);
