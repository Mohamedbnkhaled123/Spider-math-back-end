import { Types } from 'mongoose';
import { NotificationModel, INotificationDocument } from '../../../models/notification.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

export interface IGetNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export class NotificationsService {
  /**
   * Retrieves paginated notifications for the authenticated user.
   * GET /api/v1/notifications
   */
  async getUserNotifications(userId: string, query: IGetNotificationsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      recipient_id: new Types.ObjectId(userId)
    };

    if (query.unreadOnly) {
      filter.is_read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({
        recipient_id: new Types.ObjectId(userId),
        is_read: false
      })
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Marks a specific notification as read.
   * PATCH /api/v1/notifications/:id/read
   */
  async markAsRead(userId: string, notificationId: string): Promise<INotificationDocument> {
    const notification = await NotificationModel.findOne({
      _id: new Types.ObjectId(notificationId),
      recipient_id: new Types.ObjectId(userId)
    });

    if (!notification) {
      throw new AppError('Notification not found', 404, ERROR_CODES.NOT_FOUND_404);
    }

    notification.is_read = true;
    await notification.save();

    return notification;
  }

  /**
   * Marks all unread notifications as read for the user.
   * PATCH /api/v1/notifications/read-all
   */
  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await NotificationModel.updateMany(
      {
        recipient_id: new Types.ObjectId(userId),
        is_read: false
      },
      {
        $set: { is_read: true }
      }
    );

    return { modifiedCount: result.modifiedCount };
  }
}
