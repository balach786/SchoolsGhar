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
exports.FeeSetting = exports.feeSettingSchema = void 0;
exports.publicFeeSetting = publicFeeSetting;
var mongoose_1 = __importStar(require("mongoose"));
exports.feeSettingSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    admissionFee: {
        enabled: { type: Boolean, default: true },
        allowReAdmission: { type: Boolean, default: false },
    },
    otherFee: {
        enabled: { type: Boolean, default: false },
        feeName: { type: String, trim: true, maxlength: 120, default: 'Other Fee' },
        defaultAmount: { type: Number, default: 0, min: 0 },
    },
    lateFee: {
        enabled: { type: Boolean, default: false },
        lateFeeAmount: { type: Number, default: 0, min: 0 },
        gracePeriodDays: { type: Number, default: 0, min: 0, max: 31 },
    },
    dueDate: {
        enabled: { type: Boolean, default: true },
        defaultMonthlyDueDay: { type: Number, default: 10, min: 1, max: 28 },
    },
    discount: {
        enabled: { type: Boolean, default: true },
        allowDiscountStacking: { type: Boolean, default: false },
    },
    updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
exports.FeeSetting = mongoose_1.default.models.FeeSetting || mongoose_1.default.model('FeeSetting', exports.feeSettingSchema);
function publicFeeSetting(doc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    return {
        _id: String(doc._id),
        admissionFee: {
            enabled: Boolean((_a = doc.admissionFee) === null || _a === void 0 ? void 0 : _a.enabled),
            allowReAdmission: Boolean((_b = doc.admissionFee) === null || _b === void 0 ? void 0 : _b.allowReAdmission),
        },
        otherFee: {
            enabled: Boolean((_c = doc.otherFee) === null || _c === void 0 ? void 0 : _c.enabled),
            feeName: ((_d = doc.otherFee) === null || _d === void 0 ? void 0 : _d.feeName) || 'Other Fee',
            defaultAmount: (_f = (_e = doc.otherFee) === null || _e === void 0 ? void 0 : _e.defaultAmount) !== null && _f !== void 0 ? _f : 0,
        },
        lateFee: {
            enabled: Boolean((_g = doc.lateFee) === null || _g === void 0 ? void 0 : _g.enabled),
            lateFeeAmount: (_j = (_h = doc.lateFee) === null || _h === void 0 ? void 0 : _h.lateFeeAmount) !== null && _j !== void 0 ? _j : 0,
            gracePeriodDays: (_l = (_k = doc.lateFee) === null || _k === void 0 ? void 0 : _k.gracePeriodDays) !== null && _l !== void 0 ? _l : 0,
        },
        dueDate: {
            enabled: Boolean((_m = doc.dueDate) === null || _m === void 0 ? void 0 : _m.enabled),
            defaultMonthlyDueDay: (_p = (_o = doc.dueDate) === null || _o === void 0 ? void 0 : _o.defaultMonthlyDueDay) !== null && _p !== void 0 ? _p : 10,
        },
        discount: {
            enabled: Boolean((_q = doc.discount) === null || _q === void 0 ? void 0 : _q.enabled),
            allowDiscountStacking: Boolean((_r = doc.discount) === null || _r === void 0 ? void 0 : _r.allowDiscountStacking),
        },
        updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
