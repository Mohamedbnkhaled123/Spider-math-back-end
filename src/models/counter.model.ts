import { Schema, model, Document } from 'mongoose';

/**
 * Counter Interface for Atomic Sequence Generation
 */
export interface ICounter {
  _id: string; // Identifier key, e.g., 'student_ha_code'
  seq: number; // Current sequence number (e.g. 1000 -> HA1001)
}

export interface ICounterDocument extends ICounter, Document<string> {
  _id: string;
}

const CounterSchema = new Schema<ICounterDocument>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 1000 }
  },
  {
    versionKey: false,
    timestamps: false
  }
);

export const CounterModel = model<ICounterDocument>('Counter', CounterSchema);
