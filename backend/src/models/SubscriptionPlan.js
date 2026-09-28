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
exports.SubscriptionPlan = void 0;
exports.publicPlan = publicPlan;
var mongoose_1 = __importStar(require("mongoose"));
var subscriptionPlanSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10, default: 'PKR' },
    durationDays: { type: Number, required: true, min: 1, default: 30 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    isRecommended: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });
subscriptionPlanSchema.index({ displayOrder: 1, isActive: 1 });
exports.SubscriptionPlan = mongoose_1.default.models.SubscriptionPlan ||
    mongoose_1.default.model('SubscriptionPlan', subscriptionPlanSchema);
function publicPlan(p) {
    var _a;
    return {
        _id: String(p._id),
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        currency: p.currency,
        durationDays: p.durationDays,
        features: (_a = p.features) !== null && _a !== void 0 ? _a : [],
        isActive: p.isActive,
        isRecommended: p.isRecommended,
        displayOrder: p.displayOrder,
        createdAt: p.createdAt,
    };
}
