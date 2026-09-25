import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Compact audit log — small metadata only.
 * Never store: passwords, tokens, request bodies, file contents, or
 * full documents. Storage-conscious for the 512 MB MongoDB budget.
 */
export type AuditScope = 'tenant' | 'platform';

export interface IAuditLog extends Document {
  scope: AuditScope;
  tenantId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  roleId?: mongoose.Types.ObjectId;
  module: string;
  action: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    scope: { type: String, enum: ['tenant', 'platform'], required: true, default: 'tenant', index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role' },
    module: { type: String, required: true, maxlength: 40 },
    action: { type: String, required: true, maxlength: 40 },
    targetId: { type: String, maxlength: 40 },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

auditLogSchema.pre('validate', function (next) {
  if (!this.scope) {
    this.scope = this.tenantId ? 'tenant' : 'platform';
  }
  if (this.scope === 'tenant' && !this.tenantId) {
    return next(new Error('tenantId is required for tenant-scoped audit logs'));
  }
  next();
});

// Compound index for the audit viewer (user filter + newest-first) per tenant.
auditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ scope: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

/** Allowed metadata value types only — strings/numbers/booleans (no objects/arrays). */
export type AuditMetadata = Record<string, string | number | boolean>;

export function sanitizeMetadata(meta?: AuditMetadata): AuditMetadata | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const SENSITIVE_KEYS = new Set(['tenantid', 'password', 'token', 'refreshtoken', 'secret', 'authorization', 'cookie', 'passwordhash']);
  const out: AuditMetadata = {};
  for (const [k, v] of Object.entries(meta)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
      continue; // Strictly strip client-supplied tenantId and sensitive credential tokens
    }
    if (['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
