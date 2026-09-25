import mongoose, { Schema, Document, Model } from 'mongoose';
import { FileRef } from './Student';

export type StaffType = 'teaching' | 'non_teaching';

export interface IStaff extends Document {
  tenantId: mongoose.Types.ObjectId;
  employeeId: string;
  staffType: StaffType;
  designation: string;
  department?: string;
  fullName: string;
  fatherName: string;
  caste: string;
  profilePhotoUrl?: string;
  gender?: 'male' | 'female' | 'other';
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: Date;
  joiningDate: Date;
  qualification?: string;
  salary: number; // integer paisa (finance sensitive)
  documents: FileRef[];
  userId?: mongoose.Types.ObjectId;
  specialization?: string;
  isActive: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const fileRefSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    fileUrl: { type: String, required: true, maxlength: 500 },
    mimeType: { type: String, maxlength: 80 },
    fileSize: { type: Number },
    storageKey: { type: String, maxlength: 200 },
  },
  { _id: false, versionKey: false }
);

export const staffSchema = new Schema<IStaff>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    employeeId: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    staffType: {
      type: String,
      enum: ['teaching', 'non_teaching'],
      required: true,
      index: true,
    },
    designation: { type: String, required: true, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 80 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    fatherName: { type: String, required: true, trim: true, maxlength: 80 },
    caste: { type: String, required: true, trim: true, maxlength: 80 },
    profilePhotoUrl: { type: String, maxlength: 500 },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24 },
    address: { type: String, trim: true, maxlength: 300 },
    dateOfBirth: { type: Date },
    joiningDate: { type: Date, required: true },
    qualification: { type: String, trim: true, maxlength: 120 },
    salary: { type: Number, default: 0, min: 0 },
    documents: { type: [fileRefSchema], default: [] },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    specialization: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    discriminatorKey: 'staffType',
    collection: 'staff',
  }
);

// Indexes on staff collection
staffSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
staffSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
staffSchema.index({ tenantId: 1, staffType: 1, isArchived: 1, isActive: 1 });

export const Staff: Model<IStaff> =
  mongoose.models.Staff || mongoose.model<IStaff>('Staff', staffSchema, 'staff');

// Register 'non_teaching' discriminator on Staff
if (!Staff.discriminators || !Staff.discriminators['non_teaching']) {
  Staff.discriminator('non_teaching', new Schema({}, { _id: false, versionKey: false }), 'non_teaching');
}

export function publicStaff(
  s: IStaff | (Record<string, any> & { _id?: unknown }),
  opts?: { hideSalary?: boolean }
) {
  const isDoc = typeof (s as any).toObject === 'function';
  const raw = isDoc ? (s as IStaff).toObject() : s;

  return {
    _id: String(raw._id),
    tenantId: raw.tenantId ? String(raw.tenantId) : null,
    employeeId: raw.employeeId,
    staffType: raw.staffType,
    designation: raw.designation,
    department: raw.department ?? null,
    fullName: raw.fullName,
    fatherName: raw.fatherName,
    caste: raw.caste,
    profilePhotoUrl: raw.profilePhotoUrl ?? null,
    gender: raw.gender ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    address: raw.address ?? null,
    dateOfBirth: raw.dateOfBirth ?? null,
    joiningDate: raw.joiningDate,
    qualification: raw.qualification ?? null,
    specialization: raw.specialization ?? null,
    salary: opts?.hideSalary ? undefined : raw.salary,
    documents: raw.documents ?? [],
    userId: raw.userId ? String(raw.userId) : null,
    isActive: raw.isActive,
    isArchived: raw.isArchived,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    // Derived canonical relationships (Correction 2: zero drift from Class/Subject)

  };
}
