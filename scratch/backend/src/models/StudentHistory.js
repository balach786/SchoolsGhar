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
exports.StudentHistory = exports.studentHistorySchema = exports.STUDENT_LIFECYCLE_EVENTS = void 0;
exports.publicHistory = publicHistory;
var mongoose_1 = __importStar(require("mongoose"));
exports.STUDENT_LIFECYCLE_EVENTS = [
    'admitted',
    'section_changed',
    'class_changed',
    'transferred',
    'promoted',
    'status_changed',
    're_admitted',
];
exports.studentHistorySchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', required: false },
    status: {
        type: String,
        enum: exports.STUDENT_LIFECYCLE_EVENTS,
        default: 'admitted',
        required: true,
    },
    eventDate: { type: Date, default: Date.now },
    date: { type: Date, default: Date.now },
    previousClassId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: false },
    previousSectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', required: false },
    remarks: { type: String, trim: true, maxlength: 500, required: false },
    recordedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
}, { timestamps: true, versionKey: false });
// Non-unique chronological indexes for fast student timeline & session reporting
exports.studentHistorySchema.index({ tenantId: 1, studentId: 1, eventDate: -1 });
exports.studentHistorySchema.index({ tenantId: 1, sessionId: 1, eventDate: -1 });
exports.studentHistorySchema.index({ tenantId: 1, sessionId: 1, classId: 1 });
// ── Append-Only Protection Middleware ──────────────────────────────
// Normal application operations must NEVER mutate or delete history records.
// Administrative migration / disaster recovery bypass is explicit and opt-in only.
exports.studentHistorySchema.pre('save', function (next) {
    var _a;
    if (!this.isNew && !((_a = this.$locals) === null || _a === void 0 ? void 0 : _a.allowAdministrativeHistoryMutation)) {
        return next(new Error('StudentHistory records are append-only and immutable. Updates are rejected.'));
    }
    // Ensure date and eventDate stay synchronized if only one was provided
    if (!this.eventDate && this.date)
        this.eventDate = this.date;
    if (!this.date && this.eventDate)
        this.date = this.eventDate;
    next();
});
exports.studentHistorySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function (next) {
    var options = this.getOptions();
    if (!(options === null || options === void 0 ? void 0 : options.allowAdministrativeHistoryMutation)) {
        return next(new Error('Direct updates to StudentHistory are prohibited. Events must be appended as new records.'));
    }
    next();
});
exports.studentHistorySchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
    var options = this.getOptions();
    if (!(options === null || options === void 0 ? void 0 : options.allowAdministrativeHistoryMutation)) {
        return next(new Error('Deletion of StudentHistory records is prohibited. History is append-only.'));
    }
    next();
});
exports.StudentHistory = mongoose_1.default.models.StudentHistory || mongoose_1.default.model('StudentHistory', exports.studentHistorySchema);
function publicHistory(h) {
    var _a;
    return {
        _id: String(h._id),
        sessionId: String(h.sessionId),
        classId: String(h.classId),
        sectionId: h.sectionId ? String(h.sectionId) : null,
        status: h.status,
        eventDate: h.eventDate || h.date,
        date: h.date || h.eventDate,
        previousClassId: h.previousClassId ? String(h.previousClassId) : null,
        previousSectionId: h.previousSectionId ? String(h.previousSectionId) : null,
        remarks: (_a = h.remarks) !== null && _a !== void 0 ? _a : null,
    };
}
