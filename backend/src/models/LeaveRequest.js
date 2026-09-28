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
exports.LeaveRequest = void 0;
var mongoose_1 = __importStar(require("mongoose"));
var leaveRequestSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    requesterType: { type: String, enum: ['student', 'teacher'], required: true },
    requesterId: { type: mongoose_1.Schema.Types.ObjectId, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, trim: true, maxlength: 300 },
    reviewedAt: { type: Date },
}, { timestamps: true, versionKey: false });
leaveRequestSchema.index({ tenantId: 1, requesterId: 1, createdAt: -1 });
leaveRequestSchema.index({ tenantId: 1, status: 1, createdAt: 1 });
exports.LeaveRequest = mongoose_1.default.models.LeaveRequest || mongoose_1.default.model('LeaveRequest', leaveRequestSchema);
