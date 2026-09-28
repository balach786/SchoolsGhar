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
exports.Expense = exports.expenseSchema = void 0;
exports.publicExpense = publicExpense;
var mongoose_1 = __importStar(require("mongoose"));
exports.expenseSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: false, index: true },
    category: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    amount: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' } },
    date: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    reference: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    isArchived: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
exports.expenseSchema.index({ tenantId: 1, date: 1 });
exports.expenseSchema.index({ tenantId: 1, category: 1, date: 1 });
exports.Expense = mongoose_1.default.models.Expense || mongoose_1.default.model('Expense', exports.expenseSchema);
function publicExpense(doc) {
    var _a, _b;
    return {
        _id: String(doc._id),
        examId: doc.examId ? String(doc.examId) : undefined,
        category: doc.category,
        title: doc.title,
        amount: doc.amount,
        date: new Date(doc.date).toISOString(),
        description: (_a = doc.description) !== null && _a !== void 0 ? _a : null,
        reference: (_b = doc.reference) !== null && _b !== void 0 ? _b : null,
        createdBy: doc.createdBy ? String(doc.createdBy) : null,
        isArchived: Boolean(doc.isArchived),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
