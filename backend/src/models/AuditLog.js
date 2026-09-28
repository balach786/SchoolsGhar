"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
exports.sanitizeMetadata = sanitizeMetadata;
var mongoose_1 = __importStar(require("mongoose"));
var auditLogSchema = new mongoose_1.Schema({
    scope: { type: String, enum: ['tenant', 'platform'], required: true, default: 'tenant', index: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    roleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Role' },
    module: { type: String, required: true, maxlength: 40 },
    action: { type: String, required: true, maxlength: 40 },
    targetId: { type: String, maxlength: 40 },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });
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
exports.AuditLog = mongoose_1.default.models.AuditLog || mongoose_1.default.model('AuditLog', auditLogSchema);
function sanitizeMetadata(meta) {
    if (!meta || typeof meta !== 'object')
        return undefined;
    var SENSITIVE_KEYS = new Set(['tenantid', 'password', 'token', 'refreshtoken', 'secret', 'authorization', 'cookie', 'passwordhash']);
    var out = {};
    for (var _i = 0, _a = Object.entries(meta); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], v = _b[1];
        var lowerKey = k.toLowerCase().replace(/[-_]/g, '');
        if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
            continue; // Strictly strip client-supplied tenantId and sensitive credential tokens
        }
        if (['string', 'number', 'boolean'].includes(typeof v))
            out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
