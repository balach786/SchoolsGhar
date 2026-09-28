"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.requireFeeStructure = requireFeeStructure;
exports.resolveFeeContext = resolveFeeContext;
exports.generateStudentFees = generateStudentFees;
exports.deriveFeeState = deriveFeeState;
exports.adjustStudentFee = adjustStudentFee;
exports.recordPayment = recordPayment;
exports.buildLedger = buildLedger;
exports.requireStaffForSalary = requireStaffForSalary;
exports.createSalaryRecord = createSalaryRecord;
exports.ownStudentScope = ownStudentScope;
var mongoose_1 = __importDefault(require("mongoose"));
var ApiError_1 = require("../utils/ApiError");
var ReceiptCounter_1 = require("../models/ReceiptCounter");
var attendance_service_1 = require("./attendance.service");
var TenantModelRegistry_1 = require("./TenantModelRegistry");
var idempotency_service_1 = require("./idempotency.service");
var financialReference_service_1 = require("./financialReference.service");
var audit_service_1 = require("./audit.service");
/**
 * Finance service — Hardened in Phase 4E.
 *
 * MONEY REPRESENTATION: All money fields are integer paisa (PKR 1,500.00 → 150000).
 * All calculations use integer arithmetic; balances, status, and receipt numbers
 * are strictly server-owned.
 *
 * CONSISTENCY & INTEGRITY STRATEGY:
 * - Strict tenant isolation on every read and write (fails closed).
 * - Multi-document MongoDB transactions (ClientSession.withTransaction) guarantee
 *   all-or-nothing atomicity across fee balance, payment document, external reference
 *   reservation, receipt sequence, and audit log.
 * - Atomic conditional pipeline updates ($expr) prevent concurrency races and overpayment.
 * - Durable idempotency (FinancialIdempotency) prevents duplicate charges.
 * - External reference registry (FinancialReference) prevents cross-collection duplicate references.
 */
function requireFeeStructure(id, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var query, fs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = { _id: id, tenantId: new mongoose_1.default.Types.ObjectId(String(tenantId)) };
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).FeeStructure.findOne(query)];
                case 1:
                    fs = _a.sent();
                    if (!fs)
                        throw ApiError_1.ApiError.notFound('Fee structure not found');
                    return [2 /*return*/, fs];
            }
        });
    });
}
/** Validate the session → class → section chain for fee operations within a tenant. */
function resolveFeeContext(sessionId, classId, sectionId, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var tId, qSession, session, qClass, cls, section, qSection;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tId = tenantId ? new mongoose_1.default.Types.ObjectId(String(tenantId)) : undefined;
                    qSession = { _id: sessionId };
                    if (tId)
                        qSession.tenantId = tId;
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).AcademicSession.findOne(qSession)];
                case 1:
                    session = _a.sent();
                    if (!session)
                        throw ApiError_1.ApiError.notFound('Academic session not found');
                    if (session.isArchived)
                        throw ApiError_1.ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
                    if (!session.isActive)
                        throw ApiError_1.ApiError.badRequest('Fees can only be created for the active academic session', 'SESSION_INACTIVE');
                    qClass = { _id: classId };
                    if (tId)
                        qClass.tenantId = tId;
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Class.findOne(qClass)];
                case 2:
                    cls = _a.sent();
                    if (!cls)
                        throw ApiError_1.ApiError.notFound('Class not found');
                    if (cls.isArchived)
                        throw ApiError_1.ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
                    if (String(cls.sessionId) !== String(session._id)) {
                        throw ApiError_1.ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
                    }
                    section = null;
                    if (!sectionId) return [3 /*break*/, 4];
                    qSection = { _id: sectionId };
                    if (tId)
                        qSection.tenantId = tId;
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Section.findOne(qSection)];
                case 3:
                    section = _a.sent();
                    if (!section)
                        throw ApiError_1.ApiError.notFound('Section not found');
                    if (section.isArchived)
                        throw ApiError_1.ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
                    if (String(section.classId) !== String(cls._id)) {
                        throw ApiError_1.ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
                    }
                    _a.label = 4;
                case 4: return [2 /*return*/, { session: session, cls: cls, section: section }];
            }
        });
    });
}
/**
 * Generate StudentFee records for eligible students from a fee structure.
 * Copies getTenantModels(tenantDb!).FeeStructure.title into getTenantModels(tenantDb!).StudentFee.title as an immutable historical snapshot.
 */
function generateStudentFees(actor, input, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var sessionId, classId, sectionId, feeStructureId, studentIds, tenantId, structure, eligibility, eligible, targets, wanted_1, matched, existing, existingSet, docs, err_1, after;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    sessionId = input.sessionId, classId = input.classId, sectionId = input.sectionId, feeStructureId = input.feeStructureId, studentIds = input.studentIds;
                    tenantId = actor.tenantId;
                    if (!tenantId)
                        throw ApiError_1.ApiError.badRequest('Tenant context required');
                    return [4 /*yield*/, requireFeeStructure(feeStructureId, tenantId, tenantDb)];
                case 1:
                    structure = _b.sent();
                    if (structure.isArchived)
                        throw ApiError_1.ApiError.badRequest('Fee structure is archived', 'FEE_STRUCTURE_ARCHIVED');
                    if (String(structure.sessionId) !== String(sessionId) || String(structure.classId) !== String(classId)) {
                        throw ApiError_1.ApiError.badRequest('Fee structure does not belong to the selected session/class', 'INVALID_FEE_STRUCTURE');
                    }
                    return [4 /*yield*/, resolveFeeContext(sessionId, classId, sectionId, tenantId, tenantDb)];
                case 2:
                    _b.sent();
                    eligibility = __assign({ tenantId: structure.tenantId, sessionId: sessionId, classId: classId, isArchived: false, isActive: true }, (sectionId ? { sectionId: sectionId } : {}));
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Student.find(eligibility).select('_id sectionId').lean()];
                case 3:
                    eligible = _b.sent();
                    targets = eligible;
                    if (studentIds === null || studentIds === void 0 ? void 0 : studentIds.length) {
                        wanted_1 = new Set(studentIds.map(String));
                        matched = eligible.filter(function (s) { return wanted_1.has(String(s._id)); });
                        if (matched.length !== studentIds.length) {
                            throw ApiError_1.ApiError.badRequest('One or more selected students are not eligible for this fee', 'INVALID_STUDENT_SELECTION');
                        }
                        targets = matched;
                    }
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.find({
                            tenantId: structure.tenantId,
                            feeStructureId: structure._id,
                            studentId: { $in: targets.map(function (t) { return t._id; }) },
                        })
                            .select('studentId')
                            .lean()];
                case 4:
                    existing = _b.sent();
                    existingSet = new Set(existing.map(function (e) { return String(e.studentId); }));
                    docs = targets
                        .filter(function (t) { return !existingSet.has(String(t._id)); })
                        .map(function (t) {
                        var _a;
                        return ({
                            tenantId: structure.tenantId,
                            studentId: t._id,
                            sessionId: structure.sessionId,
                            classId: structure.classId,
                            sectionId: t.sectionId,
                            feeStructureId: structure._id,
                            title: structure.title, // Immutable snapshot of title at creation time
                            feeType: structure.feeType,
                            month: (_a = structure.month) !== null && _a !== void 0 ? _a : null,
                            originalAmount: structure.amount,
                            discountAmount: 0,
                            scholarshipAmount: 0,
                            fineAmount: 0,
                            netPayable: structure.amount,
                            amountPaid: 0,
                            remainingBalance: structure.amount,
                            status: 'unpaid',
                            dueDate: structure.dueDate,
                            createdBy: actor._id ? new mongoose_1.default.Types.ObjectId(actor._id) : undefined,
                        });
                    });
                    if (!docs.length) return [3 /*break*/, 8];
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.insertMany(docs, { ordered: false })];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    err_1 = _b.sent();
                    if (!((_a = err_1 === null || err_1 === void 0 ? void 0 : err_1.message) === null || _a === void 0 ? void 0 : _a.includes('E11000')))
                        throw err_1;
                    return [3 /*break*/, 8];
                case 8: return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.countDocuments({
                        tenantId: structure.tenantId,
                        feeStructureId: structure._id,
                        studentId: { $in: targets.map(function (t) { return t._id; }) },
                    })];
                case 9:
                    after = _b.sent();
                    return [2 /*return*/, { created: Math.max(0, after - existingSet.size), skipped: existingSet.size }];
            }
        });
    });
}
/** Recompute netPayable/remaining/status helpers — integers only. */
function deriveFeeState(original, discount, scholarship, fine, paid) {
    var netPayable = original - discount - scholarship + fine;
    var remainingBalance = Math.max(0, netPayable - paid);
    var status = remainingBalance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { netPayable: netPayable, remainingBalance: remainingBalance, status: status };
}
/**
 * Apply discount/scholarship/fine adjustments.
 * Guard: Net payable cannot fall below the amount already paid.
 */
function adjustStudentFee(fee, patch, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var nextDiscount, nextScholarship, nextFine, _a, netPayable, remainingBalance, status, updatedFee;
        var _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    if (tenantId && String(fee.tenantId) !== String(tenantId)) {
                        throw ApiError_1.ApiError.notFound('Student fee not found');
                    }
                    nextDiscount = (_c = (_b = patch.discountAmount) !== null && _b !== void 0 ? _b : fee.discountAmount) !== null && _c !== void 0 ? _c : 0;
                    nextScholarship = (_e = (_d = patch.scholarshipAmount) !== null && _d !== void 0 ? _d : fee.scholarshipAmount) !== null && _e !== void 0 ? _e : 0;
                    nextFine = (_g = (_f = patch.fineAmount) !== null && _f !== void 0 ? _f : fee.fineAmount) !== null && _g !== void 0 ? _g : 0;
                    _a = deriveFeeState(fee.originalAmount, nextDiscount, nextScholarship, nextFine, (_h = fee.amountPaid) !== null && _h !== void 0 ? _h : 0), netPayable = _a.netPayable, remainingBalance = _a.remainingBalance, status = _a.status;
                    if (netPayable < 0) {
                        throw ApiError_1.ApiError.unprocessable('Adjustments cannot make the net payable negative', 'INVALID_ADJUSTMENT');
                    }
                    if (netPayable < ((_j = fee.amountPaid) !== null && _j !== void 0 ? _j : 0)) {
                        throw ApiError_1.ApiError.unprocessable('Net payable cannot fall below the amount already paid. Please issue a refund first.', 'FEE_ADJUSTMENT_REQUIRES_REFUND');
                    }
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.findOneAndUpdate({
                            _id: fee._id,
                            tenantId: fee.tenantId,
                            amountPaid: { $lte: netPayable },
                        }, {
                            $set: {
                                discountAmount: nextDiscount,
                                scholarshipAmount: nextScholarship,
                                fineAmount: nextFine,
                                netPayable: netPayable,
                                remainingBalance: remainingBalance,
                                status: status,
                            },
                        }, { new: true, runValidators: true })];
                case 1:
                    updatedFee = _k.sent();
                    if (!updatedFee) {
                        throw ApiError_1.ApiError.unprocessable('Net payable cannot fall below the amount already paid. Please issue a refund first.', 'FEE_ADJUSTMENT_REQUIRES_REFUND');
                    }
                    fee.discountAmount = nextDiscount;
                    fee.scholarshipAmount = nextScholarship;
                    fee.fineAmount = nextFine;
                    fee.netPayable = netPayable;
                    fee.remainingBalance = remainingBalance;
                    fee.status = status;
                    return [2 /*return*/, updatedFee];
            }
        });
    });
}
/**
 * Record a payment inside an atomic MongoDB ClientSession transaction.
 * - Enforces strict tenant isolation.
 * - Checks/acquires financial idempotency.
 * - Atomically checks balance and updates StudentFee via $expr.
 * - Reserves non-cash external references across regular and exam payments.
 * - Allocates unique receipt number within transaction.
 * - Creates immutable Payment record with refundableAmount.
 * - Writes AuditLog inside the transaction.
 * - Commits idempotency.
 */
function recordPayment(actor, input, tenantIdOverride, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var tenantId, tId, amount, idempotency, session, resultPayload_1, err_2;
        var _this = this;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    tenantId = tenantIdOverride || actor.tenantId;
                    if (!tenantId)
                        throw ApiError_1.ApiError.badRequest('Tenant context required');
                    tId = new mongoose_1.default.Types.ObjectId(String(tenantId));
                    amount = input.amount;
                    if (!Number.isInteger(amount) || amount < 1) {
                        throw ApiError_1.ApiError.badRequest('Payment amount must be at least 1 paisa');
                    }
                    return [4 /*yield*/, (0, idempotency_service_1.acquireIdempotency)(tId, 'fee_payment', input.idempotencyKey, { studentId: input.studentId, studentFeeId: input.studentFeeId, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference })];
                case 1:
                    idempotency = _b.sent();
                    if (idempotency.isCached && idempotency.cachedResponse) {
                        return [2 /*return*/, idempotency.cachedResponse.body];
                    }
                    return [4 /*yield*/, mongoose_1.default.startSession()];
                case 2:
                    session = _b.sent();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, 7, 9]);
                    return [4 /*yield*/, session.withTransaction(function () { return __awaiter(_this, void 0, void 0, function () {
                            var query, feesToPay, totalRemaining, remainingAmount, allocations, bulkOps, _i, feesToPay_1, fee, feeRemaining, allocated, newAmountPaid, newRemaining, newStatus, paymentDate, receiptNumber, payment, updatedFees;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        query = { tenantId: tId, studentId: new mongoose_1.default.Types.ObjectId(input.studentId), status: { $ne: 'paid' } };
                                        if (input.studentFeeId)
                                            query._id = new mongoose_1.default.Types.ObjectId(input.studentFeeId);
                                        return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.find(query)
                                                .sort({ billingYear: 1, billingMonth: 1, dueDate: 1, createdAt: 1 })
                                                .session(session)];
                                    case 1:
                                        feesToPay = _b.sent();
                                        if (feesToPay.length === 0) {
                                            throw ApiError_1.ApiError.unprocessable('No unpaid fees found for this student', 'NO_UNPAID_FEES');
                                        }
                                        totalRemaining = feesToPay.reduce(function (acc, f) { return acc + (f.netPayable - (f.amountPaid || 0)); }, 0);
                                        if (amount > totalRemaining) {
                                            throw ApiError_1.ApiError.unprocessable('Payment exceeds the remaining balance — credit balances are not supported', 'PAYMENT_EXCEEDS_BALANCE', { remainingBalance: totalRemaining });
                                        }
                                        remainingAmount = amount;
                                        allocations = [];
                                        bulkOps = [];
                                        for (_i = 0, feesToPay_1 = feesToPay; _i < feesToPay_1.length; _i++) {
                                            fee = feesToPay_1[_i];
                                            if (remainingAmount <= 0)
                                                break;
                                            feeRemaining = fee.netPayable - (fee.amountPaid || 0);
                                            if (feeRemaining <= 0)
                                                continue;
                                            allocated = Math.min(feeRemaining, remainingAmount);
                                            remainingAmount -= allocated;
                                            newAmountPaid = (fee.amountPaid || 0) + allocated;
                                            newRemaining = fee.netPayable - newAmountPaid;
                                            newStatus = newRemaining <= 0 ? 'paid' : 'partial';
                                            allocations.push({ studentFeeId: fee._id, amountAllocated: allocated, nextStatus: newStatus });
                                            bulkOps.push({
                                                updateOne: {
                                                    filter: { _id: fee._id, tenantId: tId },
                                                    update: {
                                                        $set: {
                                                            amountPaid: newAmountPaid,
                                                            remainingBalance: newRemaining,
                                                            status: newStatus,
                                                        },
                                                    },
                                                },
                                            });
                                        }
                                        if (remainingAmount > 0) {
                                            throw ApiError_1.ApiError.unprocessable('Could not allocate full payment amount', 'ALLOCATION_ERROR');
                                        }
                                        // Execute bulk updates
                                        return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.bulkWrite(bulkOps, { session: session })];
                                    case 2:
                                        // Execute bulk updates
                                        _b.sent();
                                        paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
                                        return [4 /*yield*/, (0, ReceiptCounter_1.nextReceiptNumber)(paymentDate, input.receiptPrefix || 'RCPT', String(tId), session, tenantDb)];
                                    case 3:
                                        receiptNumber = _b.sent();
                                        return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Payment.create([
                                                {
                                                    tenantId: tId,
                                                    studentId: new mongoose_1.default.Types.ObjectId(input.studentId),
                                                    studentFeeId: input.studentFeeId ? new mongoose_1.default.Types.ObjectId(input.studentFeeId) : undefined,
                                                    sessionId: feesToPay[0].sessionId, // Tie to the first fee's session conceptually
                                                    amount: amount,
                                                    refundableAmount: amount,
                                                    paymentMethod: input.paymentMethod,
                                                    paymentDate: paymentDate,
                                                    receiptNumber: receiptNumber,
                                                    reference: input.reference ? input.reference.trim() : undefined,
                                                    notes: input.notes,
                                                    allocations: allocations.map(function (a) { return ({ studentFeeId: a.studentFeeId, amountAllocated: a.amountAllocated }); }),
                                                    status: 'active',
                                                    collectedBy: actor._id,
                                                },
                                            ], { session: session })];
                                    case 4:
                                        payment = (_b.sent())[0];
                                        // 5. Reserve non-cash external reference in FinancialReference registry
                                        return [4 /*yield*/, (0, financialReference_service_1.reserveFinancialReference)(tId, input.paymentMethod, input.reference, 'regular_fee', payment._id, receiptNumber, session, tenantDb)];
                                    case 5:
                                        // 5. Reserve non-cash external reference in FinancialReference registry
                                        _b.sent();
                                        // 6. Record AuditLog inside transaction session
                                        return [4 /*yield*/, (0, audit_service_1.recordAuditWithSession)('payments', 'PAYMENT_RECORDED', actor, String(payment._id), {
                                                receiptNumber: payment.receiptNumber,
                                                amount: payment.amount,
                                                studentId: input.studentId,
                                                allocationsCount: ((_a = payment.allocations) === null || _a === void 0 ? void 0 : _a.length) || 0,
                                                paymentMethod: payment.paymentMethod,
                                            }, session, 'tenant', tId)];
                                    case 6:
                                        // 6. Record AuditLog inside transaction session
                                        _b.sent();
                                        return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.find({ _id: { $in: allocations.map(function (a) { return a.studentFeeId; }) } }).session(session)];
                                    case 7:
                                        updatedFees = _b.sent();
                                        // Keep backwards compatible fee payload for single-fee target, else return array
                                        resultPayload_1 = {
                                            payment: payment,
                                            fee: input.studentFeeId ? updatedFees[0] : null,
                                            fees: updatedFees
                                        };
                                        // 7. Commit completed idempotency outcome inside the session
                                        return [4 /*yield*/, (0, idempotency_service_1.completeIdempotency)(idempotency.recordKey, { paymentId: String(payment._id), receiptNumber: payment.receiptNumber }, 201, resultPayload_1, session, idempotency.ownerToken)];
                                    case 8:
                                        // 7. Commit completed idempotency outcome inside the session
                                        _b.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _b.sent();
                    return [2 /*return*/, resultPayload_1];
                case 5:
                    err_2 = _b.sent();
                    return [4 /*yield*/, (0, idempotency_service_1.releaseIdempotency)(idempotency.recordKey, idempotency.ownerToken)];
                case 6:
                    _b.sent();
                    throw err_2;
                case 7:
                    (_a = idempotency.stopHeartbeat) === null || _a === void 0 ? void 0 : _a.call(idempotency);
                    return [4 /*yield*/, session.endSession()];
                case 8:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/** Build the per-student fee ledger with strict tenant scoping. */
function buildLedger(studentId, opts, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var feeFilter, fees, feeIds, payFilter, payments, paymentIds, reversals, structures, titleMap, rows, _loop_1, _i, fees_1, fee, running, _a, rows_1, r;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    feeFilter = { studentId: studentId };
                    if (tenantId)
                        feeFilter.tenantId = new mongoose_1.default.Types.ObjectId(String(tenantId));
                    if (opts.sessionId)
                        feeFilter.sessionId = opts.sessionId;
                    if (opts.feeType)
                        feeFilter.feeType = opts.feeType;
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).StudentFee.find(feeFilter)
                            .select('_id feeStructureId title feeType month originalAmount discountAmount scholarshipAmount fineAmount netPayable createdAt dueDate')
                            .lean()];
                case 1:
                    fees = _h.sent();
                    feeIds = fees.map(function (f) { return f._id; });
                    payFilter = {
                        $or: [{ studentFeeId: { $in: feeIds } }, { 'allocations.studentFeeId': { $in: feeIds } }],
                    };
                    if (tenantId)
                        payFilter.tenantId = new mongoose_1.default.Types.ObjectId(String(tenantId));
                    if (opts.from || opts.to) {
                        payFilter.paymentDate = {};
                        if (opts.from)
                            payFilter.paymentDate.$gte = new Date(opts.from);
                        if (opts.to)
                            payFilter.paymentDate.$lte = new Date(new Date(opts.to).getTime() + 24 * 3600 * 1000 - 1);
                    }
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Payment.find(payFilter)
                            .select('_id studentFeeId amount paymentDate receiptNumber paymentMethod allocations status')
                            .sort({ paymentDate: 1, createdAt: 1 })
                            .lean()];
                case 2:
                    payments = _h.sent();
                    paymentIds = payments.map(function (p) { return p._id; });
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).PaymentReversal.find({ paymentId: { $in: paymentIds } }).lean()];
                case 3:
                    reversals = _h.sent();
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).FeeStructure.find(__assign({ _id: { $in: fees.map(function (f) { return f.feeStructureId; }) } }, (tenantId ? { tenantId: new mongoose_1.default.Types.ObjectId(String(tenantId)) } : {})))
                            .select('title')
                            .lean()];
                case 4:
                    structures = _h.sent();
                    titleMap = new Map(structures.map(function (s) { return [String(s._id), s.title]; }));
                    rows = [];
                    _loop_1 = function (fee) {
                        rows.push({
                            date: new Date(fee.createdAt).toISOString(),
                            kind: 'charge',
                            feeType: fee.feeType,
                            month: (_b = fee.month) !== null && _b !== void 0 ? _b : null,
                            title: fee.title || titleMap.get(String(fee.feeStructureId)) || '—',
                            charge: fee.netPayable,
                            discount: (_c = fee.discountAmount) !== null && _c !== void 0 ? _c : 0,
                            scholarship: (_d = fee.scholarshipAmount) !== null && _d !== void 0 ? _d : 0,
                            fine: (_e = fee.fineAmount) !== null && _e !== void 0 ? _e : 0,
                            payment: 0,
                            receipt: null,
                            balance: 0,
                        });
                        var _loop_2 = function (p) {
                            var allocatedToFee = 0;
                            if (p.allocations && p.allocations.length > 0) {
                                var alloc = p.allocations.find(function (a) { return String(a.studentFeeId) === String(fee._id); });
                                if (alloc)
                                    allocatedToFee = alloc.amountAllocated;
                            }
                            else if (String(p.studentFeeId) === String(fee._id)) {
                                allocatedToFee = p.amount;
                            }
                            if (allocatedToFee > 0) {
                                // Emit Payment Row
                                rows.push({
                                    date: new Date(p.paymentDate).toISOString(),
                                    kind: 'payment',
                                    feeType: fee.feeType,
                                    month: (_f = fee.month) !== null && _f !== void 0 ? _f : null,
                                    title: fee.title || titleMap.get(String(fee.feeStructureId)) || '—',
                                    charge: 0,
                                    discount: 0,
                                    scholarship: 0,
                                    fine: 0,
                                    payment: allocatedToFee,
                                    receipt: p.receiptNumber,
                                    balance: 0,
                                });
                                // Emit Reversal Rows using actual PaymentReversal records
                                var paymentReversals = reversals.filter(function (r) { return String(r.paymentId) === String(p._id); });
                                for (var _k = 0, paymentReversals_1 = paymentReversals; _k < paymentReversals_1.length; _k++) {
                                    var rev = paymentReversals_1[_k];
                                    var revAmountForThisFee = 0;
                                    if (p.allocations && p.allocations.length > 0) {
                                        // For multi-allocation, partial refunds are not supported, so we fully reverse this fee's allocation
                                        revAmountForThisFee = allocatedToFee;
                                    }
                                    else {
                                        // For single-fee, we use the actual refunded amount from this specific partial or full refund
                                        revAmountForThisFee = rev.amount;
                                    }
                                    rows.push({
                                        date: new Date(rev.createdAt).toISOString(),
                                        kind: 'reversal',
                                        feeType: fee.feeType,
                                        month: (_g = fee.month) !== null && _g !== void 0 ? _g : null,
                                        title: "Reversal: ".concat(fee.title || titleMap.get(String(fee.feeStructureId)) || '—'),
                                        charge: revAmountForThisFee, // A reversal adds back to the charge
                                        discount: 0,
                                        scholarship: 0,
                                        fine: 0,
                                        payment: 0,
                                        receipt: rev.reversalReceiptNumber,
                                        balance: 0,
                                    });
                                }
                            }
                        };
                        for (var _j = 0, payments_1 = payments; _j < payments_1.length; _j++) {
                            var p = payments_1[_j];
                            _loop_2(p);
                        }
                    };
                    for (_i = 0, fees_1 = fees; _i < fees_1.length; _i++) {
                        fee = fees_1[_i];
                        _loop_1(fee);
                    }
                    rows.sort(function (a, b) { return new Date(a.date).getTime() - new Date(b.date).getTime() || (a.kind === 'charge' ? -1 : 1); });
                    running = 0;
                    for (_a = 0, rows_1 = rows; _a < rows_1.length; _a++) {
                        r = rows_1[_a];
                        running += r.charge - r.payment;
                        r.balance = running;
                    }
                    return [2 /*return*/, rows];
            }
        });
    });
}
/** Resolve the staff profile for salary records with strict tenant verification. */
function requireStaffForSalary(staffId, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var query, staff;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = {
                        _id: staffId,
                        tenantId: new mongoose_1.default.Types.ObjectId(String(tenantId)),
                    };
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Staff.findOne(query)];
                case 1:
                    staff = _a.sent();
                    if (!staff)
                        throw ApiError_1.ApiError.notFound('Staff member not found in this school');
                    if (staff.isArchived)
                        throw ApiError_1.ApiError.badRequest('Staff member is archived', 'STAFF_ARCHIVED');
                    return [2 /*return*/, staff];
            }
        });
    });
}
/** Create a salary record with strict tenant scoping. */
function createSalaryRecord(actor, input, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedTenantId, tId, qSession, session, staff, baseAmount, adjustmentAmount, bonusAmount, netAmount, qExisting, existing;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    resolvedTenantId = tenantId || actor.tenantId;
                    if (!resolvedTenantId)
                        throw ApiError_1.ApiError.badRequest('Tenant context required');
                    tId = new mongoose_1.default.Types.ObjectId(String(resolvedTenantId));
                    qSession = { _id: input.sessionId, tenantId: tId };
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).AcademicSession.findOne(qSession)];
                case 1:
                    session = _f.sent();
                    if (!session)
                        throw ApiError_1.ApiError.notFound('Academic session not found in this school');
                    if (session.isArchived)
                        throw ApiError_1.ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
                    return [4 /*yield*/, requireStaffForSalary(input.staffId, tId, tenantDb)];
                case 2:
                    staff = _f.sent();
                    baseAmount = (_b = (_a = input.baseAmount) !== null && _a !== void 0 ? _a : staff.salary) !== null && _b !== void 0 ? _b : 0;
                    adjustmentAmount = (_c = input.adjustmentAmount) !== null && _c !== void 0 ? _c : 0;
                    bonusAmount = (_d = input.bonusAmount) !== null && _d !== void 0 ? _d : 0;
                    if (!Number.isInteger(bonusAmount) || bonusAmount < 0) {
                        throw ApiError_1.ApiError.unprocessable('Bonus amount must be a non-negative integer (paisa)', 'INVALID_BONUS');
                    }
                    netAmount = baseAmount + adjustmentAmount + bonusAmount;
                    if (netAmount < 0)
                        throw ApiError_1.ApiError.unprocessable('Net salary cannot be negative', 'INVALID_SALARY');
                    qExisting = { staffId: input.staffId, salaryMonth: input.salaryMonth, sessionId: input.sessionId, tenantId: tId };
                    return [4 /*yield*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).SalaryRecord.findOne(qExisting).select('_id').lean()];
                case 3:
                    existing = _f.sent();
                    if (existing)
                        throw ApiError_1.ApiError.conflict('A salary record already exists for this staff member and month', 'SALARY_EXISTS');
                    return [2 /*return*/, (0, TenantModelRegistry_1.getTenantModels)(tenantDb).SalaryRecord.create({
                            tenantId: tId,
                            staffId: input.staffId,
                            sessionId: input.sessionId,
                            salaryMonth: input.salaryMonth,
                            baseAmount: baseAmount,
                            adjustmentAmount: adjustmentAmount,
                            netAmount: netAmount,
                            absentDays: (_e = input.absentDays) !== null && _e !== void 0 ? _e : 0,
                            bonusAmount: bonusAmount,
                            bonusReason: input.bonusReason,
                            status: 'unpaid',
                            notes: input.notes,
                        })];
            }
        });
    });
}
/** Student-only scoping helper for fee/payment lists. */
function ownStudentScope(user, requestedStudentId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var own;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(user.role === 'student')) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, attendance_service_1.getOwnStudent)(user, tenantDb)];
                case 1:
                    own = _a.sent();
                    if (requestedStudentId && String(requestedStudentId) !== String(own._id)) {
                        throw ApiError_1.ApiError.forbidden('You can only view your own financial records', 'FINANCE_FORBIDDEN');
                    }
                    return [2 /*return*/, String(own._id)];
                case 2: return [2 /*return*/, requestedStudentId !== null && requestedStudentId !== void 0 ? requestedStudentId : ''];
            }
        });
    });
}
