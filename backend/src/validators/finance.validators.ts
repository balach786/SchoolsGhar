import { z } from 'zod';
import { objectIdString, isoDateString } from './attendance.validators';

// ---------------------------------------------------------------------------
// Money (integer paisa — PKR 1,500.00 → 150000)
// ---------------------------------------------------------------------------

export const paisaAmount = z
  .number()
  .int('Amount must be an integer in the smallest monetary unit (paisa)')
  .min(1, 'Amount must be positive')
  .max(1_000_000_000, 'Amount too large');

export const paisaAmountOrZero = paisaAmount.min(0);

// ---------------------------------------------------------------------------
// Fee structures
// ---------------------------------------------------------------------------

export const feeTypeEnum = z.enum(['monthly_tuition', 'admission_fee', 'other'], {
  errorMap: () => ({ message: 'feeType must be monthly_tuition, admission_fee or other' }),
});

export const monthField = z.number().int().min(1).max(12).nullable().optional();

export const createFeeStructureSchema = z
  .object({
    sessionId: objectIdString,
    classId: objectIdString,
    feeType: feeTypeEnum,
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
    amount: paisaAmount,
    month: monthField,
    dueDate: isoDateString.optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.feeType !== 'monthly_tuition' && s.month !== null && s.month !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'month is only applicable to monthly tuition fees', path: ['month'] });
    }
  });

export const updateFeeStructureSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    amount: paisaAmount.optional(),
    month: monthField,
    dueDate: isoDateString.nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updatePaymentSchema = z
  .object({
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const feeStructureQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(), // server caps at 100
    search: z.string().trim().max(80).optional(),
    sessionId: objectIdString.optional(),
    classId: objectIdString.optional(),
    feeType: feeTypeEnum.optional(),
    status: z.enum(['active', 'inactive', 'archived']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Student fees
// ---------------------------------------------------------------------------

export const generateFeesSchema = z
  .object({
    sessionId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.optional(),
    feeStructureId: objectIdString,
    /** Omit to generate for all eligible students. */
    studentIds: z.array(objectIdString).max(500).optional(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2020).max(2100).optional(),
  })
  .strict();

export const adjustFeeSchema = z
  .object({
    discountAmount: paisaAmountOrZero.optional(),
    scholarshipAmount: paisaAmountOrZero.optional(),
    fineAmount: paisaAmountOrZero.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (s) => s.discountAmount !== undefined || s.scholarshipAmount !== undefined || s.fineAmount !== undefined,
    { message: 'At least one adjustment field is required' }
  );

export const studentFeeQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    search: z.string().trim().max(80).optional(),
    sessionId: objectIdString.optional(),
    classId: objectIdString.optional(),
    sectionId: objectIdString.optional(),
    studentId: objectIdString.optional(),
    feeStructureId: objectIdString.optional(),
    feeType: feeTypeEnum.optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(['unpaid', 'partial', 'paid']).optional(),
  })
  .strict();

export const ledgerQuerySchema = z
  .object({
    /** Optional only for students (own ledger); staff must provide it. */
    studentId: objectIdString.optional(),
    sessionId: objectIdString.optional(),
    feeType: feeTypeEnum.optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    format: z.enum(['csv']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentMethodEnum = z.enum(['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'online', 'other'], {
  errorMap: () => ({ message: 'paymentMethod must be cash, bank_transfer, easypaisa, jazzcash, card, online or other' }),
});

export const createPaymentSchema = z
  .object({
    studentFeeId: objectIdString,
    studentId: objectIdString.optional(), // verified against the fee when provided
    amount: paisaAmount,
    paymentMethod: paymentMethodEnum,
    paymentDate: isoDateString.optional(), // defaults to today (server date)
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.paymentMethod !== 'cash' && (!data.reference || !data.reference.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transaction / reference ID is required for non-cash payment methods',
        path: ['reference'],
      });
    }
  });

export const paymentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    search: z.string().trim().max(80).optional(), // student name / admission / receipt
    sessionId: objectIdString.optional(),
    classId: objectIdString.optional(),
    sectionId: objectIdString.optional(),
    studentId: objectIdString.optional(),
    method: paymentMethodEnum.optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Income & expenses
// ---------------------------------------------------------------------------

export const createIncomeSchema = z
  .object({
    sessionId: objectIdString.optional().nullable(),
    category: z.string().trim().min(2, 'Category is required').max(40),
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
    amount: paisaAmount,
    date: isoDateString,
    description: z.string().trim().max(500).optional(),
    reference: z.string().trim().max(120).optional(),
  })
  .strict();

export const updateIncomeSchema = createIncomeSchema.partial();

export const createExpenseSchema = createIncomeSchema;

export const updateExpenseSchema = createIncomeSchema.partial();

export const transactionQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    search: z.string().trim().max(80).optional(),
    category: z.string().trim().max(40).optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    /** format=csv streams a UTF-8 CSV export (never persisted server-side). */
    format: z.enum(['csv']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Salaries
// ---------------------------------------------------------------------------

export const createSalarySchema = z
  .object({
    staffId: objectIdString,
    sessionId: objectIdString,
    salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'salaryMonth must be YYYY-MM'),
    /** Optional — defaults to the staff profile salary (backend). */
    baseAmount: paisaAmountOrZero.optional(),
    adjustmentAmount: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional().default(0),
    bonusAmount: z.number().int().min(0).max(1_000_000_000).optional().default(0),
    bonusReason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const markSalaryPaidSchema = z
  .object({
    paymentDate: isoDateString.optional(),
    paymentMethod: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const salaryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    search: z.string().trim().max(80).optional(), // teacher name / employee id
    sessionId: objectIdString.optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM').optional(),
    status: z.enum(['unpaid', 'paid']).optional(),
    format: z.enum(['csv']).optional(),
  })
  .strict();

export const calculateSalaryQuerySchema = z
  .object({
    staffId: objectIdString,
    salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'salaryMonth must be YYYY-MM'),
    workingDays: z.coerce.number().int().min(1).max(31).optional(),
  })
  .strict();

export const autoGenerateSalariesSchema = z
  .object({
    sessionId: objectIdString,
    salaryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'salaryMonth must be YYYY-MM'),
    workingDays: z.number().int().min(1).max(31).optional(),
    overwriteExisting: z.boolean().optional().default(false),
  })
  .strict();

// ---------------------------------------------------------------------------
// Finance dashboard & reports
// ---------------------------------------------------------------------------

export const financeReportQuerySchema = z
  .object({
    sessionId: objectIdString.optional(),
    classId: objectIdString.optional(),
    sectionId: objectIdString.optional(),
    status: z.enum(['unpaid', 'partial', 'paid']).optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM').optional(),
    date: isoDateString.optional(),
    category: z.string().trim().max(40).optional(),
    format: z.enum(['csv']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Fee Settings & Fee Discounts (Production Enhanced)
// ---------------------------------------------------------------------------

export const updateFeeSettingSchema = z
  .object({
    admissionFee: z
      .object({
        enabled: z.boolean().optional(),
        allowReAdmission: z.boolean().optional(),
      })
      .optional(),
    otherFee: z
      .object({
        enabled: z.boolean().optional(),
        feeName: z.string().trim().min(2).max(120).optional(),
        defaultAmount: paisaAmountOrZero.optional(),
      })
      .optional(),
    lateFee: z
      .object({
        enabled: z.boolean().optional(),
        lateFeeAmount: paisaAmountOrZero.optional(),
        gracePeriodDays: z.number().int().min(0).max(31).optional(),
      })
      .optional(),
    dueDate: z
      .object({
        enabled: z.boolean().optional(),
        defaultMonthlyDueDay: z.number().int().min(1).max(28).optional(),
      })
      .optional(),
    discount: z
      .object({
        enabled: z.boolean().optional(),
        allowDiscountStacking: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

const baseFeeDiscountObject = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  discountType: z.enum(['fixed', 'percentage']),
  /** For fixed: paisa. For percentage: basis points (100 = 1%, 10000 = 100%). */
  value: z.number().int().min(1, 'Value must be positive'),
  applyTo: z.enum(['student', 'class', 'all']),
  classId: objectIdString.optional(),
  studentId: objectIdString.optional(),
  isActive: z.boolean().optional().default(true),
});

export const createFeeDiscountSchema = baseFeeDiscountObject
  .strict()
  .superRefine((d, ctx) => {
    if (d.discountType === 'percentage' && (d.value < 1 || d.value > 10000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percentage discount must be between 1 and 10000 basis points (0.01% - 100%)',
        path: ['value'],
      });
    }
    if (d.applyTo === 'class' && !d.classId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'classId is required when applyTo is "class"',
        path: ['classId'],
      });
    }
    if (d.applyTo === 'student' && !d.studentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'studentId is required when applyTo is "student"',
        path: ['studentId'],
      });
    }
  });

export const updateFeeDiscountSchema = baseFeeDiscountObject.partial().strict();

export const studentFeeCalculationQuerySchema = z
  .object({
    studentId: objectIdString,
    sessionId: objectIdString.optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    reAdmissionEventId: objectIdString.optional(),
  })
  .strict();

export const cancelReceiptSchema = z
  .object({
    reason: z.string().trim().min(3, 'Cancellation reason is required').max(300),
    reversalType: z.enum(['full_reversal', 'partial_refund', 'void']).optional().default('full_reversal'),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().max(120).optional(),
  })
  .strict();

