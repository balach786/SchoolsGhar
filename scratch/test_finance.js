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
var mongoose_1 = __importDefault(require("mongoose"));
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../backend/.env') });
var MasterConnectionManager_1 = require("../backend/src/services/MasterConnectionManager");
var TenantConnectionManager_1 = require("../backend/src/services/TenantConnectionManager");
var MasterModelRegistry_1 = require("../backend/src/services/MasterModelRegistry");
var TenantModelRegistry_1 = require("../backend/src/services/TenantModelRegistry");
var finance_service_1 = require("../backend/src/services/finance.service");
var reversal_service_1 = require("../backend/src/services/reversal.service");
var financialReference_service_1 = require("../backend/src/services/financialReference.service");
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var masterDb, Tenant, tenants, tenant1, tenant2, tenantDb1, tenantDb2, models1, models2, user1, student, fee, updatedFee, ledger1, payment1, refString, payment2, examFee, examFeeRefRejected, session, err_1, reversal, crossTenantFailed, pt, err_2;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, mongoose_1.default.connect(process.env.MONGODB_URI)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, MasterConnectionManager_1.getMasterConnection)()];
                case 2:
                    masterDb = _a.sent();
                    Tenant = (0, MasterModelRegistry_1.getMasterModels)(masterDb).Tenant;
                    return [4 /*yield*/, Tenant.find().limit(2).lean()];
                case 3:
                    tenants = _a.sent();
                    if (tenants.length < 2)
                        throw new Error('Need at least 2 tenants for cross-tenant test');
                    tenant1 = tenants[0];
                    tenant2 = tenants[1];
                    return [4 /*yield*/, (0, TenantConnectionManager_1.getTenantConnection)(tenant1.databaseName)];
                case 4:
                    tenantDb1 = _a.sent();
                    return [4 /*yield*/, (0, TenantConnectionManager_1.getTenantConnection)(tenant2.databaseName)];
                case 5:
                    tenantDb2 = _a.sent();
                    models1 = (0, TenantModelRegistry_1.getTenantModels)(tenantDb1);
                    models2 = (0, TenantModelRegistry_1.getTenantModels)(tenantDb2);
                    user1 = { _id: new mongoose_1.default.Types.ObjectId(), tenantId: String(tenant1._id), role: 'admin' };
                    // 1. Create unpaid StudentFee
                    console.log('1. Creating unpaid StudentFee...');
                    return [4 /*yield*/, models1.Student.findOne().lean()];
                case 6:
                    student = _a.sent();
                    if (!student)
                        throw new Error('No student found in tenant1');
                    return [4 /*yield*/, models1.StudentFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            sessionId: student.sessionId,
                            feeStructureId: new mongoose_1.default.Types.ObjectId(),
                            feeType: 'monthly_tuition',
                            originalAmount: 1000000,
                            netPayable: 1000000,
                            remainingBalance: 1000000,
                            status: 'unpaid'
                        })];
                case 7:
                    fee = _a.sent();
                    // 2. Apply discount
                    console.log('2. Applying discount...');
                    return [4 /*yield*/, (0, finance_service_1.adjustStudentFee)(fee, { discountAmount: 100000 }, tenant1._id, tenantDb1)];
                case 8:
                    _a.sent();
                    // 3. Verify amount recalculation
                    console.log('3. Verify amount recalculation...');
                    return [4 /*yield*/, models1.StudentFee.findById(fee._id)];
                case 9:
                    updatedFee = _a.sent();
                    if (updatedFee.netPayable !== 900000)
                        throw new Error('Discount amount recalculation failed');
                    // 4. Apply fine
                    console.log('4. Applying fine...');
                    return [4 /*yield*/, (0, finance_service_1.adjustStudentFee)(updatedFee, { fineAmount: 50000 }, tenant1._id, tenantDb1)];
                case 10:
                    _a.sent();
                    // 5. Verify remaining balance
                    console.log('5. Verify remaining balance...');
                    return [4 /*yield*/, models1.StudentFee.findById(fee._id)];
                case 11:
                    updatedFee = _a.sent();
                    if (updatedFee.netPayable !== 950000 || updatedFee.remainingBalance !== 950000)
                        throw new Error('Fine amount recalculation failed');
                    // 7. GET /student-fees/ledger (simulated)
                    console.log('7. GET ledger (admin)...');
                    return [4 /*yield*/, (0, finance_service_1.buildLedger)(String(student._id), {}, tenant1._id, tenantDb1)];
                case 12:
                    ledger1 = _a.sent();
                    console.log('Ledger length:', ledger1.length);
                    // 10. Record regular cash payment
                    console.log('10. Record regular cash payment...');
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            studentFeeId: String(fee._id),
                            amount: 500000,
                            paymentMethod: 'cash',
                        }, tenant1._id, tenantDb1)];
                case 13:
                    payment1 = (_a.sent()).payment;
                    console.log('Payment 1 recorded:', payment1.receiptNumber);
                    // 13. Record non-cash payment with reference
                    console.log('13. Record non-cash payment with reference...');
                    refString = "REF-TEST-".concat(Date.now());
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            studentFeeId: String(fee._id),
                            amount: 100000,
                            paymentMethod: 'bank_transfer',
                            reference: refString
                        }, tenant1._id, tenantDb1)];
                case 14:
                    payment2 = (_a.sent()).payment;
                    console.log('Payment 2 recorded:', payment2.receiptNumber);
                    // 14. Try same reference in Exam Fee → rejected
                    console.log('14. Try same reference in Exam Fee → rejected...');
                    return [4 /*yield*/, models1.StudentExamFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            examId: new mongoose_1.default.Types.ObjectId(),
                            amount: 50000,
                            netPayable: 50000,
                            remainingBalance: 50000,
                            status: 'unpaid'
                        })];
                case 15:
                    examFee = _a.sent();
                    examFeeRefRejected = false;
                    return [4 /*yield*/, mongoose_1.default.startSession()];
                case 16:
                    session = _a.sent();
                    _a.label = 17;
                case 17:
                    _a.trys.push([17, 19, 20, 22]);
                    return [4 /*yield*/, session.withTransaction(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, (0, financialReference_service_1.reserveFinancialReference)(tenant1._id, 'bank_transfer', refString, 'exam_fee', new mongoose_1.default.Types.ObjectId(), 'EXM-123', session, tenantDb1)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 18:
                    _a.sent();
                    return [3 /*break*/, 22];
                case 19:
                    err_1 = _a.sent();
                    if (err_1.code === 'DUPLICATE_PAYMENT_REFERENCE')
                        examFeeRefRejected = true;
                    return [3 /*break*/, 22];
                case 20: return [4 /*yield*/, session.endSession()];
                case 21:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 22:
                    if (!examFeeRefRejected)
                        throw new Error('Exam fee duplicate reference was not rejected');
                    console.log('Exam fee duplicate reference rejected successfully');
                    // 15. Reverse a payment
                    console.log('15. Reverse a payment...');
                    return [4 /*yield*/, (0, reversal_service_1.executePaymentReversal)(user1, {
                            paymentId: String(payment1._id),
                            reversalType: 'error_correction',
                            reason: 'Testing reversal',
                            notes: 'none'
                        }, tenant1._id, tenantDb1)];
                case 23:
                    _a.sent();
                    return [4 /*yield*/, models1.PaymentReversal.findOne({ paymentId: payment1._id })];
                case 24:
                    reversal = _a.sent();
                    if (!reversal)
                        throw new Error('Payment reversal not found');
                    console.log('Reversal created:', reversal.reversalReceiptNumber);
                    // 17. Cross-tenant test
                    console.log('17. Cross-tenant test...');
                    crossTenantFailed = false;
                    _a.label = 25;
                case 25:
                    _a.trys.push([25, 27, , 28]);
                    return [4 /*yield*/, models2.Payment.findById(payment1._id)];
                case 26:
                    pt = _a.sent();
                    if (pt)
                        crossTenantFailed = true; // wait, findById works globally on the connection? No, model is tied to DB!
                    return [3 /*break*/, 28];
                case 27:
                    err_2 = _a.sent();
                    return [3 /*break*/, 28];
                case 28:
                    if (crossTenantFailed)
                        throw new Error('Cross-tenant leak detected');
                    console.log('Cross tenant isolation verified');
                    console.log('ALL TESTS PASSED');
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
runTests().catch(function (err) {
    console.error(err);
    process.exit(1);
});
