import { Router } from 'express';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './controllers/notifications.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';

const notificationsService = new NotificationsService();
export const notificationsController = new NotificationsController(notificationsService);

export const notificationsRouter = Router();

// All notification routes require authenticated user
notificationsRouter.use(authenticateJwt);

// Get paginated notifications
notificationsRouter.get('/', notificationsController.getUserNotifications);

// Mark all as read
notificationsRouter.patch('/read-all', notificationsController.markAllAsRead);

// Mark single notification as read
notificationsRouter.patch('/:id/read', notificationsController.markAsRead);
