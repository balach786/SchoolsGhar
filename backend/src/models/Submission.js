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
exports.Submission = void 0;
var mongoose_1 = __importStar(require("mongoose"));
var submissionSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    assignmentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    content: { type: String, trim: true, maxlength: 5000 },
    fileUrl: { type: String, maxlength: 500 },
    fileMeta: {
        name: { type: String, maxlength: 160 },
        mimeType: { type: String, maxlength: 80 },
    },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    marksObtained: { type: Number, min: 0, max: 1000 },
    feedback: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
}, { timestamps: true, versionKey: false });
// One submission per student per assignment per tenant.
submissionSchema.index({ tenantId: 1, assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ tenantId: 1, studentId: 1, submittedAt: -1 });
submissionSchema.index({ tenantId: 1, assignmentId: 1, submittedAt: 1 });
exports.Submission = mongoose_1.default.models.Submission || mongoose_1.default.model('Submission', submissionSchema);
