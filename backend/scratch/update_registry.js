import fs from 'fs';
import path from 'path';

function updateRegistry() {
  const file = path.resolve(process.cwd(), 'src/services/TenantModelRegistry.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Add imports
  if (!content.includes('ITemporaryAssignment')) {
    content = content.replace(
      "import { IClassTeacherAssignment, classTeacherAssignmentSchema } from '../models/ClassTeacherAssignment';",
      "import { IClassTeacherAssignment, classTeacherAssignmentSchema } from '../models/ClassTeacherAssignment';\nimport { ITemporaryAssignment, temporaryAssignmentSchema } from '../models/TemporaryAssignment';\nimport { ITeacher, teacherDiscriminatorSchema } from '../models/Teacher';"
    );
  }

  // Add to TenantModels interface
  if (!content.includes('TemporaryAssignment: Model<ITemporaryAssignment>')) {
    content = content.replace(
      "ClassTeacherAssignment: Model<IClassTeacherAssignment>;",
      "ClassTeacherAssignment: Model<IClassTeacherAssignment>;\n  TemporaryAssignment: Model<ITemporaryAssignment>;\n  Teacher: Model<ITeacher>;"
    );
  }

  // Update getTenantModels function
  if (!content.includes('tenantDb.models.TemporaryAssignment')) {
    // Staff creation is already there: Staff: tenantDb.models.Staff || tenantDb.model<IStaff>('Staff', staffSchema, 'staff'),
    // We need to capture Staff and define Teacher on it.
    
    const replacement = `
  const Staff = tenantDb.models.Staff || tenantDb.model<IStaff>('Staff', staffSchema, 'staff');
  const Teacher = (Staff.discriminators && Staff.discriminators['Teacher'] as Model<ITeacher>) || Staff.discriminator<ITeacher>('Teacher', teacherDiscriminatorSchema, 'teaching');

  return {
    User: tenantDb.models.User || tenantDb.model<IUser>('User', User.schema),
    Role: tenantDb.models.Role || tenantDb.model<IRole>('Role', Role.schema),
    SchoolSettings: tenantDb.models.SchoolSettings || tenantDb.model<ISchoolSettings>('SchoolSettings', SchoolSettings.schema),
    AcademicSession: tenantDb.models.AcademicSession || tenantDb.model<IAcademicSession>('AcademicSession', AcademicSession.schema),
    AuthSession: tenantDb.models.AuthSession || tenantDb.model<IAuthSession>('AuthSession', AuthSession.schema),
    Class: tenantDb.models.Class || tenantDb.model<IClass>('Class', classSchema),
    Section: tenantDb.models.Section || tenantDb.model<ISection>('Section', sectionSchema),
    Student: tenantDb.models.Student || tenantDb.model<IStudent>('Student', studentSchema),
    StudentHistory: tenantDb.models.StudentHistory || tenantDb.model<IStudentHistory>('StudentHistory', studentHistorySchema),
    ReceiptCounter: tenantDb.models.ReceiptCounter || tenantDb.model<IReceiptCounter>('ReceiptCounter', receiptCounterSchema),
    Staff,
    Teacher,
    Subject: tenantDb.models.Subject || tenantDb.model<ISubject>('Subject', subjectSchema),
    ClassTeacherAssignment: tenantDb.models.ClassTeacherAssignment || tenantDb.model<IClassTeacherAssignment>('ClassTeacherAssignment', classTeacherAssignmentSchema),
    TemporaryAssignment: tenantDb.models.TemporaryAssignment || tenantDb.model<ITemporaryAssignment>('TemporaryAssignment', temporaryAssignmentSchema),
  };
`;

    content = content.replace(/return \{[\s\S]*?  \};\n}/, replacement + '}');
  }

  fs.writeFileSync(file, content, 'utf8');
}

updateRegistry();
console.log('Registry updated');
