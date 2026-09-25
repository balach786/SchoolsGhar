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
exports.Staff = exports.staffSchema = void 0;
exports.publicStaff = publicStaff;
var mongoose_1 = __importStar(require("mongoose"));
var fileRefSchema = new mongoose_1.Schema({
    name: { type: String, required: true, maxlength: 120 },
    fileUrl: { type: String, required: true, maxlength: 500 },
    mimeType: { type: String, maxlength: 80 },
    fileSize: { type: Number },
    storageKey: { type: String, maxlength: 200 },
}, { _id: false, versionKey: false });
exports.staffSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    staffType: {
        type: String,
        enum: ['teaching', 'non_teaching'],
        required: true,
        index: true,
    },
    designation: { type: String, required: true, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 80 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    fatherName: { type: String, required: true, trim: true, maxlength: 80 },
    caste: { type: String, required: true, trim: true, maxlength: 80 },
    profilePhotoUrl: { type: String, maxlength: 500 },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24 },
    address: { type: String, trim: true, maxlength: 300 },
    dateOfBirth: { type: Date },
    joiningDate: { type: Date, required: true },
    qualification: { type: String, trim: true, maxlength: 120 },
    salary: { type: Number, default: 0, min: 0 },
    documents: { type: [fileRefSchema], default: [] },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    specialization: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
}, {
    timestamps: true,
    versionKey: false,
    discriminatorKey: 'staffType',
    collection: 'staff',
});
// Indexes on staff collection
exports.staffSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
exports.staffSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
exports.staffSchema.index({ tenantId: 1, staffType: 1, isArchived: 1, isActive: 1 });
exports.Staff = mongoose_1.default.models.Staff || mongoose_1.default.model('Staff', exports.staffSchema, 'staff');
// Register 'non_teaching' discriminator on Staff
if (!exports.Staff.discriminators || !exports.Staff.discriminators['non_teaching']) {
    exports.Staff.discriminator('non_teaching', new mongoose_1.Schema({}, { _id: false, versionKey: false }), 'non_teaching');
}
function publicStaff(s, opts) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var isDoc = typeof s.toObject === 'function';
    var raw = isDoc ? s.toObject() : s;
    return {
        _id: String(raw._id),
        tenantId: raw.tenantId ? String(raw.tenantId) : null,
        employeeId: raw.employeeId,
        staffType: raw.staffType,
        designation: raw.designation,
        department: (_a = raw.department) !== null && _a !== void 0 ? _a : null,
        fullName: raw.fullName,
        fatherName: raw.fatherName,
        caste: raw.caste,
        profilePhotoUrl: (_b = raw.profilePhotoUrl) !== null && _b !== void 0 ? _b : null,
        gender: (_c = raw.gender) !== null && _c !== void 0 ? _c : null,
        email: (_d = raw.email) !== null && _d !== void 0 ? _d : null,
        phone: (_e = raw.phone) !== null && _e !== void 0 ? _e : null,
        address: (_f = raw.address) !== null && _f !== void 0 ? _f : null,
        dateOfBirth: (_g = raw.dateOfBirth) !== null && _g !== void 0 ? _g : null,
        joiningDate: raw.joiningDate,
        qualification: (_h = raw.qualification) !== null && _h !== void 0 ? _h : null,
        specialization: (_j = raw.specialization) !== null && _j !== void 0 ? _j : null,
        salary: (opts === null || opts === void 0 ? void 0 : opts.hideSalary) ? undefined : raw.salary,
        documents: (_k = raw.documents) !== null && _k !== void 0 ? _k : [],
        userId: raw.userId ? String(raw.userId) : null,
        isActive: raw.isActive,
        isArchived: raw.isArchived,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        // Derived canonical relationships (Correction 2: zero drift from Class/Subject)
    };
}
