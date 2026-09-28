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
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var masterDb, Tenant, tenants, tenant1, tenantDb1, models1, user1, student, fee1, p1, f, fee2, fee3, _a, pC, fees, fee4, p4, ledgerD, revRow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, mongoose_1.default.connect(process.env.MONGODB_URI)];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, MasterConnectionManager_1.getMasterConnection)()];
                case 2:
                    masterDb = _b.sent();
                    Tenant = (0, MasterModelRegistry_1.getMasterModels)(masterDb).Tenant;
                    return [4 /*yield*/, Tenant.find().limit(2).lean()];
                case 3:
                    tenants = _b.sent();
                    tenant1 = tenants[0];
                    return [4 /*yield*/, (0, TenantConnectionManager_1.getTenantConnection)(tenant1.databaseName)];
                case 4:
                    tenantDb1 = _b.sent();
                    models1 = (0, TenantModelRegistry_1.getTenantModels)(tenantDb1);
                    user1 = { _id: new mongoose_1.default.Types.ObjectId(), tenantId: String(tenant1._id), role: 'admin' };
                    return [4 /*yield*/, models1.Student.findOne().lean()];
                case 5:
                    student = _b.sent();
                    // CASE A + B
                    console.log('CASE A & B');
                    return [4 /*yield*/, models1.StudentFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            sessionId: student.sessionId,
                            feeStructureId: new mongoose_1.default.Types.ObjectId(),
                            feeType: 'monthly_tuition',
                            originalAmount: 100000,
                            netPayable: 100000,
                            remainingBalance: 100000,
                            status: 'unpaid'
                        })];
                case 6:
                    fee1 = _b.sent();
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            studentFeeId: String(fee1._id),
                            amount: 40000,
                            paymentMethod: 'cash',
                        }, tenant1._id, tenantDb1)];
                case 7:
                    p1 = (_b.sent()).payment;
                    return [4 /*yield*/, models1.StudentFee.findById(fee1._id)];
                case 8:
                    f = _b.sent();
                    if (f.remainingBalance !== 60000)
                        throw new Error('CASE A failed');
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            studentFeeId: String(fee1._id),
                            amount: 60000,
                            paymentMethod: 'cash',
                        }, tenant1._id, tenantDb1)];
                case 9:
                    _b.sent();
                    return [4 /*yield*/, models1.StudentFee.findById(fee1._id)];
                case 10:
                    f = _b.sent();
                    if (f.remainingBalance !== 0 || f.status !== 'paid')
                        throw new Error('CASE B failed');
                    // CASE C: Auto allocate
                    console.log('CASE C');
                    return [4 /*yield*/, models1.StudentFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            sessionId: student.sessionId,
                            feeStructureId: new mongoose_1.default.Types.ObjectId(),
                            feeType: 'monthly_tuition',
                            originalAmount: 50000,
                            netPayable: 50000,
                            remainingBalance: 50000,
                            status: 'unpaid'
                        })];
                case 11:
                    fee2 = _b.sent();
                    return [4 /*yield*/, models1.StudentFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            sessionId: student.sessionId,
                            feeStructureId: new mongoose_1.default.Types.ObjectId(),
                            feeType: 'monthly_tuition',
                            originalAmount: 100000,
                            netPayable: 100000,
                            remainingBalance: 100000,
                            status: 'unpaid'
                        })];
                case 12:
                    fee3 = _b.sent();
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            amount: 90000,
                            paymentMethod: 'cash'
                        }, tenant1._id, tenantDb1)];
                case 13:
                    _a = _b.sent(), pC = _a.payment, fees = _a.fees;
                    if (!pC.allocations || pC.allocations.length !== 2)
                        throw new Error('CASE C allocations failed');
                    if (pC.allocations[0].amountAllocated !== 50000)
                        throw new Error('CASE C allocation 0 failed');
                    if (pC.allocations[1].amountAllocated !== 40000)
                        throw new Error('CASE C allocation 1 failed');
                    // CASE D: Partial refund
                    console.log('CASE D');
                    return [4 /*yield*/, models1.StudentFee.create({
                            tenantId: tenant1._id,
                            studentId: student._id,
                            sessionId: student.sessionId,
                            feeStructureId: new mongoose_1.default.Types.ObjectId(),
                            feeType: 'monthly_tuition',
                            originalAmount: 100000,
                            netPayable: 100000,
                            remainingBalance: 100000,
                            status: 'unpaid'
                        })];
                case 14:
                    fee4 = _b.sent();
                    return [4 /*yield*/, (0, finance_service_1.recordPayment)(user1, {
                            studentId: String(student._id),
                            studentFeeId: String(fee4._id),
                            amount: 100000,
                            paymentMethod: 'cash'
                        }, tenant1._id, tenantDb1)];
                case 15:
                    p4 = (_b.sent()).payment;
                    return [4 /*yield*/, models1.PaymentReversal.create({
                            tenantId: tenant1._id,
                            sourceType: 'regular_fee',
                            paymentId: p4._id,
                            studentId: student._id,
                            obligationId: fee4._id,
                            originalReceiptNumber: p4.receiptNumber,
                            reversalReceiptNumber: 'REV-1',
                            amount: 40000,
                            reversalType: 'partial_refund',
                            reason: 'Test partial',
                            initiatedBy: user1._id
                        })];
                case 16:
                    _b.sent();
                    return [4 /*yield*/, (0, finance_service_1.buildLedger)(String(student._id), {}, tenant1._id, tenantDb1)];
                case 17:
                    ledgerD = _b.sent();
                    revRow = ledgerD.find(function (r) { return r.kind === 'reversal' && r.receipt === 'REV-1'; });
                    if (!revRow || revRow.charge !== 40000)
                        throw new Error('CASE D partial refund ledger failed');
                    console.log('ALL TESTS PASSED');
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
runTests().catch(function (err) { console.error(err); process.exit(1); });
