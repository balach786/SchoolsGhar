import mongoose, { Schema, Document, Model } from 'mongoose';

export type TenantStatus = 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

export interface ITenant extends Document {
  name: string;
  slug: string;
  databaseName: string;
  isDatabaseProvisioned: boolean;
  provisioningStatus: 'pending' | 'provisioning' | 'ready' | 'failed';
  provisioningFailedAt?: Date;
  provisioningErrorCode?: string;
  ownerUserId: mongoose.Types.ObjectId;
  contactEmail: string;
  contactPhone?: string;
  city?: string;
  country?: string;
  status: TenantStatus;
  trialStartedAt: Date;
  trialEndsAt: Date;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartedAt?: Date;
  subscriptionEndsAt?: Date;
  currentPlanId?: mongoose.Types.ObjectId;
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  isDemo?: boolean;
  demoBatchId?: string;
  adminSecuritySeq?: number;
  academicSessionSeq?: number;
  timetableSeq?: number;
  promotionSeq?: number;
  deletionStatus?: 'NONE' | 'SOFT_DELETED' | 'DELETION_IN_PROGRESS' | 'DATABASE_DELETED_CLEANUP_PENDING' | 'HARD_DELETED';
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    databaseName: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    isDatabaseProvisioned: { type: Boolean, default: false, index: true },
    provisioningStatus: { type: String, enum: ['pending', 'provisioning', 'ready', 'failed'], default: 'pending', index: true },
    provisioningFailedAt: { type: Date },
    provisioningErrorCode: { type: String, maxlength: 200 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    city: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80, default: 'Pakistan' },
    status: {
      type: String,
      enum: ['trial', 'active', 'expired', 'suspended', 'cancelled'],
      default: 'trial',
      index: true,
    },
    trialStartedAt: { type: Date, required: true, default: Date.now },
    trialEndsAt: { type: Date, required: true },
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'expired', 'suspended'],
      default: 'trial',
      index: true,
    },
    subscriptionStartedAt: { type: Date },
    subscriptionEndsAt: { type: Date },
    currentPlanId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false, index: true },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
    isDemo: { type: Boolean, default: false, index: true },
    demoBatchId: { type: String, index: true },
    adminSecuritySeq: { type: Number, default: 0 },
    academicSessionSeq: { type: Number, default: 0 },
    timetableSeq: { type: Number, default: 0 },
    promotionSeq: { type: Number, default: 0 },
    deletionStatus: { 
      type: String, 
      enum: ['NONE', 'SOFT_DELETED', 'DELETION_IN_PROGRESS', 'DATABASE_DELETED_CLEANUP_PENDING', 'HARD_DELETED'],
      default: 'NONE'
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

tenantSchema.index({ subscriptionEndsAt: 1 });
tenantSchema.index({ trialEndsAt: 1 });

export const Tenant: Model<ITenant> =
  mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', tenantSchema);

/** Evaluate live status based on dates and suspension */
export function getEffectiveTenantStatus(t: ITenant): {
  status: SubscriptionStatus;
  daysRemaining: number;
  isExpired: boolean;
  isSuspended: boolean;
} {
  const now = new Date();

  if (t.isSuspended) {
    return {
      status: 'suspended',
      daysRemaining: 0,
      isExpired: false,
      isSuspended: true,
    };
  }

  // Active paid subscription
  if (t.subscriptionEndsAt && t.subscriptionEndsAt > now) {
    const diffMs = t.subscriptionEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return {
      status: 'active',
      daysRemaining,
      isExpired: false,
      isSuspended: false,
    };
  }

  // Active free trial
  if (t.trialEndsAt && t.trialEndsAt > now) {
    const diffMs = t.trialEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return {
      status: 'trial',
      daysRemaining,
      isExpired: false,
      isSuspended: false,
    };
  }

  // Otherwise expired
  return {
    status: 'expired',
    daysRemaining: 0,
    isExpired: true,
    isSuspended: false,
  };
}

export function publicTenant(t: ITenant) {
  const effective = getEffectiveTenantStatus(t);
  return {
    _id: String(t._id),
    name: t.name,
    slug: t.slug,
    ownerUserId: String(t.ownerUserId),
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone ?? null,
    city: t.city ?? null,
    country: t.country ?? 'Pakistan',
    status: effective.status,
    rawStatus: t.status,
    trialStartedAt: t.trialStartedAt,
    trialEndsAt: t.trialEndsAt,
    subscriptionStatus: effective.status,
    subscriptionStartedAt: t.subscriptionStartedAt ?? null,
    subscriptionEndsAt: t.subscriptionEndsAt ?? null,
    currentPlanId: t.currentPlanId ? String(t.currentPlanId) : null,
    isActive: t.isActive,
    isSuspended: t.isSuspended,
    suspensionReason: t.suspensionReason ?? null,
    isDemo: Boolean(t.isDemo),
    demoBatchId: t.demoBatchId ?? null,
    daysRemaining: effective.daysRemaining,
    isExpired: effective.isExpired,
    deletionStatus: t.deletionStatus ?? 'NONE',
    isDeleted: Boolean(t.isDeleted),
    deletedAt: t.deletedAt ?? null,
    createdAt: t.createdAt,
  };
}
