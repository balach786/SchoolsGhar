import mongoose, { Schema, Document, Model } from 'mongoose';

export type DiscountTarget = 'student' | 'class' | 'all';
export type DiscountType = 'fixed' | 'percentage';

export interface IFeeDiscount extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  discountType: DiscountType;
  /**
   * For fixed: integer amount in paisa (e.g. 50000 = 500 PKR).
   * For percentage: integer basis points (100 = 1%, 1000 = 10%, 10000 = 100%).
   */
  value: number;
  /** Explicit integer basis points for percentage discounts */
  valueBps?: number;
  applyTo: DiscountTarget;
  classId?: mongoose.Types.ObjectId;
  studentId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const feeDiscountSchema = new Schema<IFeeDiscount>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    discountType: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { type: Number, required: true, min: 1 },
    valueBps: { type: Number, min: 1, max: 10000 },
    applyTo: { type: String, enum: ['student', 'class', 'all'], required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class' },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

feeDiscountSchema.index({ tenantId: 1, isActive: 1, applyTo: 1 });
feeDiscountSchema.index({ tenantId: 1, studentId: 1 });
feeDiscountSchema.index({ tenantId: 1, classId: 1 });

export const FeeDiscount: Model<IFeeDiscount> =
  mongoose.models.FeeDiscount || mongoose.model<IFeeDiscount>('FeeDiscount', feeDiscountSchema);

export function publicFeeDiscount(doc: IFeeDiscount | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    name: doc.name,
    discountType: doc.discountType,
    value: doc.value,
    valueBps: doc.valueBps ?? (doc.discountType === 'percentage' ? doc.value : null),
    applyTo: doc.applyTo,
    classId: doc.classId ? String(doc.classId) : null,
    studentId: doc.studentId ? String(doc.studentId) : null,
    isActive: Boolean(doc.isActive),
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
