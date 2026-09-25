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
exports.Subject = exports.subjectSchema = void 0;
exports.normalizeSubjectCode = normalizeSubjectCode;
exports.publicSubject = publicSubject;
var mongoose_1 = __importStar(require("mongoose"));
function normalizeSubjectCode(code) {
    return (code || '').trim().toUpperCase();
}
exports.subjectSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
    // compact arrays of ObjectIds — no duplicated names/docs
    classIds: { type: [mongoose_1.Schema.Types.ObjectId], ref: 'Class', default: [], index: true },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
exports.subjectSchema.pre('save', function (next) {
    if (this.code) {
        this.code = normalizeSubjectCode(this.code);
    }
    next();
});
exports.subjectSchema.index({ tenantId: 1, sessionId: 1, isArchived: 1 });
exports.Subject = mongoose_1.default.models.Subject || mongoose_1.default.model('Subject', exports.subjectSchema);
function publicSubject(s) {
    var _a;
    return {
        _id: String(s._id),
        tenantId: s.tenantId ? String(s.tenantId) : null,
        name: s.name,
        code: s.code,
        sessionId: String(s.sessionId),
        classIds: ((_a = s.classIds) !== null && _a !== void 0 ? _a : []).map(String),
        isActive: s.isActive,
        isArchived: s.isArchived,
        createdAt: s.createdAt,
    };
}
