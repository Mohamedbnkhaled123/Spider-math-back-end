import { Schema, model, Document, Types } from 'mongoose';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'FROZEN',
  'EXPIRED',
  'CANCELLED'
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface ISubscription {
  student_id: Types.ObjectId;
  student_code: string; // Denormalized HAxxxx code for fast query & verification
  unit_package_id: Types.ObjectId;

  // Denormalized hierarchy fields for instant student/admin filtering without $lookup
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;

  subscription_status: SubscriptionStatus;
  price_paid_egp: number;
  activated_by: Types.ObjectId; // Super Admin user ID
  activated_at: Date;
  expires_at: Date;
  expiry_warning_sent: boolean;
  freeze_reason?: string | null;
  frozen_at?: Date | null;
  frozen_days_remaining?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionDocument extends ISubscription, Document<Types.ObjectId> {}

/**
 * Validates State Machine transitions for Subscriptions according to RULES.md (Section 4.3)
 */
export function assertValidSubscriptionTransition(
  currentStatus: SubscriptionStatus,
  nextStatus: SubscriptionStatus
): void {
  if (currentStatus === nextStatus) return;

  const allowedTransitions: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
    ACTIVE: ['FROZEN', 'EXPIRED', 'CANCELLED'],
    FROZEN: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    EXPIRED: ['CANCELLED'], // Once expired, cannot be frozen. Requires new activation.
    CANCELLED: [] // Terminal state. Never transition back to ACTIVE.
  };

  const allowed = allowedTransitions[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Illegal subscription transition from "${currentStatus}" to "${nextStatus}". Expired/Cancelled subscriptions require a new activation record.`,
      400,
      ERROR_CODES.INVALID_STATE_TRANSITION_400,
      { currentStatus, nextStatus, allowedTransitions: allowed }
    );
  }
}

const SubscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    student_code: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    unit_package_id: {
      type: Schema.Types.ObjectId,
      ref: 'UnitPackage',
      required: true,
      index: true
    },

    // Denormalized hierarchy context
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: true
    },
    grade_level: {
      type: String,
      enum: ALL_GRADE_LEVELS,
      required: true
    },
    academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      required: true
    },

    subscription_status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'ACTIVE',
      index: true
    },
    price_paid_egp: {
      type: Number,
      required: true,
      min: 0
    },
    activated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    activated_at: {
      type: Date,
      default: Date.now,
      required: true
    },
    expires_at: {
      type: Date,
      required: true,
      index: true
    },
    expiry_warning_sent: {
      type: Boolean,
      default: false
    },
    freeze_reason: {
      type: String,
      default: null
    },
    frozen_at: {
      type: Date,
      default: null
    },
    frozen_days_remaining: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Unique compound index: One subscription per student per unit package
SubscriptionSchema.index({ student_id: 1, unit_package_id: 1 }, { unique: true });

// Scoped filter compound index for instant portal access check without $lookup
SubscriptionSchema.index({
  student_id: 1,
  curriculum: 1,
  grade_level: 1,
  academic_term: 1,
  subscription_status: 1
});

// Fast lookup by student code
SubscriptionSchema.index({ student_code: 1, subscription_status: 1 });

export const SubscriptionModel = model<ISubscriptionDocument>('Subscription', SubscriptionSchema);
