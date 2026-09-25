import mongoose, { Schema, Document, Model } from 'mongoose';
import { TransferModule, TransferFormat } from './DataHistory';

export interface IExportPreset extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  module: TransferModule;
  format: TransferFormat;
  filters: Record<string, any>;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const exportPresetSchema = new Schema<IExportPreset>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    module: {
      type: String,
      enum: ['students', 'staff', 'fees', 'attendance', 'exams', 'marks', 'results', 'academic'],
      required: true,
    },
    format: { type: String, enum: ['xlsx', 'csv'], default: 'xlsx' },
    filters: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

exportPresetSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const ExportPreset: Model<IExportPreset> =
  mongoose.models.ExportPreset || mongoose.model<IExportPreset>('ExportPreset', exportPresetSchema);
