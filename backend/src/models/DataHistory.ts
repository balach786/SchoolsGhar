import mongoose, { Schema, Document, Model } from 'mongoose';

export type TransferType = 'import' | 'export';
export type TransferModule =
  | 'students'
  | 'staff'
  | 'fees'
  | 'attendance'
  | 'exams'
  | 'marks'
  | 'results'
  | 'academic';
export type TransferFormat = 'xlsx' | 'csv';
export type TransferStatus = 'completed' | 'failed' | 'partial';

export interface IDataHistory extends Document {
  tenantId: mongoose.Types.ObjectId;
  type: TransferType;
  module: TransferModule;
  format: TransferFormat;
  fileName: string;
  recordCount: number;
  totalRows: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  status: TransferStatus;
  filtersSummary?: string;
  performedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const dataHistorySchema = new Schema<IDataHistory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    type: { type: String, enum: ['import', 'export'], required: true, index: true },
    module: {
      type: String,
      enum: ['students', 'staff', 'fees', 'attendance', 'exams', 'marks', 'results', 'academic'],
      required: true,
      index: true,
    },
    format: { type: String, enum: ['xlsx', 'csv'], default: 'xlsx' },
    fileName: { type: String, required: true, maxlength: 200 },
    recordCount: { type: Number, default: 0 },
    totalRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'failed', 'partial'], default: 'completed' },
    filtersSummary: { type: String, maxlength: 500 },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

dataHistorySchema.index({ tenantId: 1, createdAt: -1 });
dataHistorySchema.index({ tenantId: 1, module: 1, type: 1 });

export const DataHistory: Model<IDataHistory> =
  mongoose.models.DataHistory || mongoose.model<IDataHistory>('DataHistory', dataHistorySchema);
