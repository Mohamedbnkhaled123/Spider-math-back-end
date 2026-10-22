import { Schema, model, Document, Types } from 'mongoose';
import { ROLES, UserRole } from '../common/constants/roles.constant';

export const ALERT_CATEGORIES = [
  'STUDENT_NEW_LECTURE',
  'STUDENT_NEW_ASSESSMENT',
  'STUDENT_UNIT_ACTIVATED',
  'STUDENT_HOMEWORK_GRADED',
  'STUDENT_SUBSCRIPTION_EXPIRING',
  'ADMIN_NEW_LEAD_INSTANT',
  'ADMIN_DEVICE_APPROVAL_REQ',
  'ADMIN_BATCHED_SUBMISSIONS'
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export interface INotification {
  recipient_id: Types.ObjectId;
  recipient_role: UserRole;
  alert_category: AlertCategory;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  action_url?: string | null;
  youtube_solution_url?: string | null; // Unprotected YouTube Solution Link
  batch_counter: number;
  is_read: boolean;
  created_at: Date;
}

export interface INotificationDocument extends INotification, Document<Types.ObjectId> {}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    recipient_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    recipient_role: {
      type: String,
      enum: Object.values(ROLES),
      required: true
    },
    alert_category: {
      type: String,
      enum: ALERT_CATEGORIES,
      required: true,
      index: true
    },
    title_ar: {
      type: String,
      required: true,
      trim: true
    },
    title_en: {
      type: String,
      required: true,
      trim: true
    },
    body_ar: {
      type: String,
      required: true,
      trim: true
    },
    body_en: {
      type: String,
      required: true,
      trim: true
    },
    action_url: {
      type: String,
      default: null,
      trim: true
    },
    youtube_solution_url: {
      type: String,
      default: null,
      trim: true
    },
    batch_counter: {
      type: Number,
      default: 1,
      min: 1
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true
    },
    created_at: {
      type: Date,
      default: Date.now,
      expires: 2592000 // 30-day rolling TTL auto-purge (MongoDB M0 free tier shield)
    }
  },
  {
    versionKey: false,
    timestamps: false // Managed via created_at TTL index
  }
);

// Fast unread & chronological notification queries
NotificationSchema.index({ recipient_id: 1, is_read: 1, created_at: -1 });

export const NotificationModel = model<INotificationDocument>(
  'Notification',
  NotificationSchema
);
