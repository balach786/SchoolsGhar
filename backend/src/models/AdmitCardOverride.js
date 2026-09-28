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
exports.AdmitCardOverride = void 0;
exports.publicAdmitCardOverride = publicAdmitCardOverride;
var mongoose_1 = __importStar(require("mongoose"));
var admitCardOverrideSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    grantedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
admitCardOverrideSchema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true });
exports.AdmitCardOverride = mongoose_1.default.models.AdmitCardOverride || mongoose_1.default.model('AdmitCardOverride', admitCardOverrideSchema);
function publicAdmitCardOverride(doc) {
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        studentId: String(doc.studentId),
        reason: doc.reason,
        grantedBy: String(doc.grantedBy),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
