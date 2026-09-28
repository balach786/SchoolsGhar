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
exports.Assignment = void 0;
var mongoose_1 = __importStar(require("mongoose"));
var assignmentSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Teacher' },
    dueDate: { type: Date },
    maxMarks: { type: Number, min: 0, max: 1000 },
    attachments: {
        type: [
            {
                name: { type: String, required: true, maxlength: 160 },
                url: { type: String, required: true, maxlength: 500 },
                mimeType: { type: String, maxlength: 80 },
            },
        ],
        default: [],
    },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
assignmentSchema.index({ tenantId: 1, classId: 1, isArchived: 1, dueDate: 1 });
assignmentSchema.index({ tenantId: 1, teacherId: 1, isArchived: 1 });
assignmentSchema.index({ tenantId: 1, sectionId: 1 });
exports.Assignment = mongoose_1.default.models.Assignment || mongoose_1.default.model('Assignment', assignmentSchema);
