import { Schema, model, Document, Types } from 'mongoose';
import { ROLES, UserRole } from '../common/constants/roles.constant';
import { GOVERNORATE_CODES, GovernorateCode } from '../common/constants/governorates.constant';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const ACCOUNT_LOCK_STATUSES = [
  'ACTIVE',
  'PENDING_DEVICE_APPROVAL',
  'SUSPENDED'
] as const;

export type AccountLockStatus = (typeof ACCOUNT_LOCK_STATUSES)[number];

export const DEVICE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type DeviceRequestStatus = (typeof DEVICE_REQUEST_STATUSES)[number];

/**
 * Approved Device Item Interface (Additive Whitelist)
 */
export interface IApprovedDevice {
  device_uuid: string;
  device_type: string;
  browser_info: string;
  ip_address?: string;
  approved_at: Date;
}

/**
 * Pending Device Request Interface
 */
export interface IPendingDeviceRequest {
  device_uuid: string;
  device_type: string;
  browser_info: string;
  ip_address?: string;
  requested_at: Date;
  status: DeviceRequestStatus;
}

/**
 * UI Preferences Interface
 */
export interface IUiPreferences {
  lang: 'en' | 'ar';
  theme: 'light' | 'dark';
}

/**
 * Unified User Document Interface
 */
export interface IUser {
  student_code?: string; // Sequential HAxxxx code (students only)
  google_id?: string;
  full_name: string;
  email?: string;
  role: UserRole;
  phone?: string;
  parent_phone?: string;
  is_profile_completed: boolean;

  // 5-Level Student Placement Taxonomy
  curriculum?: CurriculumType;
  grade_level?: GradeLevelType;
  academic_term?: AcademicTermType;

  country: string;
  governorate?: GovernorateCode | null;
  avatar_url?: string | null;

  // Multi-Device Whitelist (Additive)
  approved_devices: IApprovedDevice[];
  account_lock_status: AccountLockStatus;
  pending_device_req?: IPendingDeviceRequest | null;

  // Parent Multi-Child Linking
  linked_children: Types.ObjectId[];

  // Gamification & Access Control
  total_xp: number;
  is_leaderboard_hidden: boolean;
  has_active_subscription: boolean;

  // UI Preferences
  ui_preferences: IUiPreferences;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document<Types.ObjectId> {}

const ApprovedDeviceSchema = new Schema<IApprovedDevice>(
  {
    device_uuid: { type: String, required: true, trim: true },
    device_type: { type: String, required: true, trim: true },
    browser_info: { type: String, required: true, trim: true },
    ip_address: { type: String, trim: true },
    approved_at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const PendingDeviceSchema = new Schema<IPendingDeviceRequest>(
  {
    device_uuid: { type: String, required: true, trim: true },
    device_type: { type: String, required: true, trim: true },
    browser_info: { type: String, required: true, trim: true },
    ip_address: { type: String, trim: true },
    requested_at: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: DEVICE_REQUEST_STATUSES,
      default: 'PENDING'
    }
  },
  { _id: false }
);

const UserSchema = new Schema<IUserDocument>(
  {
    student_code: {
      type: String,
      unique: true,
      sparse: true, // Sparse because parents and super-admin do not hold student codes
      index: true,
      trim: true,
      match: [/^HA\d+$/, 'student_code must start with HA followed by digits only']
    },
    google_id: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      default: ROLES.STUDENT,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      index: true,
      required: function (this: IUserDocument) {
        return this.is_profile_completed === true;
      }
    },
    parent_phone: {
      type: String,
      trim: true,
      index: true
    },
    is_profile_completed: {
      type: Boolean,
      default: false,
      index: true
    },

    // --- 5-Level Hierarchy Student Placement (Curriculum -> Grade Level -> Active Term) ---
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: function (this: IUserDocument) {
        return this.role === ROLES.STUDENT && this.is_profile_completed === true;
      },
      index: true
    },
    grade_level: {
      type: String,
      enum: ALL_GRADE_LEVELS,
      required: function (this: IUserDocument) {
        return this.role === ROLES.STUDENT && this.is_profile_completed === true;
      },
      validate: {
        validator: function (this: IUserDocument, val: string | null | undefined): boolean {
          if (this.role !== ROLES.STUDENT || !this.is_profile_completed) return true;
          return isValidGradeForCurriculum(this.curriculum, val);
        },
        message: 'Selected grade_level does not belong to the chosen curriculum track.'
      },
      index: true
    },
    academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      default: 'TERM_1',
      required: function (this: IUserDocument) {
        return this.role === ROLES.STUDENT && this.is_profile_completed === true;
      },
      index: true
    },

    country: {
      type: String,
      default: 'EG',
      trim: true,
      maxlength: 50
    },
    governorate: {
      type: String,
      trim: true,
      validate: {
        validator: function (this: IUserDocument, val: string | null | undefined): boolean {
          // Conditional geographic rule: Required and saved ONLY if country is Egypt ('EG') and profile is completed
          if (this.role === ROLES.STUDENT && this.country === 'EG' && this.is_profile_completed === true) {
            return typeof val === 'string' && (GOVERNORATE_CODES as readonly string[]).includes(val);
          }
          return true;
        },
        message: 'Governorate is required and must be a valid Egyptian governorate for students in Egypt'
      },
      default: null
    },
    avatar_url: {
      type: String,
      default: null,
      trim: true
    },

    // --- Multi-Device Whitelist Architecture (Additive Approval) ---
    approved_devices: {
      type: [ApprovedDeviceSchema],
      default: []
    },
    account_lock_status: {
      type: String,
      enum: ACCOUNT_LOCK_STATUSES,
      default: 'ACTIVE',
      index: true
    },
    pending_device_req: {
      type: PendingDeviceSchema,
      default: null
    },

    // --- Parent Multi-Child Linking ---
    linked_children: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: []
      }
    ],

    // --- Gamification & Access Flags ---
    total_xp: {
      type: Number,
      default: 0,
      index: true
    },
    is_leaderboard_hidden: {
      type: Boolean,
      default: false
    },
    has_active_subscription: {
      type: Boolean,
      default: false,
      index: true
    },

    // --- UI Preferences ---
    ui_preferences: {
      lang: {
        type: String,
        enum: ['en', 'ar'],
        default: 'en'
      },
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound Indexes
UserSchema.index({ student_code: 1, parent_phone: 1 });
UserSchema.index({ 'approved_devices.device_uuid': 1 });

// 5-Level Leaderboard Compound Index scoped by Curriculum + Grade Level
UserSchema.index({
  role: 1,
  curriculum: 1,
  grade_level: 1,
  has_active_subscription: 1,
  is_leaderboard_hidden: 1,
  total_xp: -1
});

export const UserModel = model<IUserDocument>('User', UserSchema);
