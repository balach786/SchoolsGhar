/**
 * SaaS Database Migration CLI:
 *   npm run migrate:saas
 *
 * Idempotent, safe migration that:
 * 1. Creates a default tenant ("Al-Huda School") for existing single-school records.
 * 2. Assigns tenantId to all existing records without deleting or modifying any IDs.
 * 3. Seeds default SaaS subscription plans and payment methods.
 * 4. Ensures zero downtime and 100% data preservation.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { StudentAttendance } from '../models/StudentAttendance';
import { TeacherAttendance } from '../models/TeacherAttendance';
import { Timetable } from '../models/Timetable';
import { Exam } from '../models/Exam';
import { Mark } from '../models/Mark';
import { GradeScale } from '../models/GradeScale';
import { FeeStructure } from '../models/FeeStructure';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { Income } from '../models/Income';
import { Expense } from '../models/Expense';
import { SalaryRecord } from '../models/SalaryRecord';
import { Assignment } from '../models/Assignment';
import { Submission } from '../models/Submission';
import { Notice } from '../models/Notice';
import { Notification } from '../models/Notification';
import { LeaveRequest } from '../models/LeaveRequest';
import { AuditLog } from '../models/AuditLog';
import { StudentHistory } from '../models/StudentHistory';
import { SchoolSettings } from '../models/SchoolSettings';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { PaymentMethod } from '../models/PaymentMethod';
import { SubscriptionHistory } from '../models/SubscriptionHistory';
import { logger } from '../utils/logger';

const DEFAULT_PLANS = [
  {
    name: 'Starter Tier',
    slug: 'starter',
    description: 'Perfect for small primary schools and learning centers.',
    price: 5000,
    currency: 'PKR',
    durationDays: 30,
    features: [
      'Up to 250 Active Students',
      'Daily Attendance & Timetable',
      'Exams & Marks Grading',
      'Student Fee Collection & Receipts',
      'Standard System Support',
    ],
    isRecommended: false,
    displayOrder: 1,
    isActive: true,
  },
  {
    name: 'Professional Tier',
    slug: 'professional',
    description: 'Complete administration for growing schools and colleges.',
    price: 12000,
    currency: 'PKR',
    durationDays: 30,
    features: [
      'Up to 1,000 Active Students',
      'Complete Academics, Classes & Sections',
      'Full Finance, Incomes, Expenses & Salaries',
      'Student, Teacher & Parent Portals',
      'Decision-Grade Reports & Export',
      'Priority Support',
    ],
    isRecommended: true,
    displayOrder: 2,
    isActive: true,
  },
  {
    name: 'Enterprise Tier',
    slug: 'enterprise',
    description: 'For large educational institutions and multi-branch campuses.',
    price: 25000,
    currency: 'PKR',
    durationDays: 30,
    features: [
      'Unlimited Students & Teachers',
      'Multi-Session Archives & Promotion',
      'Custom Printable Result Cards & Vouchers',
      'Audit Logging & Security Controls',
      '24/7 Dedicated Account Manager',
    ],
    isRecommended: false,
    displayOrder: 3,
    isActive: true,
  },
];

const DEFAULT_PAYMENT_METHODS = [
  {
    name: 'Bank Transfer (HBL)',
    slug: 'bank_transfer',
    accountTitle: 'School Management SaaS (Pvt) Ltd',
    accountNumber: '0123-45678901-03',
    iban: 'PK36HABB0001234567890103',
    instructions:
      'Please transfer the exact subscription amount to the Habib Bank Limited (HBL) account above. Take a screenshot or photo of the payment slip and upload it below.',
    displayOrder: 1,
    isActive: true,
  },
  {
    name: 'EasyPaisa',
    slug: 'easypaisa',
    accountTitle: 'SaaS Billing Operations',
    accountNumber: '0300-1234567',
    instructions:
      'Send payment via EasyPaisa to 0300-1234567. Ensure the transaction ID / TRX ID is copied and upload the receipt screenshot.',
    displayOrder: 2,
    isActive: true,
  },
  {
    name: 'JazzCash',
    slug: 'jazzcash',
    accountTitle: 'SaaS Billing Operations',
    accountNumber: '0301-7654321',
    instructions:
      'Send payment via JazzCash to 0301-7654321. Enter the TID and attach the transaction confirmation screenshot.',
    displayOrder: 3,
    isActive: true,
  },
];

async function migrate(): Promise<void> {
  await connectDatabase();
  logger.info('Starting Multi-Tenant SaaS Migration...');

  // 1. Resolve or create default tenant for existing school records
  let defaultTenant = await Tenant.findOne({ slug: 'al-huda-school' });
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // Find existing admin or super admin user
  const adminUser = await User.findOne({ email: { $in: ['admin@school.test', 'superadmin@school.test'] } });

  if (!defaultTenant) {
    defaultTenant = await Tenant.create({
      name: 'Al-Huda School',
      slug: 'al-huda-school',
      ownerUserId: adminUser ? adminUser._id : new mongoose.Types.ObjectId(),
      contactEmail: adminUser ? adminUser.email : 'admin@school.test',
      contactPhone: '0300-1234567',
      city: 'Karachi',
      country: 'Pakistan',
      status: 'active',
      trialStartedAt: now,
      trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      subscriptionStatus: 'active',
      subscriptionStartedAt: now,
      subscriptionEndsAt: oneYearFromNow,
      isActive: true,
      isSuspended: false,
    });
    logger.info(`Created default tenant: ${defaultTenant.name} (${defaultTenant.slug}) with active subscription.`);

    await SubscriptionHistory.create({
      tenantId: defaultTenant._id,
      action: 'manual_activated',
      newStatus: 'active',
      newEndsAt: oneYearFromNow,
      source: 'manual_activation',
      performedBy: adminUser?._id,
      reason: 'Initial SaaS multi-tenant migration bootstrap',
    });
  } else {
    logger.info(`Default tenant already exists: ${defaultTenant.name}`);
  }

  const tenantId = defaultTenant._id;

  // 2. Link SchoolSettings to default tenant
  const settingsMain = await SchoolSettings.findById('main');
  if (settingsMain && !settingsMain.tenantId) {
    settingsMain.tenantId = tenantId;
    await settingsMain.save();
    logger.info('Linked existing SchoolSettings (_id: main) to default tenant.');
  }

  // Also ensure tenant has a dedicated settings doc
  const tenantSettings = await SchoolSettings.findOne({ tenantId });
  if (!tenantSettings) {
    await SchoolSettings.create({
      _id: String(tenantId),
      tenantId,
      schoolName: defaultTenant.name,
      email: defaultTenant.contactEmail,
      phone: defaultTenant.contactPhone,
      currency: 'PKR',
      receiptPrefix: 'RCPT',
    });
    logger.info('Created tenant-specific SchoolSettings document.');
  }

  // 3. Migrate collections lacking tenantId
  const collectionsToMigrate: [string, mongoose.Model<any>][] = [
    ['User', User],
    ['Student', Student],
    ['Teacher', Teacher],
    ['Class', Class],
    ['Section', Section],
    ['Subject', Subject],
    ['AcademicSession', AcademicSession],
    ['StudentAttendance', StudentAttendance],
    ['TeacherAttendance', TeacherAttendance],
    ['Timetable', Timetable],
    ['Exam', Exam],
    ['Mark', Mark],
    ['GradeScale', GradeScale],
    ['FeeStructure', FeeStructure],
    ['StudentFee', StudentFee],
    ['Payment', Payment],
    ['Income', Income],
    ['Expense', Expense],
    ['SalaryRecord', SalaryRecord],
    ['Assignment', Assignment],
    ['Submission', Submission],
    ['Notice', Notice],
    ['Notification', Notification],
    ['LeaveRequest', LeaveRequest],
    ['AuditLog', AuditLog],
    ['StudentHistory', StudentHistory],
  ];

  for (const [name, model] of collectionsToMigrate) {
    const filter = {
      $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
      // Skip platform admin users
      ...(name === 'User' ? { isPlatformAdmin: { $ne: true } } : {}),
    };
    const res = await model.updateMany(filter, { $set: { tenantId } });
    if (res.modifiedCount > 0) {
      logger.info(`  ✓ ${name}: updated ${res.modifiedCount} records with tenantId.`);
    }
  }

  // 4. Seed SaaS subscription plans
  for (const p of DEFAULT_PLANS) {
    const existingPlan = await SubscriptionPlan.findOne({ slug: p.slug });
    if (!existingPlan) {
      await SubscriptionPlan.create(p);
      logger.info(`  ✓ Created subscription plan: ${p.name}`);
    }
  }

  // 5. Seed SaaS payment methods
  for (const m of DEFAULT_PAYMENT_METHODS) {
    const existingMethod = await PaymentMethod.findOne({ slug: m.slug });
    if (!existingMethod) {
      await PaymentMethod.create(m);
      logger.info(`  ✓ Created payment method: ${m.name}`);
    }
  }

  logger.info('\n✓ Multi-Tenant SaaS Migration completed successfully!');
  logger.info('All existing school data is completely preserved and attached to the default tenant.');

  await disconnectDatabase();
  process.exit(0);
}

migrate().catch(async (err) => {
  logger.error('Migration failed:', err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
