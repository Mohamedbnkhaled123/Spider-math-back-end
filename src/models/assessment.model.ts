import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const ASSESSMENT_TYPES = ['QUIZ', 'HOMEWORK', 'COMPREHENSIVE_EXAM'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const QUESTION_TYPES = ['MCQ', 'ESSAY_PHOTO'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// Graphing calculator options strictly limited to NONE or DESMOS (GeoGebra completely excluded)
export const GRAPH_CALCULATORS = ['NONE', 'DESMOS'] as const;
export type GraphCalculatorType = (typeof GRAPH_CALCULATORS)[number];

/**
 * Embedded Question Item Schema
 */
export interface IQuestionItem {
  _id?: Types.ObjectId;
  question_type: QuestionType;
  question_text: string;

  // Direct Teacher Device Upload -> Compressed to WebP <= 150KB -> Cloudinary ('spider-math-questions/')
  question_image_url?: string | null;
  question_image_size_kb?: number | null;

  options: string[];
  correct_option_index?: number; // Stripped by default (select: false)
  points: number;
  model_answer_text?: string; // Stripped by default (select: false)
  youtube_solution_url?: string | null; // Unprotected YouTube solution URL (select: false)
}

export interface IAssessment {
  unit_package_id?: Types.ObjectId | null;
  lecture_id?: Types.ObjectId | null;
  is_placement_test?: boolean;

  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;

  title_ar: string;
  title_en: string;
  assessment_type: AssessmentType;
  time_limit_minutes: number;
  min_expected_solve_sec: number; // Anti-cheat baseline timing
  max_attempts: number;
  available_from?: Date | null;
  available_until?: Date | null;

  graph_calculator: GraphCalculatorType;
  has_essay_questions: boolean;
  total_points: number;
  xp_reward: number;
  is_published: boolean;

  questions: IQuestionItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssessmentDocument extends IAssessment, Document<Types.ObjectId> {}

const QuestionItemSchema = new Schema<IQuestionItem>(
  {
    question_type: {
      type: String,
      enum: QUESTION_TYPES,
      required: true
    },
    question_text: {
      type: String,
      required: true,
      trim: true
    },
    question_image_url: {
      type: String,
      default: null,
      trim: true
    },
    question_image_size_kb: {
      type: Number,
      default: null
    },
    options: {
      type: [String],
      default: []
    },
    correct_option_index: {
      type: Number,
      select: false // Zero answer leakage: hidden from student API queries by default
    },
    points: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    model_answer_text: {
      type: String,
      select: false
    },
    youtube_solution_url: {
      type: String,
      default: null,
      select: false,
      trim: true
    }
  },
  { _id: true }
);

const AssessmentSchema = new Schema<IAssessmentDocument>(
  {
    unit_package_id: {
      type: Schema.Types.ObjectId,
      ref: 'UnitPackage',
      required: function (this: IAssessmentDocument) {
        return !this.is_placement_test;
      },
      default: null,
      index: true
    },
    is_placement_test: {
      type: Boolean,
      default: false,
      index: true
    },
    lecture_id: {
      type: Schema.Types.ObjectId,
      ref: 'LectureMaterial',
      default: null,
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
    academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      required: true,
      index: true
    },

    title_ar: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    title_en: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    assessment_type: {
      type: String,
      enum: ASSESSMENT_TYPES,
      required: true,
      index: true
    },
    time_limit_minutes: {
      type: Number,
      required: true,
      default: 30,
      min: 1
    },
    min_expected_solve_sec: {
      type: Number,
      default: 120, // Anti-cheat solve threshold
      min: 10
    },
    max_attempts: {
      type: Number,
      default: 1,
      min: 1
    },
    available_from: {
      type: Date,
      default: null
    },
    available_until: {
      type: Date,
      default: null
    },

    graph_calculator: {
      type: String,
      enum: GRAPH_CALCULATORS,
      default: 'NONE'
    },
    has_essay_questions: {
      type: Boolean,
      default: false
    },
    total_points: {
      type: Number,
      required: true,
      min: 1
    },
    xp_reward: {
      type: Number,
      default: 30,
      min: 0
    },
    is_published: {
      type: Boolean,
      default: true,
      index: true
    },
    questions: {
      type: [QuestionItemSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Unit & Lesson Quizzes/Homeworks Compound Index
AssessmentSchema.index({
  unit_package_id: 1,
  lecture_id: 1,
  assessment_type: 1,
  is_published: 1
});

// Fast Hierarchy Assessment Lookup
AssessmentSchema.index({
  curriculum: 1,
  grade_level: 1,
  academic_term: 1,
  assessment_type: 1
});

export const AssessmentModel = model<IAssessmentDocument>('Assessment', AssessmentSchema);
