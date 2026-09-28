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
exports.Student = exports.studentSchema = void 0;
exports.publicStudent = publicStudent;
var mongoose_1 = __importStar(require("mongoose"));
var fileRefSchema = new mongoose_1.Schema({
    name: { type: String, required: true, maxlength: 120 },
    fileUrl: { type: String, required: true, maxlength: 500 },
    mimeType: { type: String, maxlength: 80 },
    fileSize: { type: Number },
    storageKey: { type: String, maxlength: 200 },
}, { _id: false, versionKey: false });
exports.studentSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    admissionNumber: { type: String, required: true, trim: true, maxlength: 24 },
    rollNumber: { type: String, trim: true, maxlength: 12 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    profilePhotoUrl: { type: String, maxlength: 500 },
    gender: { type: String, enum: ['male', 'female'], required: true },
    dateOfBirth: { type: Date, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24 },
    fatherName: { type: String, trim: true, maxlength: 80 },
    caste: { type: String, trim: true, maxlength: 60 },
    guardianName: { type: String, required: true, trim: true, maxlength: 80 },
    guardianPhone: { type: String, trim: true, maxlength: 24 },
    guardianRelationship: { type: String, trim: true, maxlength: 30 },
    address: { type: String, trim: true, maxlength: 300 },
    admissionDate: { type: Date, required: true },
    previousSchool: { type: String, trim: true, maxlength: 100 },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', required: false },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    documents: { type: [fileRefSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
// Query index: lists filtered by session/class/section
exports.studentSchema.index({ tenantId: 1, admissionNumber: 1 }, { unique: true });
exports.studentSchema.index({ tenantId: 1, sessionId: 1, classId: 1, sectionId: 1 });
exports.studentSchema.index({ tenantId: 1, isArchived: 1, isActive: 1 });
exports.studentSchema.index({ tenantId: 1, phone: 1 });
exports.studentSchema.index({ tenantId: 1, guardianPhone: 1 });
exports.studentSchema.index({ tenantId: 1, guardianName: 1 });
exports.studentSchema.index({ tenantId: 1, fatherName: 1 });
exports.studentSchema.index({ tenantId: 1, isArchived: 1, admissionDate: -1 });
exports.studentSchema.index({ tenantId: 1, fullName: 1 });
// Rule A+D Concurrency-safe Roll Number Uniqueness
exports.studentSchema.index({ tenantId: 1, sessionId: 1, classId: 1, sectionId: 1, rollNumber: 1 }, {
    unique: true,
    partialFilterExpression: {
        isArchived: false,
        sectionId: { $type: 'objectId' },
        rollNumber: { $type: 'string', $gt: '' },
    },
});
exports.studentSchema.index({ tenantId: 1, sessionId: 1, classId: 1, rollNumber: 1 }, {
    unique: true,
    partialFilterExpression: {
        isArchived: false,
        sectionId: null,
        rollNumber: { $type: 'string', $gt: '' },
    },
});
exports.Student = mongoose_1.default.models.Student || mongoose_1.default.model('Student', exports.studentSchema);
function publicStudent(s) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return {
        _id: String(s._id),
        tenantId: s.tenantId ? String(s.tenantId) : null,
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        fullName: s.fullName,
        profilePhotoUrl: (_a = s.profilePhotoUrl) !== null && _a !== void 0 ? _a : null,
        gender: s.gender,
        dateOfBirth: s.dateOfBirth,
        email: (_b = s.email) !== null && _b !== void 0 ? _b : null,
        phone: (_c = s.phone) !== null && _c !== void 0 ? _c : null,
        fatherName: (_d = s.fatherName) !== null && _d !== void 0 ? _d : null,
        caste: (_e = s.caste) !== null && _e !== void 0 ? _e : null,
        guardianName: s.guardianName,
        guardianPhone: (_f = s.guardianPhone) !== null && _f !== void 0 ? _f : null,
        guardianRelationship: (_g = s.guardianRelationship) !== null && _g !== void 0 ? _g : null,
        address: (_h = s.address) !== null && _h !== void 0 ? _h : null,
        admissionDate: s.admissionDate,
        previousSchool: (_j = s.previousSchool) !== null && _j !== void 0 ? _j : null,
        sessionId: String(s.sessionId),
        classId: String(s.classId),
        sectionId: s.sectionId ? String(s.sectionId) : null,
        documents: (_k = s.documents) !== null && _k !== void 0 ? _k : [],
        isActive: s.isActive,
        isArchived: s.isArchived,
        createdAt: s.createdAt,
    };
}
