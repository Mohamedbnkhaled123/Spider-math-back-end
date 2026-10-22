import { Schema, model, Document, Types } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

/**
 * Embedded Google Drive PDF Study Material Item
 * Strictly for study handouts and notes — streamed via backend proxy as binary ArrayBuffer into PDF.js canvas.
 */
export interface IPdfMaterialItem {
  title: string;
  storage_file_id: string; // Strictly Google Drive File ID for PDF files ONLY
  is_print_allowed: boolean;
  pages_count: number;
}

export interface ILectureMaterial {
  unit_package_id: Types.ObjectId; // Parent Unit Reference (Level 4 -> Level 5)
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;
  lecture_title_ar: string;
  lecture_title_en: string;
  description?: string;
  order_index: number;

  // DRM & Playback Protection (AES-256-GCM cipher string for Paid Lectures)
  youtube_encrypted_id: string;
  video_duration_sec: number;
  completion_threshold_pct: number;
  xp_reward_on_complete: number;

  pdf_materials: IPdfMaterialItem[];
  is_free_trial: boolean;
  is_published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILectureMaterialDocument extends ILectureMaterial, Document<Types.ObjectId> {}

const PdfMaterialItemSchema = new Schema<IPdfMaterialItem>(
  {
    title: { type: String, required: true, trim: true },
    storage_file_id: { type: String, required: true, trim: true },
    is_print_allowed: { type: Boolean, default: false },
    pages_count: { type: Number, default: 1, min: 1 }
  },
  { _id: true }
);

const LectureMaterialSchema = new Schema<ILectureMaterialDocument>(
  {
    unit_package_id: {
      type: Schema.Types.ObjectId,
      ref: 'UnitPackage',
      required: true,
      index: true
    },
    // Denormalized Hierarchy Context for Fast Free-Trial & Admin Queries
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
    lecture_title_ar: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    lecture_title_en: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    order_index: {
      type: Number,
      default: 1
    },
    youtube_encrypted_id: {
      type: String,
      required: true,
      trim: true
    },
    video_duration_sec: {
      type: Number,
      required: true,
      min: 1
    },
    completion_threshold_pct: {
      type: Number,
      default: 85,
      min: 50,
      max: 100
    },
    xp_reward_on_complete: {
      type: Number,
      default: 50,
      min: 0
    },
    pdf_materials: {
      type: [PdfMaterialItemSchema],
      default: []
    },
    is_free_trial: {
      type: Boolean,
      default: false,
      index: true
    },
    is_published: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Ordered lessons inside a Unit Package
LectureMaterialSchema.index({ unit_package_id: 1, is_published: 1, order_index: 1 });

// Fast Free Trial and Catalog lookup scoped by Curriculum + Grade + Term
LectureMaterialSchema.index({
  curriculum: 1,
  grade_level: 1,
  academic_term: 1,
  is_free_trial: 1,
  is_published: 1
});

export const LectureMaterialModel = model<ILectureMaterialDocument>(
  'LectureMaterial',
  LectureMaterialSchema
);
