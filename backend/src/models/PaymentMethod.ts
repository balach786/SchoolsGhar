import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPaymentMethod extends Document {
  name: string;
  slug: string;
  accountTitle: string;
  accountNumber: string;
  iban?: string;
  instructions: string;
  qrCodeUrl?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    accountTitle: { type: String, required: true, trim: true, maxlength: 100 },
    accountNumber: { type: String, required: true, trim: true, maxlength: 60 },
    iban: { type: String, trim: true, maxlength: 60 },
    instructions: { type: String, trim: true, maxlength: 500, default: '' },
    qrCodeUrl: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

paymentMethodSchema.index({ displayOrder: 1, isActive: 1 });

export const PaymentMethod: Model<IPaymentMethod> =
  mongoose.models.PaymentMethod ||
  mongoose.model<IPaymentMethod>('PaymentMethod', paymentMethodSchema);

export function publicPaymentMethod(m: IPaymentMethod) {
  return {
    _id: String(m._id),
    name: m.name,
    slug: m.slug,
    accountTitle: m.accountTitle,
    accountNumber: m.accountNumber,
    iban: m.iban ?? null,
    instructions: m.instructions,
    qrCodeUrl: m.qrCodeUrl ?? null,
    isActive: m.isActive,
    displayOrder: m.displayOrder,
    createdAt: m.createdAt,
  };
}
