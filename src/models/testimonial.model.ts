import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  CurriculumType,
  GradeLevelType
} from '../common/constants/curriculum-hierarchy.constant';

export const TESTIMONIAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type TestimonialStatus = (typeof TESTIMONIAL_STATUSES)[number];

export const AUTHOR_ROLES = ['STUDENT', 'PARENT'] as const;
export type AuthorRole = (typeof AUTHOR_ROLES)[number];

export interface ITestimonial {
  user_id: Types.ObjectId;
  author_name: string;
  author_role: AuthorRole;
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  student_stage: string;
  student_grade: string;
  review_text: string;
  rating: number;
  is_approved: boolean;
  status: TestimonialStatus;
  approved_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITestimonialDocument extends ITestimonial, Document<Types.ObjectId> {}

const TestimonialSchema = new Schema<ITestimonialDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    author_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    author_role: {
      type: String,
      enum: AUTHOR_ROLES,
      required: true,
      index: true
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
    student_stage: {
      type: String,
      default: '',
      trim: true,
      maxlength: 150
    },
    student_grade: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },
    review_text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 5
    },
    is_approved: {
      type: Boolean,
      default: false,
      index: true
    },
    status: {
      type: String,
      enum: TESTIMONIAL_STATUSES,
      default: 'PENDING',
      index: true
    },
    approved_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

TestimonialSchema.index({ is_approved: 1, createdAt: -1 });

export const TestimonialModel = model<ITestimonialDocument>('Testimonial', TestimonialSchema);
