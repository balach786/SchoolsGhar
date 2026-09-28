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
exports.Role = void 0;
exports.rolePermissionsFor = rolePermissionsFor;
var mongoose_1 = __importStar(require("mongoose"));
var roleSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', index: true },
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
}, { timestamps: true, versionKey: false });
// Global uniqueness for system roles
roleSchema.index({ slug: 1 }, {
    unique: true,
    partialFilterExpression: { isSystemRole: true },
    name: 'system_role_slug_unique',
});
// Per-tenant uniqueness for custom roles
roleSchema.index({ tenantId: 1, slug: 1 }, {
    unique: true,
    partialFilterExpression: { isSystemRole: false },
    name: 'custom_role_tenant_slug_unique',
});
roleSchema.index({ isActive: 1 });
exports.Role = mongoose_1.default.models.Role || mongoose_1.default.model('Role', roleSchema);
/** Get enabled actions for a module from a role (undefined = none granted). */
function rolePermissionsFor(role, module) {
    var _a, _b;
    if (!role)
        return [];
    var entry = (_a = role.permissions) === null || _a === void 0 ? void 0 : _a.find(function (p) { return p.module === module; });
    return (_b = entry === null || entry === void 0 ? void 0 : entry.actions) !== null && _b !== void 0 ? _b : [];
}
