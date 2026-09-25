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
exports.FeeStructure = exports.feeStructureSchema = void 0;
exports.publicFeeStructure = publicFeeStructure;
var mongoose_1 = __importStar(require("mongoose"));
exports.feeStructureSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    feeType: { type: String, enum: ['monthly_tuition', 'admission_fee', 'other'], required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    amount: { type: Number, required: true, min: 1 },
    month: { type: Number, min: 1, max: 12, default: null },
    effectiveFromMonth: { type: Number, min: 1, max: 12, default: null },
    effectiveFromYear: { type: Number, default: null },
    dueDate: { type: Date },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Duplicate prevention for non-monthly structures: same tenant+class+session+type+month+title+effectiveFrom is a duplicate.
exports.feeStructureSchema.index({ tenantId: 1, sessionId: 1, classId: 1, feeType: 1, month: 1, title: 1, effectiveFromMonth: 1, effectiveFromYear: 1 }, { unique: true, partialFilterExpression: { feeType: { $in: ['admission_fee', 'other'] } } });
// Strict duplicate prevention for monthly tuition: same tenant+class+session+type+month is a duplicate.
// Title does not determine uniqueness for monthly tuition.
exports.feeStructureSchema.index({ tenantId: 1, sessionId: 1, classId: 1, feeType: 1, month: 1 }, { unique: true, partialFilterExpression: { feeType: 'monthly_tuition' } });
exports.feeStructureSchema.index({ tenantId: 1, sessionId: 1, classId: 1, isArchived: 1 });
exports.FeeStructure = mongoose_1.default.models.FeeStructure || mongoose_1.default.model('FeeStructure', exports.feeStructureSchema);
function publicFeeStructure(doc) {
    var _a, _b, _c, _d;
    return {
        _id: String(doc._id),
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        feeType: doc.feeType,
        title: doc.title,
        amount: doc.amount,
        month: (_a = doc.month) !== null && _a !== void 0 ? _a : null,
        effectiveFromMonth: (_b = doc.effectiveFromMonth) !== null && _b !== void 0 ? _b : null,
        effectiveFromYear: (_c = doc.effectiveFromYear) !== null && _c !== void 0 ? _c : null,
        dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
        description: (_d = doc.description) !== null && _d !== void 0 ? _d : null,
        isActive: Boolean(doc.isActive),
        isArchived: Boolean(doc.isArchived),
        createdBy: doc.createdBy ? String(doc.createdBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
