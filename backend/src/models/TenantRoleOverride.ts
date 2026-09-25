import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  name: String, description: String, isActive: Boolean,
  permissions: { type: [{ _id: false, module: String, actions: [String] }], default: undefined },
}, { timestamps: true, versionKey: false });
schema.index({ tenantId: 1, roleId: 1 }, { unique: true });
export const TenantRoleOverride = mongoose.model('TenantRoleOverride', schema);
