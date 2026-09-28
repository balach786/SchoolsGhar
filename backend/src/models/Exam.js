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
exports.Exam = void 0;
exports.publicExam = publicExam;
var mongoose_1 = __importStar(require("mongoose"));
var examSubjectSchema = new mongoose_1.Schema({
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    passMarks: { type: Number, min: 0, max: 1000 },
}, { _id: false });
var examSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    examTypeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ExamType' },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    classIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Class' }],
    subjects: { type: [examSubjectSchema], required: true },
    gradeScaleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'GradeScale', required: true },
    examDate: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, trim: true, maxlength: 1000 },
    status: {
        type: String,
        enum: ['Draft', 'Scheduled', 'Ongoing', 'Completed', 'Results Pending', 'Published', 'Archived'],
        default: 'Scheduled',
    },
    requireExamFeeForAdmitCard: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    startExamRollNumber: { type: Number },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// One exam with a given name per class per session per tenant.
examSchema.index({ tenantId: 1, name: 1, sessionId: 1, classIds: 1 }, { unique: true });
examSchema.index({ tenantId: 1, sessionId: 1, classId: 1 });
examSchema.index({ tenantId: 1, isPublished: 1 });
examSchema.index({ tenantId: 1, status: 1 });
examSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
exports.Exam = mongoose_1.default.models.Exam || mongoose_1.default.model('Exam', examSchema);
/** Public serializer (dates → ISO strings, ids → strings). */
function publicExam(doc) {
    var _a, _b, _c;
    return {
        _id: String(doc._id),
        name: doc.name,
        examTypeId: doc.examTypeId ? String(doc.examTypeId) : null,
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        classIds: doc.classIds && doc.classIds.length > 0 ? doc.classIds.map(function (c) { return String(c); }) : doc.classId ? [String(doc.classId)] : [],
        subjects: ((_a = doc.subjects) !== null && _a !== void 0 ? _a : []).map(function (s) {
            var _a;
            return ({
                subjectId: String(s.subjectId),
                maxMarks: s.maxMarks,
                passMarks: (_a = s.passMarks) !== null && _a !== void 0 ? _a : null,
            });
        }),
        gradeScaleId: String(doc.gradeScaleId),
        examDate: doc.examDate ? new Date(doc.examDate).toISOString() : null,
        startDate: doc.startDate ? new Date(doc.startDate).toISOString() : null,
        endDate: doc.endDate ? new Date(doc.endDate).toISOString() : null,
        description: (_b = doc.description) !== null && _b !== void 0 ? _b : null,
        status: doc.status || (doc.isPublished ? 'Published' : doc.isArchived ? 'Archived' : 'Scheduled'),
        requireExamFeeForAdmitCard: Boolean(doc.requireExamFeeForAdmitCard),
        isPublished: Boolean(doc.isPublished),
        isArchived: Boolean(doc.isArchived),
        startExamRollNumber: (_c = doc.startExamRollNumber) !== null && _c !== void 0 ? _c : null,
        createdBy: doc.createdBy ? String(doc.createdBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
