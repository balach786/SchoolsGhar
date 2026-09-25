import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  roleId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  isPlatformAdmin?: boolean;
  isActive: boolean;
  isArchived: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  linkSeq?: number;
  dashboardOrder?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    // select:false → never returned by queries unless explicitly projected
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    isPlatformAdmin: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    linkSeq: { type: Number, default: 0 },
    dashboardOrder: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

// Email unique index declared inline; ESR index for tenant user listings sorted by createdAt
userSchema.index({ tenantId: 1, isArchived: 1, createdAt: -1 });

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

/** Public-safe user shape (never includes passwordHash). */
export function publicUser(u: IUser) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    roleId: String(u.roleId),
    tenantId: u.tenantId ? String(u.tenantId) : null,
    isPlatformAdmin: Boolean(u.isPlatformAdmin),
    isActive: u.isActive,
    isArchived: u.isArchived,
    lastLoginAt: u.lastLoginAt ?? null,
    passwordChangedAt: u.passwordChangedAt ?? null,
    dashboardOrder: u.dashboardOrder ?? [],
    createdAt: u.createdAt,
  };
}
