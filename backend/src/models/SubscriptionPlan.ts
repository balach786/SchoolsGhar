import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  name: string;
  slug: string;
  description: string;
  price: number; // in minor units or whole units (e.g. PKR 5,000)
  currency: string; // e.g. PKR, USD
  durationDays: number; // e.g. 30, 90, 365
  features: string[];
  isActive: boolean;
  isRecommended: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10, default: 'PKR' },
    durationDays: { type: Number, required: true, min: 1, default: 30 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    isRecommended: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

subscriptionPlanSchema.index({ displayOrder: 1, isActive: 1 });

export const SubscriptionPlan: Model<ISubscriptionPlan> =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);

export function publicPlan(p: ISubscriptionPlan) {
  return {
    _id: String(p._id),
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    currency: p.currency,
    durationDays: p.durationDays,
    features: p.features ?? [],
    isActive: p.isActive,
    isRecommended: p.isRecommended,
    displayOrder: p.displayOrder,
    createdAt: p.createdAt,
  };
}
