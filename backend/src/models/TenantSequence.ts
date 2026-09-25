import mongoose, { Schema, Model } from 'mongoose';

export interface ITenantSequence {
  _id: string; // e.g. 'timetable-lock'
  seq: number;
}

export const tenantSequenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export const TenantSequence: Model<ITenantSequence> =
  mongoose.models.TenantSequence || mongoose.model<ITenantSequence>('TenantSequence', tenantSequenceSchema);
