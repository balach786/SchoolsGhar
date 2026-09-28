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
exports.SchoolSettings = void 0;
exports.publicSchoolSettings = publicSchoolSettings;
var mongoose_1 = __importStar(require("mongoose"));
var schoolSettingsSchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    schoolName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120, default: 'School Management System' },
    schoolLogoUrl: { type: String, trim: true, maxlength: 500 },
    address: { type: String, trim: true, maxlength: 300 },
    phone: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, maxlength: 120 },
    website: { type: String, trim: true, maxlength: 200 },
    principalName: { type: String, trim: true, maxlength: 120 },
    activeSessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession' },
    currency: { type: String, trim: true, maxlength: 8, default: 'PKR' },
    receiptPrefix: { type: String, trim: true, maxlength: 12, default: 'RCPT' },
    receiptSettings: {
        showLogo: { type: Boolean, default: true },
        showAddress: { type: Boolean, default: true },
        showPhone: { type: Boolean, default: true },
        signatureLabel: { type: String, trim: true, maxlength: 60, default: 'Authorized Signatory' },
        footerText: { type: String, trim: true, maxlength: 200 },
    },
    resultCardSettings: {
        showLogo: { type: Boolean, default: true },
        showPosition: { type: Boolean, default: true },
        showGrade: { type: Boolean, default: true },
        signatureLabel: { type: String, trim: true, maxlength: 60, default: 'Class Teacher' },
        footerText: { type: String, trim: true, maxlength: 200 },
    },
    themeSettings: {
        accentColor: { type: String, trim: true, maxlength: 20 },
        compactSidebar: { type: Boolean, default: false },
    },
    examSettings: {
        defaultRequireFeeForAdmitCard: { type: Boolean, default: false },
    },
}, { timestamps: true, versionKey: false });
exports.SchoolSettings = mongoose_1.default.models.SchoolSettings || mongoose_1.default.model('SchoolSettings', schoolSettingsSchema);
function publicSchoolSettings(doc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9;
    return {
        schoolName: doc.schoolName,
        schoolLogoUrl: (_a = doc.schoolLogoUrl) !== null && _a !== void 0 ? _a : null,
        address: (_b = doc.address) !== null && _b !== void 0 ? _b : null,
        phone: (_c = doc.phone) !== null && _c !== void 0 ? _c : null,
        email: (_d = doc.email) !== null && _d !== void 0 ? _d : null,
        website: (_e = doc.website) !== null && _e !== void 0 ? _e : null,
        principalName: (_f = doc.principalName) !== null && _f !== void 0 ? _f : null,
        activeSessionId: doc.activeSessionId ? String(doc.activeSessionId) : null,
        currency: (_g = doc.currency) !== null && _g !== void 0 ? _g : 'PKR',
        receiptPrefix: (_h = doc.receiptPrefix) !== null && _h !== void 0 ? _h : 'RCPT',
        receiptSettings: {
            showLogo: (_k = (_j = doc.receiptSettings) === null || _j === void 0 ? void 0 : _j.showLogo) !== null && _k !== void 0 ? _k : true,
            showAddress: (_m = (_l = doc.receiptSettings) === null || _l === void 0 ? void 0 : _l.showAddress) !== null && _m !== void 0 ? _m : true,
            showPhone: (_p = (_o = doc.receiptSettings) === null || _o === void 0 ? void 0 : _o.showPhone) !== null && _p !== void 0 ? _p : true,
            signatureLabel: (_r = (_q = doc.receiptSettings) === null || _q === void 0 ? void 0 : _q.signatureLabel) !== null && _r !== void 0 ? _r : 'Authorized Signatory',
            footerText: (_t = (_s = doc.receiptSettings) === null || _s === void 0 ? void 0 : _s.footerText) !== null && _t !== void 0 ? _t : null,
        },
        resultCardSettings: {
            showLogo: (_v = (_u = doc.resultCardSettings) === null || _u === void 0 ? void 0 : _u.showLogo) !== null && _v !== void 0 ? _v : true,
            showPosition: (_x = (_w = doc.resultCardSettings) === null || _w === void 0 ? void 0 : _w.showPosition) !== null && _x !== void 0 ? _x : true,
            showGrade: (_z = (_y = doc.resultCardSettings) === null || _y === void 0 ? void 0 : _y.showGrade) !== null && _z !== void 0 ? _z : true,
            signatureLabel: (_1 = (_0 = doc.resultCardSettings) === null || _0 === void 0 ? void 0 : _0.signatureLabel) !== null && _1 !== void 0 ? _1 : 'Class Teacher',
            footerText: (_3 = (_2 = doc.resultCardSettings) === null || _2 === void 0 ? void 0 : _2.footerText) !== null && _3 !== void 0 ? _3 : null,
        },
        themeSettings: {
            accentColor: (_5 = (_4 = doc.themeSettings) === null || _4 === void 0 ? void 0 : _4.accentColor) !== null && _5 !== void 0 ? _5 : null,
            compactSidebar: (_7 = (_6 = doc.themeSettings) === null || _6 === void 0 ? void 0 : _6.compactSidebar) !== null && _7 !== void 0 ? _7 : false,
        },
        examSettings: {
            defaultRequireFeeForAdmitCard: (_9 = (_8 = doc.examSettings) === null || _8 === void 0 ? void 0 : _8.defaultRequireFeeForAdmitCard) !== null && _9 !== void 0 ? _9 : false,
        },
        updatedAt: doc.updatedAt,
    };
}
