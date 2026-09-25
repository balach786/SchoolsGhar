import mongoose, { Schema, Document, Model } from 'mongoose';

export interface RolePermissionEntry {
  module: string;
  actions: string[];
}

export interface IRole extends Document {
  tenantId?: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  isSystemRole: boolean;
  isActive: boolean;
  /** Compact permission matrix — only enabled actions are stored. */
  permissions: RolePermissionEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200 },
    isSystemRole: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    permissions: {
      type: [
        {
          _id: false,
          module: { type: String, required: true },
          actions: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false }
);

// Global uniqueness for system roles
roleSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { isSystemRole: true },
    name: 'system_role_slug_unique',
  }
);

// Per-tenant uniqueness for custom roles
roleSchema.index(
  { tenantId: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { isSystemRole: false },
    name: 'custom_role_tenant_slug_unique',
  }
);

roleSchema.index({ isActive: 1 });

export const Role: Model<IRole> = mongoose.models.Role || mongoose.model<IRole>('Role', roleSchema);

/** Get enabled actions for a module from a role (undefined = none granted). */
export function rolePermissionsFor(role: IRole | null, module: string): string[] {
  if (!role) return [];
  const entry = role.permissions?.find((p) => p.module === module);
  return entry?.actions ?? [];
}
