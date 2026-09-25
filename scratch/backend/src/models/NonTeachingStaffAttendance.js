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
exports.NonTeachingStaffAttendance = exports.nonTeachingStaffAttendanceSchema = void 0;
var mongoose_1 = __importStar(require("mongoose"));
exports.nonTeachingStaffAttendanceSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    staffId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Staff', required: true },
    attendanceDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
exports.nonTeachingStaffAttendanceSchema.index({ tenantId: 1, staffId: 1, attendanceDate: 1 }, { unique: true });
exports.nonTeachingStaffAttendanceSchema.index({ tenantId: 1, attendanceDate: 1 });
exports.NonTeachingStaffAttendance = mongoose_1.default.models.NonTeachingStaffAttendance || mongoose_1.default.model('NonTeachingStaffAttendance', exports.nonTeachingStaffAttendanceSchema);
