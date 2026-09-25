import mongoose, { Schema, Document, Model } from 'mongoose';

/** External file reference — never file bytes in MongoDB. */
export interface FileRef {
  name: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  storageKey?: string;
}

export interface IStudent extends Document {
  tenantId: mongoose.Types.ObjectId;
  admissionNumber: string;
  rollNumber: string;
  fullName: string;
  profilePhotoUrl?: string;
  gender: 'male' | 'female';
  dateOfBirth: Date;
  email?: string;
  phone?: string;
  fatherName?: string;
  caste?: string;
  guardianName: string;
  guardianPhone?: string;
  guardianRelationship?: string;
  address?: string;
  admissionDate: Date;
  previousSchool?: string;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  /** Linked user account (student portal login), if any. */
  userId?: mongoose.Types.ObjectId;
  documents: FileRef[];
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

export const studentSchema = new Schema<IStudent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    admissionNumber: { type: String, required: true, trim: true, maxlength: 24 },
    rollNumber: { type: String, trim: true, maxlength: 12 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    profilePhotoUrl: { type: String, maxlength: 500 },
    gender: { type: String, enum: ['male', 'female'], required: true },
    dateOfBirth: { type: Date, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24 },
    fatherName: { type: String, trim: true, maxlength: 80 },
    caste: { type: String, trim: true, maxlength: 60 },
    guardianName: { type: String, required: true, trim: true, maxlength: 80 },
    guardianPhone: { type: String, trim: true, maxlength: 24 },
    guardianRelationship: { type: String, trim: true, maxlength: 30 },
    address: { type: String, trim: true, maxlength: 300 },
    admissionDate: { type: Date, required: true },
    previousSchool: { type: String, trim: true, maxlength: 100 },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    documents: { type: [fileRefSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// Query index: lists filtered by session/class/section
studentSchema.index({ tenantId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, sessionId: 1, classId: 1, sectionId: 1 });
studentSchema.index({ tenantId: 1, isArchived: 1, isActive: 1 });
studentSchema.index({ tenantId: 1, phone: 1 });
studentSchema.index({ tenantId: 1, guardianPhone: 1 });
studentSchema.index({ tenantId: 1, guardianName: 1 });
studentSchema.index({ tenantId: 1, fatherName: 1 });
studentSchema.index({ tenantId: 1, isArchived: 1, admissionDate: -1 });
studentSchema.index({ tenantId: 1, fullName: 1 });

// Rule A+D Concurrency-safe Roll Number Uniqueness
studentSchema.index(
  { tenantId: 1, sessionId: 1, classId: 1, sectionId: 1, rollNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isArchived: false,
      sectionId: { $type: 'objectId' },
      rollNumber: { $type: 'string', $gt: '' },
    },
  }
);
studentSchema.index(
  { tenantId: 1, sessionId: 1, classId: 1, rollNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isArchived: false,
      sectionId: null,
      rollNumber: { $type: 'string', $gt: '' },
    },
  }
);

export const Student: Model<IStudent> = mongoose.models.Student || mongoose.model<IStudent>('Student', studentSchema);

export function publicStudent(s: IStudent) {
  return {
    _id: String(s._id),
    tenantId: s.tenantId ? String(s.tenantId) : null,
    admissionNumber: s.admissionNumber,
    rollNumber: s.rollNumber,
    fullName: s.fullName,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    email: s.email ?? null,
    phone: s.phone ?? null,
    fatherName: s.fatherName ?? null,
    caste: s.caste ?? null,
    guardianName: s.guardianName,
    guardianPhone: s.guardianPhone ?? null,
    guardianRelationship: s.guardianRelationship ?? null,
    address: s.address ?? null,
    admissionDate: s.admissionDate,
    previousSchool: s.previousSchool ?? null,
    sessionId: String(s.sessionId),
    classId: String(s.classId),
    sectionId: s.sectionId ? String(s.sectionId) : null,
    documents: s.documents ?? [],
    isActive: s.isActive,
    isArchived: s.isArchived,
    createdAt: s.createdAt,
  };
}
