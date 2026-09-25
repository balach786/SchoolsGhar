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
exports.SchoolClosure = exports.schoolClosureSchema = void 0;
var mongoose_1 = __importStar(require("mongoose"));
exports.schoolClosureSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    date: { type: Date, required: true },
    dateString: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: {
        type: String,
        enum: ['official_leave', 'school_closed'],
        required: true,
        default: 'official_leave',
    },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    reasonCategory: {
        type: String,
        trim: true,
        default: 'other',
    },
    notes: { type: String, trim: true, maxlength: 500 },
    applicableTo: {
        type: String,
        enum: ['all', 'students', 'staff'],
        default: 'all',
    },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// One closure entry per date per tenant per applicable group (usually 'all')
exports.schoolClosureSchema.index({ tenantId: 1, dateString: 1, applicableTo: 1 }, { unique: true });
exports.schoolClosureSchema.index({ tenantId: 1, date: 1 });
exports.SchoolClosure = mongoose_1.default.models.SchoolClosure || mongoose_1.default.model('SchoolClosure', exports.schoolClosureSchema);
