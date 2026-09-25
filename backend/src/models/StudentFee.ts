import mongoose, { Schema, Document, Model } from 'mongoose';
import { FeeType } from './FeeStructure';

export type FeeStatus = 'unpaid' | 'partial' | 'paid';

export interface IChargeBreakdown {
  baseFeePaisa: number;
  discount: {
    discountId: mongoose.Types.ObjectId | null;
    name: string | null;
    type: 'fixed' | 'percentage' | null;
    valueBps: number | null;
    amountPaisa: number;
  };
  lateFee: {
    applied: boolean;
    amountPaisa: number;
    assessedAt: Date | null;
  };
  otherFee: {
    applied: boolean;
    name: string | null;
    amountPaisa: number;
  };
  netPayablePaisa: number;
}

export interface IStudentFee extends Document {
  tenantId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId: mongoose.Types.ObjectId;
  feeStructureId: mongoose.Types.ObjectId;
  /** Immutable historical fee title snapshot copied from FeeStructure at generation. */
  title?: string;
  feeType: FeeType;
  month: number | null; // 1-12
  billingMonth?: number | null;
  billingYear?: number | null;
  reAdmissionEventId?: mongoose.Types.ObjectId | null;
  /** Integer paisa (all money fields). */
  originalAmount: number;
  discountAmount: number;
  scholarshipAmount: number;
  fineAmount: number;
  otherFeeAmount: number;
  fineAssessedAt?: Date | null;
  chargeBreakdown?: IChargeBreakdown;
  netPayable: number;
  amountPaid: number;
  remainingBalance: number;
  /** Derived by the backend from payment state — never client-submitted. */
  status: FeeStatus;
  dueDate?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const chargeBreakdownSchema = new Schema(
  {
    baseFeePaisa: { type: Number, required: true, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    discount: {
      discountId: { type: Schema.Types.ObjectId, ref: 'FeeDiscount', default: null },
      name: { type: String, default: null },
      type: { type: String, enum: ['fixed', 'percentage', null], default: null },
      valueBps: { type: Number, default: null },
      amountPaisa: { type: Number, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    },
    lateFee: {
      applied: { type: Boolean, default: false },
      amountPaisa: { type: Number, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
      assessedAt: { type: Date, default: null },
    },
    otherFee: {
      applied: { type: Boolean, default: false },
      name: { type: String, default: null },
      amountPaisa: { type: Number, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    },
    netPayablePaisa: { type: Number, required: true, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
  },
  { _id: false }
);

export const studentFeeSchema = new Schema<IStudentFee>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: false },
    feeStructureId: { type: Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
    title: { type: String, trim: true, maxlength: 120 },
    feeType: { type: String, enum: ['monthly_tuition', 'admission_fee', 'other'], required: true },
    month: { type: Number, min: 1, max: 12, default: null },
    billingMonth: { type: Number, min: 1, max: 12, default: null },
    billingYear: { type: Number, default: null },
    reAdmissionEventId: { type: Schema.Types.ObjectId, ref: 'StudentHistory', default: null },
    originalAmount: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    discountAmount: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    scholarshipAmount: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    fineAmount: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    otherFeeAmount: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    fineAssessedAt: { type: Date, default: null },
    chargeBreakdown: { type: chargeBreakdownSchema, default: null },
    netPayable: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    amountPaid: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    remainingBalance: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    dueDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Duplicate generation prevention:
// 1. Non-monthly fees: one student fee per fee structure per tenant
studentFeeSchema.index(
  { tenantId: 1, studentId: 1, feeStructureId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      feeType: 'admission_fee',
    },
  }
);
// 2. Strong monthly tuition invoice uniqueness: tenant + student + session + billingMonth + billingYear
studentFeeSchema.index(
  { tenantId: 1, studentId: 1, sessionId: 1, feeType: 1, billingMonth: 1, billingYear: 1 },
  {
    unique: true,
    partialFilterExpression: {
      feeType: 'monthly_tuition',
      billingMonth: { $type: 'number' },
      billingYear: { $type: 'number' },
    },
  }
);
studentFeeSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });
studentFeeSchema.index({ tenantId: 1, classId: 1, sectionId: 1, status: 1 });
studentFeeSchema.index({ tenantId: 1, status: 1, sessionId: 1 });
studentFeeSchema.index({ tenantId: 1, dueDate: 1, status: 1 });

export const StudentFee: Model<IStudentFee> =
  mongoose.models.StudentFee || mongoose.model<IStudentFee>('StudentFee', studentFeeSchema);

export function publicStudentFee(doc: IStudentFee | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    studentId: String(doc.studentId),
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    sectionId: String(doc.sectionId),
    feeStructureId: String(doc.feeStructureId),
    title: doc.title ?? null,
    feeType: doc.feeType,
    month: doc.month ?? null,
    billingMonth: doc.billingMonth ?? doc.month ?? null,
    billingYear: doc.billingYear ?? null,
    reAdmissionEventId: doc.reAdmissionEventId ? String(doc.reAdmissionEventId) : null,
    originalAmount: doc.originalAmount,
    discountAmount: doc.discountAmount ?? 0,
    scholarshipAmount: doc.scholarshipAmount ?? 0,
    fineAmount: doc.fineAmount ?? 0,
    otherFeeAmount: doc.otherFeeAmount ?? 0,
    fineAssessedAt: doc.fineAssessedAt ? new Date(doc.fineAssessedAt).toISOString() : null,
    chargeBreakdown: doc.chargeBreakdown ?? null,
    netPayable: doc.netPayable,
    amountPaid: doc.amountPaid ?? 0,
    remainingBalance: doc.remainingBalance,
    status: doc.status,
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
