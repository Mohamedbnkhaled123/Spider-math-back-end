import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export const PACKAGE_TYPES = ['STUDY_UNIT', 'FINAL_REVISION'] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export interface IUnitPackage {
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;
  title_ar: string;
  title_en: string;
  slug: string;
  description_ar?: string;
  description_en?: string;
  package_type: PackageType;
  subject_branch: string;
  price_egp: number;
  validity_days: number;
  order_index: number;
  is_published: boolean;
  thumbnail_url?: string | null;
  lectures_count: number;
  quizzes_count: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUnitPackageDocument extends IUnitPackage, Document<Types.ObjectId> {}

const UnitPackageSchema = new Schema<IUnitPackageDocument>(
  {
    // Level 1: المنهج التعليمي (EGYPTIAN | GULF | INTERNATIONAL | AMERICAN)
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: true,
      index: true
    },

    // Level 2: الصف الدراسي
    grade_level: {
      type: String,
      enum: ALL_GRADE_LEVELS,
      required: true,
      validate: {
        validator: function (this: IUnitPackageDocument, val: string | null | undefined): boolean {
          return isValidGradeForCurriculum(this.curriculum, val);
        },
        message: 'grade_level is not valid for the specified curriculum track.'
      },
      index: true
    },

    // Level 3: الفصل الدراسي الأول أو الثاني (TERM_1 | TERM_2)
    academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      required: true,
      default: 'TERM_1',
      index: true
    },

    // Level 4: بيانات الوحدة الدراسية أو حزمة المراجعة النهائية
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
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    description_ar: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    description_en: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    package_type: {
      type: String,
      enum: PACKAGE_TYPES,
      required: true,
      default: 'STUDY_UNIT',
      index: true
    },
    subject_branch: {
      type: String,
      default: 'GENERAL',
      trim: true
    },
    price_egp: {
      type: Number,
      required: true,
      min: 0
    },
    validity_days: {
      type: Number,
      required: true,
      default: 120, // 4-month academic term access
      min: 1
    },
    order_index: {
      type: Number,
      default: 1
    },
    is_published: {
      type: Boolean,
      default: true,
      index: true
    },
    thumbnail_url: {
      type: String,
      default: null,
      trim: true
    },
    lectures_count: {
      type: Number,
      default: 0
    },
    quizzes_count: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Primary 5-Level Hierarchy Catalog Compound Index (< 5ms filter by Curriculum + Grade + Term + Type)
UnitPackageSchema.index({
  curriculum: 1,
  grade_level: 1,
  academic_term: 1,
  package_type: 1,
  is_published: 1,
  order_index: 1
});

export const UnitPackageModel = model<IUnitPackageDocument>('UnitPackage', UnitPackageSchema);
