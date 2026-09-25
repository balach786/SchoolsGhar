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
exports.FeeDiscount = exports.feeDiscountSchema = void 0;
exports.publicFeeDiscount = publicFeeDiscount;
var mongoose_1 = __importStar(require("mongoose"));
exports.feeDiscountSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    discountType: { type: String, enum: ['fixed', 'percentage'], required: true },
    value: { type: Number, required: true, min: 1 },
    valueBps: { type: Number, min: 1, max: 10000 },
    applyTo: { type: String, enum: ['student', 'class', 'all'], required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class' },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
exports.feeDiscountSchema.index({ tenantId: 1, isActive: 1, applyTo: 1 });
exports.feeDiscountSchema.index({ tenantId: 1, studentId: 1 });
exports.feeDiscountSchema.index({ tenantId: 1, classId: 1 });
exports.FeeDiscount = mongoose_1.default.models.FeeDiscount || mongoose_1.default.model('FeeDiscount', exports.feeDiscountSchema);
function publicFeeDiscount(doc) {
    var _a;
    return {
        _id: String(doc._id),
        name: doc.name,
        discountType: doc.discountType,
        value: doc.value,
        valueBps: (_a = doc.valueBps) !== null && _a !== void 0 ? _a : (doc.discountType === 'percentage' ? doc.value : null),
        applyTo: doc.applyTo,
        classId: doc.classId ? String(doc.classId) : null,
        studentId: doc.studentId ? String(doc.studentId) : null,
        isActive: Boolean(doc.isActive),
        createdBy: doc.createdBy ? String(doc.createdBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
