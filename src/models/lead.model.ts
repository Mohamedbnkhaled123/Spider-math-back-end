import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED_WHATSAPP',
  'CONVERTED_SUBSCRIBER',
  'ARCHIVED'
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface ILead {
  placement_test_attempt_id: Types.ObjectId;
  user_id?: Types.ObjectId | null;
  google_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;
  placement_score_pct: number;
  lead_status: LeadStatus;
  admin_notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadDocument extends ILead, Document<Types.ObjectId> {}

const LeadSchema = new Schema<ILeadDocument>(
  {
    placement_test_attempt_id: {
      type: Schema.Types.ObjectId,
      ref: 'PlacementAttempt',
      required: true,
      index: true
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    google_id: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      default: null
    },
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: true,
      index: true
    },
    grade_level: {
      type: String,
      enum: ALL_GRADE_LEVELS,
      required: true,
      index: true
    },
    academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      default: 'TERM_1'
    },
    placement_score_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    lead_status: {
      type: String,
      enum: LEAD_STATUSES,
      default: 'NEW',
      index: true
    },
    admin_notes: {
      type: String,
      maxlength: 500,
      default: ''
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound Index for Admin Leads CRM view scoped by curriculum and grade
LeadSchema.index({ curriculum: 1, grade_level: 1, lead_status: 1, createdAt: -1 });

export const LeadModel = model<ILeadDocument>('Lead', LeadSchema);
