import { Schema, model, Document, Types } from 'mongoose';

export interface IWatchProgress {
  student_id: Types.ObjectId;
  unit_package_id: Types.ObjectId;
  lecture_id: Types.ObjectId;
  accumulated_watch_sec: number;
  last_playback_position_sec: number;
  watched_chunks_bitmap: string; // Compact string bitmask (1 character per 5s interval)
  watch_percentage: number;
  is_completed: boolean;
  xp_awarded: boolean; // Atomic idempotency guard preventing duplicate XP
  completed_at?: Date | null;
  last_watched_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWatchProgressDocument extends IWatchProgress, Document<Types.ObjectId> {}

const WatchProgressSchema = new Schema<IWatchProgressDocument>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    unit_package_id: {
      type: Schema.Types.ObjectId,
      ref: 'UnitPackage',
      required: true,
      index: true
    },
    lecture_id: {
      type: Schema.Types.ObjectId,
      ref: 'LectureMaterial',
      required: true,
      index: true
    },
    accumulated_watch_sec: {
      type: Number,
      default: 0,
      min: 0
    },
    last_playback_position_sec: {
      type: Number,
      default: 0,
      min: 0
    },
    watched_chunks_bitmap: {
      type: String,
      default: ''
    },
    watch_percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    is_completed: {
      type: Boolean,
      default: false,
      index: true
    },
    xp_awarded: {
      type: Boolean,
      default: false
    },
    completed_at: {
      type: Date,
      default: null
    },
    last_watched_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// One progress tracker per student per lecture (Idempotent tracking)
WatchProgressSchema.index({ student_id: 1, lecture_id: 1 }, { unique: true });

// Fast unit progress rollups for Student & Parent dashboards
WatchProgressSchema.index({ student_id: 1, unit_package_id: 1 });

export const WatchProgressModel = model<IWatchProgressDocument>(
  'WatchProgress',
  WatchProgressSchema
);
