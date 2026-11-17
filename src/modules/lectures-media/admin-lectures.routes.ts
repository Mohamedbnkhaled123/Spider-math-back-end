import { Router } from 'express';
import { adminLecturesController } from './controllers/admin-lectures.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

export const adminLecturesRouter = Router();

// Protect all admin lecture operations with JWT & SUPER_ADMIN role
adminLecturesRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

adminLecturesRouter.put('/reorder', adminLecturesController.reorderLectures);
adminLecturesRouter.post('/reorder', adminLecturesController.reorderLectures);
adminLecturesRouter.post('/', adminLecturesController.createLecture);
adminLecturesRouter.patch('/:id', adminLecturesController.updateLecture);
adminLecturesRouter.put('/:id', adminLecturesController.updateLecture);
adminLecturesRouter.patch('/:id/toggle-free', adminLecturesController.toggleLectureFree);
adminLecturesRouter.delete('/:id', adminLecturesController.deleteLecture);
