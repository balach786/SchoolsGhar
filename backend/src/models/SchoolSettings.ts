import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * School settings — a SINGLE small document (fixed _id: 'main').
 * Prompt 6 needs school branding for receipts; Prompt 8 extends this with
 * academic/theme/receipt/result-card tabs. Never store image binaries — only
 * an external logo URL reference.
 */
export interface ISchoolSettings {
  _id: string;
  tenantId: mongoose.Types.ObjectId;
  schoolName: string;
  schoolLogoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  activeSessionId?: mongoose.Types.ObjectId;
  currency: string;
  receiptPrefix: string;
  receiptSettings: {
    showLogo: boolean;
    showAddress: boolean;
    showPhone: boolean;
    signatureLabel: string;
    footerText?: string;
  };
  resultCardSettings: {
    showLogo: boolean;
    showPosition: boolean;
    showGrade: boolean;
    signatureLabel: string;
    footerText?: string;
  };
  themeSettings: {
    accentColor?: string;
    compactSidebar: boolean;
  };
  examSettings?: {
    defaultRequireFeeForAdmitCard: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const schoolSettingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    schoolName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120, default: 'School Management System' },
    schoolLogoUrl: { type: String, trim: true, maxlength: 500 },
    address: { type: String, trim: true, maxlength: 300 },
    phone: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, maxlength: 120 },
    website: { type: String, trim: true, maxlength: 200 },
    principalName: { type: String, trim: true, maxlength: 120 },
    activeSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession' },
    currency: { type: String, trim: true, maxlength: 8, default: 'PKR' },
    receiptPrefix: { type: String, trim: true, maxlength: 12, default: 'RCPT' },
    receiptSettings: {
      showLogo: { type: Boolean, default: true },
      showAddress: { type: Boolean, default: true },
      showPhone: { type: Boolean, default: true },
      signatureLabel: { type: String, trim: true, maxlength: 60, default: 'Authorized Signatory' },
      footerText: { type: String, trim: true, maxlength: 200 },
    },
    resultCardSettings: {
      showLogo: { type: Boolean, default: true },
      showPosition: { type: Boolean, default: true },
      showGrade: { type: Boolean, default: true },
      signatureLabel: { type: String, trim: true, maxlength: 60, default: 'Class Teacher' },
      footerText: { type: String, trim: true, maxlength: 200 },
    },
    themeSettings: {
      accentColor: { type: String, trim: true, maxlength: 20 },
      compactSidebar: { type: Boolean, default: false },
    },
    examSettings: {
      defaultRequireFeeForAdmitCard: { type: Boolean, default: false },
    },
  },
  { timestamps: true, versionKey: false }
);

export const SchoolSettings: Model<ISchoolSettings> =
  mongoose.models.SchoolSettings || mongoose.model<ISchoolSettings>('SchoolSettings', schoolSettingsSchema);

export function publicSchoolSettings(doc: ISchoolSettings | (Record<string, any> & { _id?: unknown })) {
  return {
    schoolName: doc.schoolName,
    schoolLogoUrl: doc.schoolLogoUrl ?? null,
    address: doc.address ?? null,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    website: doc.website ?? null,
    principalName: doc.principalName ?? null,
    activeSessionId: doc.activeSessionId ? String(doc.activeSessionId) : null,
    currency: doc.currency ?? 'PKR',
    receiptPrefix: doc.receiptPrefix ?? 'RCPT',
    receiptSettings: {
      showLogo: doc.receiptSettings?.showLogo ?? true,
      showAddress: doc.receiptSettings?.showAddress ?? true,
      showPhone: doc.receiptSettings?.showPhone ?? true,
      signatureLabel: doc.receiptSettings?.signatureLabel ?? 'Authorized Signatory',
      footerText: doc.receiptSettings?.footerText ?? null,
    },
    resultCardSettings: {
      showLogo: doc.resultCardSettings?.showLogo ?? true,
      showPosition: doc.resultCardSettings?.showPosition ?? true,
      showGrade: doc.resultCardSettings?.showGrade ?? true,
      signatureLabel: doc.resultCardSettings?.signatureLabel ?? 'Class Teacher',
      footerText: doc.resultCardSettings?.footerText ?? null,
    },
    themeSettings: {
      accentColor: doc.themeSettings?.accentColor ?? null,
      compactSidebar: doc.themeSettings?.compactSidebar ?? false,
    },
    examSettings: {
      defaultRequireFeeForAdmitCard: doc.examSettings?.defaultRequireFeeForAdmitCard ?? false,
    },
    updatedAt: doc.updatedAt,
  };
}
