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
exports.TemporaryAssignment = exports.temporaryAssignmentSchema = void 0;
exports.publicTemporaryAssignment = publicTemporaryAssignment;
var mongoose_1 = __importStar(require("mongoose"));
exports.temporaryAssignmentSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    permanentTeacherId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Staff' },
    substituteTeacherId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Staff', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active', index: true },
    assignedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Indexes for querying active assignments
exports.temporaryAssignmentSchema.index({ tenantId: 1, classId: 1, status: 1 });
exports.temporaryAssignmentSchema.index({ tenantId: 1, substituteTeacherId: 1, status: 1 });
exports.TemporaryAssignment = mongoose_1.default.models.TemporaryAssignment || mongoose_1.default.model('TemporaryAssignment', exports.temporaryAssignmentSchema);
function publicTemporaryAssignment(t) {
    return {
        _id: String(t._id),
        tenantId: t.tenantId ? String(t.tenantId) : null,
        classId: String(t.classId),
        permanentTeacherId: t.permanentTeacherId ? String(t.permanentTeacherId) : null,
        substituteTeacherId: String(t.substituteTeacherId),
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        assignedBy: String(t.assignedBy),
        cancelledAt: t.cancelledAt,
        cancelledBy: t.cancelledBy ? String(t.cancelledBy) : null,
        createdAt: t.createdAt,
    };
}
