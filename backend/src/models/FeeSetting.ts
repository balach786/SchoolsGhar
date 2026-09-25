import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFeeSetting extends Document {
  tenantId: mongoose.Types.ObjectId;
  admissionFee: {
    enabled: boolean;
    allowReAdmission: boolean;
  };
  otherFee: {
    enabled: boolean;
    feeName: string;
    /** Integer paisa */
    defaultAmount: number;
  };
  lateFee: {
    enabled: boolean;
    /** Integer paisa */
    lateFeeAmount: number;
    gracePeriodDays: number;
  };
  dueDate: {
    enabled: boolean;
    /** Day of month (1-28) */
    defaultMonthlyDueDay: number;
  };
  discount: {
    enabled: boolean;
    /** Default false: strictly prevents stacking across student/class/all */
    allowDiscountStacking: boolean;
  };
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const feeSettingSchema = new Schema<IFeeSetting>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    admissionFee: {
      enabled: { type: Boolean, default: true },
      allowReAdmission: { type: Boolean, default: false },
    },
    otherFee: {
      enabled: { type: Boolean, default: false },
      feeName: { type: String, trim: true, maxlength: 120, default: 'Other Fee' },
      defaultAmount: { type: Number, default: 0, min: 0 },
    },
    lateFee: {
      enabled: { type: Boolean, default: false },
      lateFeeAmount: { type: Number, default: 0, min: 0 },
      gracePeriodDays: { type: Number, default: 0, min: 0, max: 31 },
    },
    dueDate: {
      enabled: { type: Boolean, default: true },
      defaultMonthlyDueDay: { type: Number, default: 10, min: 1, max: 28 },
    },
    discount: {
      enabled: { type: Boolean, default: true },
      allowDiscountStacking: { type: Boolean, default: false },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

export const FeeSetting: Model<IFeeSetting> =
  mongoose.models.FeeSetting || mongoose.model<IFeeSetting>('FeeSetting', feeSettingSchema);

export function publicFeeSetting(doc: IFeeSetting | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    admissionFee: {
      enabled: Boolean(doc.admissionFee?.enabled),
      allowReAdmission: Boolean(doc.admissionFee?.allowReAdmission),
    },
    otherFee: {
      enabled: Boolean(doc.otherFee?.enabled),
      feeName: doc.otherFee?.feeName || 'Other Fee',
      defaultAmount: doc.otherFee?.defaultAmount ?? 0,
    },
    lateFee: {
      enabled: Boolean(doc.lateFee?.enabled),
      lateFeeAmount: doc.lateFee?.lateFeeAmount ?? 0,
      gracePeriodDays: doc.lateFee?.gracePeriodDays ?? 0,
    },
    dueDate: {
      enabled: Boolean(doc.dueDate?.enabled),
      defaultMonthlyDueDay: doc.dueDate?.defaultMonthlyDueDay ?? 10,
    },
    discount: {
      enabled: Boolean(doc.discount?.enabled),
      allowDiscountStacking: Boolean(doc.discount?.allowDiscountStacking),
    },
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
