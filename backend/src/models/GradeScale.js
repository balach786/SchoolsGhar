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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeScale = void 0;
exports.publicGradeScale = publicGradeScale;
exports.gradeForPercentage = gradeForPercentage;
var mongoose_1 = __importStar(require("mongoose"));
var boundarySchema = new mongoose_1.Schema({
    grade: { type: String, required: true, trim: true, minlength: 1, maxlength: 8 },
    minPercentage: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });
var gradeScaleSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    isDefault: { type: Boolean, default: false },
    boundaries: { type: [boundarySchema], required: true },
}, { timestamps: true, versionKey: false });
gradeScaleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
gradeScaleSchema.index({ tenantId: 1, isDefault: 1 });
exports.GradeScale = mongoose_1.default.models.GradeScale || mongoose_1.default.model('GradeScale', gradeScaleSchema);
/** Public serializer (no surprises, stable field list). */
function publicGradeScale(doc) {
    var _a;
    return {
        _id: String(doc._id),
        name: doc.name,
        isDefault: Boolean(doc.isDefault),
        boundaries: ((_a = doc.boundaries) !== null && _a !== void 0 ? _a : []).map(function (b) { return ({
            grade: b.grade,
            minPercentage: b.minPercentage,
        }); }),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
/**
 * Resolve a grade for a percentage against a scale whose boundaries are
 * sorted descending by minPercentage. Returns null when no boundary applies.
 */
function gradeForPercentage(boundaries, percentage) {
    var sorted = __spreadArray([], boundaries, true).sort(function (a, b) { return b.minPercentage - a.minPercentage; });
    for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
        var b = sorted_1[_i];
        if (percentage >= b.minPercentage)
            return b.grade;
    }
    return null;
}
