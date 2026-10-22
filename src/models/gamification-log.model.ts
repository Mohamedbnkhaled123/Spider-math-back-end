import { Schema, model, Document, Types } from 'mongoose';

export const XP_ACTION_TYPES = [
  'LECTURE_COMPLETED_85',
  'QUIZ_PASSED',
  'HOMEWORK_SUBMITTED',
  'TEACHER_BONUS',
  'TEACHER_PENALTY'
] as const;

export type XpActionType = (typeof XP_ACTION_TYPES)[number];

export interface IGamificationLog {
  student_id: Types.ObjectId;
  xp_delta: number;
  action_type: XpActionType;
  reference_id?: Types.ObjectId | null;
  reason_note?: string;
  created_at: Date;
}

export interface IGamificationLogDocument extends IGamificationLog, Document<Types.ObjectId> {}

const GamificationLogSchema = new Schema<IGamificationLogDocument>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    xp_delta: {
      type: Number,
      required: true
    },
    action_type: {
      type: String,
      enum: XP_ACTION_TYPES,
      required: true
    },
    reference_id: {
      type: Schema.Types.ObjectId,
      default: null
    },
    reason_note: {
      type: String,
      maxlength: 200,
      trim: true
    },
    created_at: {
      type: Date,
      default: Date.now,
      expires: 7776000 // 90-day rolling TTL auto-purge (MongoDB M0 storage economy)
    }
  },
  {
    versionKey: false,
    timestamps: false // Managed via created_at TTL index
  }
);

// Fast student XP history query
GamificationLogSchema.index({ student_id: 1, created_at: -1 });

export const GamificationLogModel = model<IGamificationLogDocument>(
  'GamificationLog',
  GamificationLogSchema
);
