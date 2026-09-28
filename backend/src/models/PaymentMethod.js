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
exports.PaymentMethod = exports.paymentMethodSchema = void 0;
exports.publicPaymentMethod = publicPaymentMethod;
var mongoose_1 = __importStar(require("mongoose"));
exports.paymentMethodSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    accountTitle: { type: String, required: true, trim: true, maxlength: 100 },
    accountNumber: { type: String, required: true, trim: true, maxlength: 60 },
    iban: { type: String, trim: true, maxlength: 60 },
    instructions: { type: String, trim: true, maxlength: 500, default: '' },
    qrCodeUrl: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });
exports.paymentMethodSchema.index({ displayOrder: 1, isActive: 1 });
exports.PaymentMethod = mongoose_1.default.models.PaymentMethod ||
    mongoose_1.default.model('PaymentMethod', exports.paymentMethodSchema);
function publicPaymentMethod(m) {
    var _a, _b;
    return {
        _id: String(m._id),
        name: m.name,
        slug: m.slug,
        accountTitle: m.accountTitle,
        accountNumber: m.accountNumber,
        iban: (_a = m.iban) !== null && _a !== void 0 ? _a : null,
        instructions: m.instructions,
        qrCodeUrl: (_b = m.qrCodeUrl) !== null && _b !== void 0 ? _b : null,
        isActive: m.isActive,
        displayOrder: m.displayOrder,
        createdAt: m.createdAt,
    };
}
