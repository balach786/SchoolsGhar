"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePaymentReversal = executePaymentReversal;
var mongoose_1 = __importDefault(require("mongoose"));
var ApiError_1 = require("../utils/ApiError");
var PaymentReversal_1 = require("../models/PaymentReversal");
var ReceiptCounter_1 = require("../models/ReceiptCounter");
var audit_service_1 = require("./audit.service");
var idempotency_service_1 = require("./idempotency.service");
var TenantModelRegistry_1 = require("./TenantModelRegistry");
function executePaymentReversal(actor, input, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedTenantId, tId, amount, idempotency, _a, Payment, ExamFeePayment, StudentFee, StudentExamFee, PaymentReversal, session, resultPayload_1, err_1;
        var _this = this;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    resolvedTenantId = tenantId || actor.tenantId;
                    if (!resolvedTenantId) {
                        throw ApiError_1.ApiError.badRequest('Tenant context required');
                    }
                    tId = new mongoose_1.default.Types.ObjectId(String(resolvedTenantId));
                    amount = input.amount;
                    if (!Number.isInteger(amount) || amount < 1) {
                        throw ApiError_1.ApiError.badRequest('Reversal amount must be at least 1 paisa');
                    }
                    return [4 /*yield*/, (0, idempotency_service_1.acquireIdempotency)(tId, 'payment_reversal', input.idempotencyKey, { paymentId: input.paymentId, amount: input.amount, reversalType: input.reversalType, reason: input.reason })];
                case 1:
                    idempotency = _c.sent();
                    if (idempotency.isCached && idempotency.cachedResponse) {
                        return [2 /*return*/, idempotency.cachedResponse.body];
                    }
                    if (!tenantDb) {
                        throw ApiError_1.ApiError.badRequest('Tenant database connection is required');
                    }
                    _a = (0, TenantModelRegistry_1.getTenantModels)(tenantDb), Payment = _a.Payment, ExamFeePayment = _a.ExamFeePayment, StudentFee = _a.StudentFee, StudentExamFee = _a.StudentExamFee, PaymentReversal = _a.PaymentReversal;
                    return [4 /*yield*/, mongoose_1.default.startSession()];
                case 2:
                    session = _c.sent();
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, 7, 9]);
                    return [4 /*yield*/, session.withTransaction(function () { return __awaiter(_this, void 0, void 0, function () {
                            var paymentDoc, studentId, obligationId, originalReceiptNumber, checkExists, _i, _a, alloc, fee, newAmountPaid, newRemaining, newStatus, fee, newAmountPaid, newRemaining, newStatus, checkExists, fee, newAmountPaid, newRemaining, newStatus, reversalReceiptNumber, reversalDoc;
                            var _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        if (!(input.sourceType === 'regular_fee')) return [3 /*break*/, 14];
                                        return [4 /*yield*/, Payment.findOneAndUpdate({
                                                _id: input.paymentId,
                                                tenantId: tId,
                                                refundableAmount: { $gte: amount },
                                            }, {
                                                $inc: { refundableAmount: -amount },
                                                $set: { status: input.reversalType === 'void' || input.reversalType === 'full_reversal' ? 'voided' : 'refunded' }
                                            }, { session: session, new: true, runValidators: true })];
                                    case 1:
                                        // Atomic deduction of refundableAmount on Payment
                                        paymentDoc = _d.sent();
                                        if (!!paymentDoc) return [3 /*break*/, 3];
                                        return [4 /*yield*/, Payment.findOne({ _id: input.paymentId, tenantId: tId }).session(session)];
                                    case 2:
                                        checkExists = _d.sent();
                                        if (!checkExists) {
                                            throw ApiError_1.ApiError.notFound('Payment not found in this school');
                                        }
                                        throw ApiError_1.ApiError.conflict("Requested refund amount (".concat(amount / 100, " PKR) exceeds available refundable balance (").concat(((_b = checkExists.refundableAmount) !== null && _b !== void 0 ? _b : checkExists.amount) / 100, " PKR)"), 'REFUND_EXCEEDS_AVAILABLE_AMOUNT');
                                    case 3:
                                        studentId = paymentDoc.studentId;
                                        originalReceiptNumber = paymentDoc.receiptNumber;
                                        if (!(paymentDoc.allocations && paymentDoc.allocations.length > 0)) return [3 /*break*/, 9];
                                        // We are doing a full reversal. If it's a partial refund spanning multiple allocations, 
                                        // determining which allocation gets refunded is complex. The user wants oldest-first allocations,
                                        // so a partial refund would logically refund the newest allocation first.
                                        // For simplicity and safety as requested: full void of allocations.
                                        if (amount < paymentDoc.amount) {
                                            throw ApiError_1.ApiError.badRequest('Partial refunds for multi-invoice payments are currently not supported. Please void the entire payment.');
                                        }
                                        _i = 0, _a = paymentDoc.allocations;
                                        _d.label = 4;
                                    case 4:
                                        if (!(_i < _a.length)) return [3 /*break*/, 8];
                                        alloc = _a[_i];
                                        return [4 /*yield*/, StudentFee.findOne({ _id: alloc.studentFeeId, tenantId: tId }).session(session)];
                                    case 5:
                                        fee = _d.sent();
                                        if (!fee)
                                            return [3 /*break*/, 7]; // Should not happen, but safe
                                        newAmountPaid = Math.max(0, (fee.amountPaid || 0) - alloc.amountAllocated);
                                        newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
                                        newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';
                                        return [4 /*yield*/, StudentFee.updateOne({ _id: fee._id, tenantId: tId }, { $set: { amountPaid: newAmountPaid, remainingBalance: newRemaining, status: newStatus } }, { session: session, runValidators: true })];
                                    case 6:
                                        _d.sent();
                                        _d.label = 7;
                                    case 7:
                                        _i++;
                                        return [3 /*break*/, 4];
                                    case 8:
                                        obligationId = paymentDoc.allocations[0].studentFeeId; // Track first obligation for reference
                                        return [3 /*break*/, 13];
                                    case 9:
                                        if (!paymentDoc.studentFeeId) return [3 /*break*/, 12];
                                        // Legacy single-invoice payment rollback
                                        obligationId = paymentDoc.studentFeeId;
                                        return [4 /*yield*/, StudentFee.findOne({ _id: obligationId, tenantId: tId }).session(session)];
                                    case 10:
                                        fee = _d.sent();
                                        if (!fee)
                                            throw ApiError_1.ApiError.notFound('Associated student fee obligation not found');
                                        newAmountPaid = Math.max(0, (fee.amountPaid || 0) - amount);
                                        newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
                                        newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';
                                        return [4 /*yield*/, StudentFee.updateOne({ _id: fee._id, tenantId: tId }, {
                                                $set: {
                                                    amountPaid: newAmountPaid,
                                                    remainingBalance: newRemaining,
                                                    status: newStatus,
                                                },
                                            }, { session: session, runValidators: true })];
                                    case 11:
                                        _d.sent();
                                        return [3 /*break*/, 13];
                                    case 12: throw ApiError_1.ApiError.badRequest('Payment has no linked fee obligations to reverse');
                                    case 13: return [3 /*break*/, 21];
                                    case 14:
                                        if (!(input.sourceType === 'exam_fee')) return [3 /*break*/, 20];
                                        return [4 /*yield*/, ExamFeePayment.findOneAndUpdate({
                                                _id: input.paymentId,
                                                tenantId: tId,
                                                refundableAmount: { $gte: amount },
                                            }, { $inc: { refundableAmount: -amount } }, { session: session, new: true, runValidators: true })];
                                    case 15:
                                        // Atomic deduction of refundableAmount on ExamFeePayment
                                        paymentDoc = _d.sent();
                                        if (!!paymentDoc) return [3 /*break*/, 17];
                                        return [4 /*yield*/, ExamFeePayment.findOne({ _id: input.paymentId, tenantId: tId }).session(session)];
                                    case 16:
                                        checkExists = _d.sent();
                                        if (!checkExists) {
                                            throw ApiError_1.ApiError.notFound('Exam fee payment not found in this school');
                                        }
                                        throw ApiError_1.ApiError.conflict("Requested refund amount (".concat(amount / 100, " PKR) exceeds available refundable balance (").concat(((_c = checkExists.refundableAmount) !== null && _c !== void 0 ? _c : checkExists.amount) / 100, " PKR)"), 'REFUND_EXCEEDS_AVAILABLE_AMOUNT');
                                    case 17:
                                        studentId = paymentDoc.studentId;
                                        obligationId = paymentDoc.studentExamFeeId;
                                        originalReceiptNumber = paymentDoc.receiptNumber;
                                        return [4 /*yield*/, StudentExamFee.findOne({ _id: obligationId, tenantId: tId }).session(session)];
                                    case 18:
                                        fee = _d.sent();
                                        if (!fee)
                                            throw ApiError_1.ApiError.notFound('Associated student exam fee obligation not found');
                                        newAmountPaid = Math.max(0, fee.amountPaid - amount);
                                        newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
                                        newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';
                                        return [4 /*yield*/, StudentExamFee.updateOne({ _id: fee._id, tenantId: tId }, {
                                                $set: {
                                                    amountPaid: newAmountPaid,
                                                    remainingBalance: newRemaining,
                                                    status: newStatus,
                                                },
                                            }, { session: session, runValidators: true })];
                                    case 19:
                                        _d.sent();
                                        return [3 /*break*/, 21];
                                    case 20: throw ApiError_1.ApiError.badRequest('Invalid reversal sourceType');
                                    case 21: return [4 /*yield*/, (0, ReceiptCounter_1.nextReceiptNumber)(new Date(), 'REV', String(tId), session, tenantDb)];
                                    case 22:
                                        reversalReceiptNumber = _d.sent();
                                        return [4 /*yield*/, PaymentReversal.create([
                                                {
                                                    tenantId: tId,
                                                    sourceType: input.sourceType,
                                                    paymentId: paymentDoc._id,
                                                    studentId: studentId,
                                                    obligationId: obligationId,
                                                    originalReceiptNumber: originalReceiptNumber,
                                                    reversalReceiptNumber: reversalReceiptNumber,
                                                    amount: amount,
                                                    reversalType: input.reversalType,
                                                    reason: input.reason,
                                                    initiatedBy: actor._id,
                                                    notes: input.notes,
                                                },
                                            ], { session: session, runValidators: true })];
                                    case 23:
                                        reversalDoc = (_d.sent())[0];
                                        // Audit log within transaction
                                        return [4 /*yield*/, (0, audit_service_1.recordAuditWithSession)('payments', input.reversalType === 'full_reversal' ? 'PAYMENT_REVERSED' : 'PAYMENT_REFUNDED', actor, String(paymentDoc._id), {
                                                reversalId: String(reversalDoc._id),
                                                reversalReceiptNumber: reversalReceiptNumber,
                                                originalReceiptNumber: originalReceiptNumber,
                                                amount: amount,
                                                reversalType: input.reversalType,
                                                reason: input.reason,
                                            }, session, 'tenant', tId)];
                                    case 24:
                                        // Audit log within transaction
                                        _d.sent();
                                        resultPayload_1 = {
                                            reversal: (0, PaymentReversal_1.publicPaymentReversal)(reversalDoc),
                                            refundableRemaining: paymentDoc.refundableAmount,
                                        };
                                        // Complete idempotency inside session
                                        return [4 /*yield*/, (0, idempotency_service_1.completeIdempotency)(idempotency.recordKey, { reversalId: String(reversalDoc._id), receiptNumber: reversalReceiptNumber }, 201, resultPayload_1, session, idempotency.ownerToken)];
                                    case 25:
                                        // Complete idempotency inside session
                                        _d.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _c.sent();
                    return [2 /*return*/, resultPayload_1];
                case 5:
                    err_1 = _c.sent();
                    return [4 /*yield*/, (0, idempotency_service_1.releaseIdempotency)(idempotency.recordKey, idempotency.ownerToken)];
                case 6:
                    _c.sent();
                    throw err_1;
                case 7:
                    (_b = idempotency.stopHeartbeat) === null || _b === void 0 ? void 0 : _b.call(idempotency);
                    return [4 /*yield*/, session.endSession()];
                case 8:
                    _c.sent();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
