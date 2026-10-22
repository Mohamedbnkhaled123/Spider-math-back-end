import { Request, Response, NextFunction } from 'express';
import { NotificationsService } from '../services/notifications.service';

export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  /**
   * Retrieves paginated notifications for the user
   * GET /api/v1/notifications
   */
  getUserNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await this.notificationsService.getUserNotifications(req.user!.sub, {
        page,
        limit,
        unreadOnly
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Marks a single notification as read
   * PATCH /api/v1/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.notificationsService.markAsRead(
        req.user!.sub,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Marks all notifications as read
   * PATCH /api/v1/notifications/read-all
   */
  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.notificationsService.markAllAsRead(req.user!.sub);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };
}
