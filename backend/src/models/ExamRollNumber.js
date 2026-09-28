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
exports.ExamRollNumber = void 0;
var mongoose_1 = __importStar(require("mongoose"));
var examRollNumberSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    examRollNumber: { type: Number, required: true },
    block: { type: String, trim: true },
    seatNumber: { type: String, trim: true },
}, { timestamps: true, versionKey: false });
examRollNumberSchema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true });
examRollNumberSchema.index({ tenantId: 1, examId: 1, examRollNumber: 1 }, { unique: true });
examRollNumberSchema.index({ tenantId: 1, examId: 1, block: 1, seatNumber: 1 }, { unique: true, partialFilterExpression: { block: { $type: "string" }, seatNumber: { $type: "string" } } });
exports.ExamRollNumber = mongoose_1.default.models.ExamRollNumber || mongoose_1.default.model('ExamRollNumber', examRollNumberSchema);
