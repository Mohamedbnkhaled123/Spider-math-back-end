import { Schema, model, Document, Types } from 'mongoose';

export const SYNC_QUEUE_STATUSES = ['IN_PROGRESS', 'QUEUED_OFFLINE', 'SYNCED_ONLINE'] as const;
export type SyncQueueStatus = (typeof SYNC_QUEUE_STATUSES)[number];

export const RESULT_VISIBILITY_STATUSES = [
  'HIDDEN_PENDING_TEACHER',
  'PUBLISHED_TO_STUDENT_AND_PARENT'
] as const;
export type ResultVisibilityStatus = (typeof RESULT_VISIBILITY_STATUSES)[number];

export interface IMcqAnswer {
  question_id: Types.ObjectId;
  selected_option_index: number;
  is_correct: boolean;
  points_earned: number;
}

export interface IUploadedSolutionImg {
  question_id?: Types.ObjectId;
  image_url: string; // Cloudinary HTTPS URL in 'spider-math-homework/'
  size_kb?: number;
  rotation_deg?: number;
}

/**
 * Teacher Corrective Feedback per Mistake
 * Strictly written text note + unprotected YouTube video or post URL (Zero Image Bloat)
 */
export interface ICustomMistakeCase {
  question_id?: Types.ObjectId;
  error_note: string; // Written feedback by Eng. Heba Abdel-Wahab
  youtube_solution_url?: string | null; // Unprotected YouTube Video/Post URL
}

export interface ISubmission {
  idempotency_key: string; // UUIDv4 client idempotency key
  assessment_id: Types.ObjectId;
  student_id: Types.ObjectId;
  unit_package_id: Types.ObjectId;
  attempt_number: number;

  is_offline_cached: boolean;
  sync_queue_status: SyncQueueStatus;
  reconnect_sync_at?: Date | null;
  offline_disconnect_count: number;

  // Server-Authoritative Timing & Cheat Auditing
  server_started_at: Date;
  client_started_at: Date;
  client_submitted_at?: Date | null;
  server_received_at?: Date | null;
  elapsed_time_sec: number;
  is_suspicious_fast_solve: boolean;
  clock_tamper_detected: boolean;

  mcq_answers: IMcqAnswer[];
  uploaded_solution_imgs: IUploadedSolutionImg[]; // Max 2 images (<= 150KB WebP)

  result_visibility: ResultVisibilityStatus;
  mcq_auto_score: number;
  essay_manual_score: number;
  final_total_score: number;
  teacher_feedback_notes?: string;

  custom_mistake_cases: ICustomMistakeCase[];
  graded_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubmissionDocument extends ISubmission, Document<Types.ObjectId> {}

const McqAnswerSchema = new Schema<IMcqAnswer>(
  {
    question_id: { type: Schema.Types.ObjectId, required: true },
    selected_option_index: { type: Number, required: true },
    is_correct: { type: Boolean, default: false },
    points_earned: { type: Number, default: 0 }
  },
  { _id: false }
);

const UploadedSolutionImgSchema = new Schema<IUploadedSolutionImg>(
  {
    question_id: { type: Schema.Types.ObjectId },
    image_url: { type: String, required: true, trim: true },
    size_kb: { type: Number },
    rotation_deg: { type: Number, default: 0 }
  },
  { _id: false }
);

const CustomMistakeCaseSchema = new Schema<ICustomMistakeCase>(
  {
    question_id: { type: Schema.Types.ObjectId },
    error_note: { type: String, required: true, trim: true, maxlength: 1000 },
    youtube_solution_url: { type: String, default: null, trim: true }
  },
  { _id: false }
);

const SubmissionSchema = new Schema<ISubmissionDocument>(
  {
    idempotency_key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    assessment_id: {
      type: Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true
    },
    student_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    unit_package_id: {
      type: Schema.Types.ObjectId,
      ref: 'UnitPackage',
      required: true
    },
    attempt_number: {
      type: Number,
      default: 1,
      min: 1
    },

    is_offline_cached: {
      type: Boolean,
      default: true
    },
    sync_queue_status: {
      type: String,
      enum: SYNC_QUEUE_STATUSES,
      default: 'IN_PROGRESS',
      index: true
    },
    reconnect_sync_at: {
      type: Date,
      default: null
    },
    offline_disconnect_count: {
      type: Number,
      default: 0
    },

    // Server-Authoritative Timing
    server_started_at: {
      type: Date,
      required: true
    },
    client_started_at: {
      type: Date,
      required: true
    },
    client_submitted_at: {
      type: Date,
      default: null
    },
    server_received_at: {
      type: Date,
      default: null
    },
    elapsed_time_sec: {
      type: Number,
      default: 0,
      min: 0
    },
    is_suspicious_fast_solve: {
      type: Boolean,
      default: false,
      index: true
    },
    clock_tamper_detected: {
      type: Boolean,
      default: false
    },

    mcq_answers: {
      type: [McqAnswerSchema],
      default: []
    },
    uploaded_solution_imgs: {
      type: [UploadedSolutionImgSchema],
      default: [],
      validate: [
        (val: IUploadedSolutionImg[]) => val.length <= 2,
        'uploaded_solution_imgs cannot exceed 2 images per submission'
      ]
    },

    result_visibility: {
      type: String,
      enum: RESULT_VISIBILITY_STATUSES,
      default: 'HIDDEN_PENDING_TEACHER',
      required: true,
      index: true
    },
    mcq_auto_score: {
      type: Number,
      default: 0
    },
    essay_manual_score: {
      type: Number,
      default: 0
    },
    final_total_score: {
      type: Number,
      default: 0
    },
    teacher_feedback_notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000
    },

    custom_mistake_cases: {
      type: [CustomMistakeCaseSchema],
      default: []
    },
    graded_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// One submission attempt per student per assessment attempt number
SubmissionSchema.index({ student_id: 1, assessment_id: 1, attempt_number: 1 }, { unique: true });

// Admin Grading Studio Pending Submissions Query
SubmissionSchema.index({ assessment_id: 1, result_visibility: 1, createdAt: -1 });

export const SubmissionModel = model<ISubmissionDocument>('Submission', SubmissionSchema);
