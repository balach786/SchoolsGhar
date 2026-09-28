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
exports.ExportPreset = void 0;
var mongoose_1 = __importStar(require("mongoose"));
var exportPresetSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    module: {
        type: String,
        enum: ['students', 'staff', 'fees', 'attendance', 'exams', 'marks', 'results', 'academic'],
        required: true,
    },
    format: { type: String, enum: ['xlsx', 'csv'], default: 'xlsx' },
    filters: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
exportPresetSchema.index({ tenantId: 1, name: 1 }, { unique: true });
exports.ExportPreset = mongoose_1.default.models.ExportPreset || mongoose_1.default.model('ExportPreset', exportPresetSchema);
