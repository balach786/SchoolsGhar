import mongoose from 'mongoose';
import { ITenant } from '../models/Tenant';
import { getTenantConnection } from './TenantConnectionManager';
import { getTenantModels } from './TenantModelRegistry';
import { ROLE_SLUGS } from '../config/permissions';
import { hashPassword } from '../utils/security';
import { IUser } from '../models/User';

export class TenantProvisioningService {
  /**
   * Provisions the dedicated MongoDB database for a new tenant.
   * Returns the provisioned Owner User.
   */
  static async provisionTenant(
    tenant: ITenant,
    ownerName: string,
    email: string,
    passwordHash: string
  ): Promise<IUser> {
    if (tenant.isDatabaseProvisioned) {
      throw new Error('Tenant is already provisioned');
    }

    if (!tenant.databaseName) {
      throw new Error('Tenant missing databaseName');
    }

    const tenantDb = getTenantConnection(tenant.databaseName);
    const models = getTenantModels(tenantDb);

    try {
      // 1. Ensure indexes are built inside the new database
      await models.User.createIndexes();
      await models.Role.createIndexes();
      await models.SchoolSettings.createIndexes();
      await models.AcademicSession.createIndexes();
      await models.AuthSession.createIndexes();

      // 2. Provision System Roles
      const systemRolesToSeed = [
        { slug: ROLE_SLUGS.superAdmin, name: 'Super Admin', description: 'Platform level administration' },
        { slug: ROLE_SLUGS.admin, name: 'School Admin / Principal', description: 'Full school administration' },
        { slug: ROLE_SLUGS.teacher, name: 'Teacher', description: 'Teaching staff' },
        { slug: ROLE_SLUGS.student, name: 'Student', description: 'Enrolled student' },
        { slug: ROLE_SLUGS.accountant, name: 'Accountant', description: 'Financial management' },
        { slug: ROLE_SLUGS.receptionist, name: 'Receptionist', description: 'Front desk operations' },
      ];

      let ownerRole = null;
      
      for (const roleDef of systemRolesToSeed) {
        const { DEFAULT_ROLE_PERMISSIONS, normalizePermissions } = await import('../config/permissions');
        let role = await models.Role.findOne({ slug: roleDef.slug });
        if (!role) {
          const defaultPerms = DEFAULT_ROLE_PERMISSIONS[roleDef.slug] || {};
          const normalizedPerms = normalizePermissions(defaultPerms);
          
          role = await models.Role.create({
            name: roleDef.name,
            slug: roleDef.slug,
            description: roleDef.description,
            isSystemRole: true,
            isActive: true,
            tenantId: tenant._id,
            permissions: normalizedPerms,
          });
        }
        if (role.slug === ROLE_SLUGS.admin) {
          ownerRole = role;
        }
      }

      if (!ownerRole) {
        throw new Error('Failed to provision owner role');
      }
      
      console.log(`Provisioned Role ID: ${ownerRole._id}`);

      // 3. Provision Owner User
      let ownerUser = await models.User.findOne({ email: email.toLowerCase() });
      if (!ownerUser) {
        ownerUser = await models.User.create({
          _id: tenant.ownerUserId, // Must match Master DB reference
          name: ownerName,
          email: email.toLowerCase(),
          passwordHash,
          roleId: ownerRole._id,
          tenantId: tenant._id,
          isActive: true,
          isArchived: false,
        });
      } else {
        // If it exists, update it to ensure it matches
        ownerUser.name = ownerName;
        ownerUser.passwordHash = passwordHash;
        ownerUser.roleId = ownerRole._id;
        ownerUser.tenantId = tenant._id;
        await ownerUser.save();
      }

      // 4. Provision SchoolSettings
      await models.SchoolSettings.findOneAndUpdate(
        { _id: String(tenant._id) },
        {
          $setOnInsert: {
            _id: String(tenant._id),
            tenantId: tenant._id,
            schoolName: tenant.name,
            email: email.toLowerCase(),
            phone: tenant.contactPhone || '',
            currency: 'PKR',
            receiptPrefix: 'RCPT',
            receiptSettings: {
              showLogo: true,
              showAddress: true,
              showPhone: true,
              signatureLabel: 'Authorized Signature',
            },
            resultCardSettings: {
              showLogo: true,
              showPosition: true,
              showGrade: true,
              signatureLabel: 'Principal Signature',
            },
            themeSettings: { compactSidebar: false },
          },
        },
        { upsert: true, new: true }
      );

      // 5. Provision Default Academic Session
      const now = new Date();
      const currentYear = now.getFullYear();
      const sessionName = `${currentYear}–${currentYear + 1}`;
      
      let academicSession = await models.AcademicSession.findOne({ name: sessionName });
      if (!academicSession) {
        academicSession = await models.AcademicSession.create({
          tenantId: tenant._id,
          name: sessionName,
          startDate: new Date(`${currentYear}-04-01`),
          endDate: new Date(`${currentYear + 1}-03-31`),
          isActive: true,
          isArchived: false,
          createdBy: ownerUser._id,
        });

        // Link the active session to the SchoolSettings
        await models.SchoolSettings.updateOne(
          { _id: String(tenant._id) },
          { $set: { activeSessionId: academicSession._id } }
        );
      }

      // 6. Ensure indexes for all newly migrated Batch-1 operational models
      // Using createIndexes() safely builds missing indexes without dropping existing ones
      await Promise.all([
        models.User.createIndexes(),
        models.Role.createIndexes(),
        models.SchoolSettings.createIndexes(),
        models.AcademicSession.createIndexes(),
        models.AuthSession.createIndexes(),
        models.Class.createIndexes(),
        models.Section.createIndexes(),
        models.Student.createIndexes(),
        models.StudentHistory.createIndexes(),
        models.ReceiptCounter.createIndexes(),
        models.Staff.createIndexes(),
        models.Subject.createIndexes(),
        models.ClassTeacherAssignment.createIndexes(),
        models.TemporaryAssignment.createIndexes(),
        models.StudentAttendance.createIndexes(),
        models.TeacherAttendance.createIndexes(),
        models.NonTeachingStaffAttendance.createIndexes(),
        models.SchoolClosure.createIndexes(),
        models.FeeStructure.createIndexes(),
        models.StudentFee.createIndexes(),
        models.Payment.createIndexes(),
        models.PaymentReversal.createIndexes(),
        models.FeeDiscount.createIndexes(),
        models.FeeSetting.createIndexes(),
        models.PaymentMethod.createIndexes(),
        models.FinancialIdempotency.createIndexes(),
        models.FinancialReference.createIndexes(),
        models.Expense.createIndexes(),
        models.Income.createIndexes(),
        models.SalaryRecord.createIndexes(),
        models.Exam.createIndexes(),
        models.ExamSchedule.createIndexes(),
        models.ExamRollNumber.createIndexes(),
        models.ExamType.createIndexes(),
        models.GradeScale.createIndexes(),
        models.Mark.createIndexes(),
        models.Result.createIndexes(),
        models.ExamFee.createIndexes(),
        models.StudentExamFee.createIndexes(),
        models.ExamFeePayment.createIndexes(),
        models.ExamAttendance.createIndexes(),
        models.AdmitCardOverride.createIndexes()
      ]);

      return ownerUser;
    } catch (error: any) {
      console.error(`Provisioning failed for tenant ${tenant._id}:`, error);
      throw error;
    }
  }
}
