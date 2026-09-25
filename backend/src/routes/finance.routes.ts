import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  createFeeStructureSchema,
  updateFeeStructureSchema,
  feeStructureQuerySchema,
  generateFeesSchema,
  adjustFeeSchema,
  studentFeeQuerySchema,
  ledgerQuerySchema,
  createPaymentSchema,
  updatePaymentSchema,
  paymentQuerySchema,
  createIncomeSchema,
  updateIncomeSchema,
  createExpenseSchema,
  updateExpenseSchema,
  transactionQuerySchema,
  createSalarySchema,
  markSalaryPaidSchema,
  salaryQuerySchema,
  calculateSalaryQuerySchema,
  autoGenerateSalariesSchema,
  financeReportQuerySchema,
  updateFeeSettingSchema,
  createFeeDiscountSchema,
  updateFeeDiscountSchema,
  studentFeeCalculationQuerySchema,
  cancelReceiptSchema,
} from '../validators/finance.validators';
import { updateSettingsSchema } from '../validators/settings.validators';
import * as feeStructureController from '../controllers/feeStructure.controller';
import * as studentFeeController from '../controllers/studentFee.controller';
import * as paymentController from '../controllers/payment.controller';
import * as feeSettingController from '../controllers/feeSetting.controller';
import * as feeDiscountController from '../controllers/feeDiscount.controller';
import * as incomeController from '../controllers/income.controller';
import * as expenseController from '../controllers/expense.controller';
import * as salaryController from '../controllers/salary.controller';
import * as financeController from '../controllers/finance.controller';
import * as schoolSettingsController from '../controllers/schoolSettings.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// ── Fee settings (Admission, Other Fee, Late Fee, Due Date, Discounts) ──
router.get('/fee-settings', requirePermission('fees', 'view'), feeSettingController.getFeeSettings);
router.patch('/fee-settings', requirePermission('fees', 'edit'), validate({ body: updateFeeSettingSchema }), feeSettingController.updateFeeSettings);

// ── Fee discounts ─────────────────────────────────────────
router.get('/fee-discounts', requirePermission('fees', 'view'), feeDiscountController.listFeeDiscounts);
router.post('/fee-discounts', requirePermission('fees', 'create'), validate({ body: createFeeDiscountSchema }), feeDiscountController.createFeeDiscount);
router.patch('/fee-discounts/:id', requirePermission('fees', 'edit'), validate({ body: updateFeeDiscountSchema }), feeDiscountController.updateFeeDiscount);
router.delete('/fee-discounts/:id', requirePermission('fees', 'edit'), feeDiscountController.deleteFeeDiscount);

// ── Fee structures ──────────────────────────────────────
router.get('/fee-structures', requirePermission('fees', 'view'), validate({ query: feeStructureQuerySchema }), feeStructureController.listFeeStructures);
router.post('/fee-structures', requirePermission('fees', 'create'), validate({ body: createFeeStructureSchema }), feeStructureController.createFeeStructure);
router.get('/fee-structures/:id', requirePermission('fees', 'view'), feeStructureController.getFeeStructure);
router.patch('/fee-structures/:id', requirePermission('fees', 'edit'), validate({ body: updateFeeStructureSchema }), feeStructureController.updateFeeStructure);
router.post('/fee-structures/:id/archive', requirePermission('fees', 'edit'), feeStructureController.archiveFeeStructure);
router.post('/fee-structures/:id/restore', requirePermission('fees', 'edit'), feeStructureController.archiveFeeStructure);

// ── Student fees ────────────────────────────────────────
router.get('/student-fees/calculate', requirePermission('fees', 'view'), validate({ query: studentFeeCalculationQuerySchema }), studentFeeController.calculateStudentFee);
router.get('/student-fees/class-summary', requirePermission('fees', 'view'), studentFeeController.listClassSectionSummary);
router.get('/student-fees/ledger', requirePermission('fees', 'view'), validate({ query: ledgerQuerySchema }), studentFeeController.feeLedger);
router.get('/student-fees', requirePermission('fees', 'view'), validate({ query: studentFeeQuerySchema }), studentFeeController.listStudentFees);
router.post('/student-fees/generate', requirePermission('fees', 'create'), validate({ body: generateFeesSchema }), studentFeeController.generateFees);
router.get('/student-fees/:id', requirePermission('fees', 'view'), studentFeeController.getStudentFee);
router.patch('/student-fees/:id/adjust', requirePermission('fees', 'edit'), validate({ body: adjustFeeSchema }), studentFeeController.adjustFee);

// ── Payments & receipts ─────────────────────────────────
router.get('/payments', requirePermission('payments', 'view'), validate({ query: paymentQuerySchema }), paymentController.listPayments);
router.post('/payments', requirePermission('payments', 'create'), validate({ body: createPaymentSchema }), paymentController.createPayment);
router.get('/payments/:id/receipt', requirePermission('payments', 'view'), paymentController.paymentReceipt);
router.get('/payments/:id', requirePermission('payments', 'view'), paymentController.getPayment);
router.patch('/payments/:id', requirePermission('payments', 'edit'), validate({ body: updatePaymentSchema }), paymentController.updatePaymentNotes);
router.post('/payments/:id/reversal', requirePermission('payments', 'edit'), validate({ body: cancelReceiptSchema }), paymentController.createPaymentReversalController);
router.post('/payments/:id/cancel-receipt', requirePermission('payments', 'edit'), validate({ body: cancelReceiptSchema }), paymentController.createPaymentReversalController);

// ── Income (non-fee) ────────────────────────────────────
router.get('/incomes', requirePermission('incomes', 'view'), validate({ query: transactionQuerySchema }), incomeController.listIncomes);
router.post('/incomes', requirePermission('incomes', 'create'), validate({ body: createIncomeSchema }), incomeController.createIncome);
router.patch('/incomes/:id', requirePermission('incomes', 'edit'), validate({ body: updateIncomeSchema }), incomeController.updateIncome);
router.post('/incomes/:id/archive', requirePermission('incomes', 'edit'), incomeController.archiveIncome);
router.post('/incomes/:id/restore', requirePermission('incomes', 'edit'), incomeController.archiveIncome);

// ── Expenses ────────────────────────────────────────────
router.get('/expenses/categories', requirePermission('expenses', 'view'), expenseController.expenseCategories);
router.get('/expenses', requirePermission('expenses', 'view'), validate({ query: transactionQuerySchema }), expenseController.listExpenses);
router.post('/expenses', requirePermission('expenses', 'create'), validate({ body: createExpenseSchema }), expenseController.createExpense);
router.patch('/expenses/:id', requirePermission('expenses', 'edit'), validate({ body: updateExpenseSchema }), expenseController.updateExpense);
router.post('/expenses/:id/archive', requirePermission('expenses', 'edit'), expenseController.archiveExpense);
router.post('/expenses/:id/restore', requirePermission('expenses', 'edit'), expenseController.archiveExpense);

// ── Salaries ────────────────────────────────────────────
router.get('/salaries', requirePermission('salaries', 'view'), validate({ query: salaryQuerySchema }), salaryController.listSalaries);
router.post('/salaries', requirePermission('salaries', 'create'), validate({ body: createSalarySchema }), salaryController.createSalary);
router.get('/salaries/calculate', requirePermission('salaries', 'view'), validate({ query: calculateSalaryQuerySchema }), salaryController.calculateSalaryFromAttendance);
router.post('/salaries/auto-generate', requirePermission('salaries', 'create'), validate({ body: autoGenerateSalariesSchema }), salaryController.autoGenerateSalariesFromAttendance);
router.get('/salaries/:id', requirePermission('salaries', 'view'), salaryController.getSalary);
router.patch('/salaries/:id', requirePermission('salaries', 'edit'), validate({ body: createSalarySchema.partial() }), salaryController.updateSalary);
router.post('/salaries/:id/mark-paid', requirePermission('salaries', 'edit'), validate({ body: markSalaryPaidSchema }), salaryController.markSalaryPaid);

// ── Finance dashboard & reports (reports.view) ──────────
router.get('/finance/dashboard', requirePermission('reports', 'view'), financeController.dashboard);
router.get('/finance/reports/daily-collection', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.dailyCollection);
router.get('/finance/reports/monthly-collection', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.monthlyCollection);
router.get('/finance/reports/pending-fees', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.pendingFees);
router.get('/finance/reports/income', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.incomeReport);
router.get('/finance/reports/expenses', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.expenseReport);
router.get('/finance/reports/salaries', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.salaryReport);
// router.get('/finance/reports/income-vs-expense', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.incomeVsExpense);
router.get('/finance/reports/student-ledger', requirePermission('reports', 'view'), validate({ query: ledgerQuerySchema }), financeController.ledgerReport);
router.get('/finance/reports/fees-summary', requirePermission('reports', 'view'), validate({ query: financeReportQuerySchema }), financeController.feesSummaryReport);

// ── School settings (branding core; full tabs in Prompt 8) ──
router.get('/school-settings', schoolSettingsController.getSettings);
router.patch('/school-settings', requirePermission('schoolSettings', 'edit'), validate({ body: updateSettingsSchema }), schoolSettingsController.updateSettings);

export default router;
