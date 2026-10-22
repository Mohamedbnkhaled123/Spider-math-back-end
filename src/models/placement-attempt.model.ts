import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const ACADEMIC_LEVEL_BADGES = [
  'EXCELLENT',
  'GOOD',
  'NEEDS_REVISION',
  'FOUNDATION_REQUIRED'
] as const;

export type AcademicLevelBadge = (typeof ACADEMIC_LEVEL_BADGES)[number];

export interface IPlacementAnswerItem {
  question_id: string;
  selected_option: number;
  is_correct: boolean;
}

export interface IPlacementAttempt {
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;
  answers: IPlacementAnswerItem[];
  total_questions: number;
  correct_count: number;
  score_percentage: number;
  academic_level_badge: AcademicLevelBadge;
  strengths_weaknesses: {
    strong_topics: string[];
    weak_topics: string[];
  };
  is_unlocked_by_auth: boolean;
  linked_lead_id?: Types.ObjectId | null;
  linked_user_id?: Types.ObjectId | null;
  expires_if_unclaimed_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlacementAttemptDocument extends IPlacementAttempt, Document<Types.ObjectId> {}

const PlacementAnswerItemSchema = new Schema<IPlacementAnswerItem>(
  {
    question_id: { type: String, required: true },
    selected_option: { type: Number, required: true },
    is_correct: { type: Boolean, required: true }
  },
  { _id: false }
);

const PlacementAttemptSchema = new Schema<IPlacementAttemptDocument>(
  {
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
      default: 'TERM_1',
      index: true
    },
    answers: {
      type: [PlacementAnswerItemSchema],
      default: []
    },
    total_questions: {
      type: Number,
      required: true,
      min: 1
    },
    correct_count: {
      type: Number,
      required: true,
      min: 0
    },
    score_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    academic_level_badge: {
      type: String,
      enum: ACADEMIC_LEVEL_BADGES,
      required: true,
      index: true
    },
    strengths_weaknesses: {
      strong_topics: { type: [String], default: [] },
      weak_topics: { type: [String], default: [] }
    },
    is_unlocked_by_auth: {
      type: Boolean,
      default: false,
      index: true
    },
    linked_lead_id: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true
    },
    linked_user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    expires_if_unclaimed_at: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48h from attempt
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// 48-Hour Partial TTL Index: Automatically deletes unclaimed attempts after 48 hours to conserve M0 quota
PlacementAttemptSchema.index(
  { expires_if_unclaimed_at: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { is_unlocked_by_auth: false }
  }
);

export const PlacementAttemptModel = model<IPlacementAttemptDocument>(
  'PlacementAttempt',
  PlacementAttemptSchema
);
