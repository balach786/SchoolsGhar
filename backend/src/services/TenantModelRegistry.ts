import mongoose, { Connection, Model } from 'mongoose';
import { User, IUser } from '../models/User';
import { Role, IRole } from '../models/Role';
import { SchoolSettings, ISchoolSettings } from '../models/SchoolSettings';
import { AcademicSession, IAcademicSession } from '../models/AcademicSession';
import { AuthSession, IAuthSession } from '../models/AuthSession';
import { IClass, classSchema } from '../models/Class';
import { ISection, sectionSchema } from '../models/Section';
import { IStudent, studentSchema } from '../models/Student';
import { IStudentHistory, studentHistorySchema } from '../models/StudentHistory';
import { IReceiptCounter, receiptCounterSchema } from '../models/ReceiptCounter';
import { ITenantSequence, tenantSequenceSchema } from '../models/TenantSequence';
import { IStaff, staffSchema } from '../models/Staff';
import { ISubject, subjectSchema } from '../models/Subject';
import { IClassTeacherAssignment, classTeacherAssignmentSchema } from '../models/ClassTeacherAssignment';
import { ITemporaryAssignment, temporaryAssignmentSchema } from '../models/TemporaryAssignment';
import { ITeacher, teacherDiscriminatorSchema } from '../models/Teacher';
import { IStudentAttendance, studentAttendanceSchema } from '../models/StudentAttendance';
import { ITeacherAttendance, teacherAttendanceSchema } from '../models/TeacherAttendance';
import { INonTeachingStaffAttendance, nonTeachingStaffAttendanceSchema } from '../models/NonTeachingStaffAttendance';
import { ISchoolClosure, schoolClosureSchema } from '../models/SchoolClosure';
import { IFeeStructure, feeStructureSchema } from '../models/FeeStructure';
import { IStudentFee, studentFeeSchema } from '../models/StudentFee';
import { IPayment, paymentSchema } from '../models/Payment';
import { IPaymentReversal, paymentReversalSchema } from '../models/PaymentReversal';
import { ISalaryRecord, salaryRecordSchema } from '../models/SalaryRecord';
import { IFeeDiscount, feeDiscountSchema } from '../models/FeeDiscount';
import { IFeeSetting, feeSettingSchema } from '../models/FeeSetting';
import { IPaymentMethod, paymentMethodSchema } from '../models/PaymentMethod';
import { IFinancialIdempotency, financialIdempotencySchema } from '../models/FinancialIdempotency';
import { IFinancialReference, financialReferenceSchema } from '../models/FinancialReference';
import { IExamFeePayment, examFeePaymentSchema } from '../models/ExamFeePayment';
import { IStudentExamFee, studentExamFeeSchema } from '../models/StudentExamFee';
import { IExpense, expenseSchema } from '../models/Expense';
import { IIncome, incomeSchema } from '../models/Income';
import { IExam, Exam } from '../models/Exam';
import { IExamSchedule, ExamSchedule } from '../models/ExamSchedule';
import { IExamRollNumber, ExamRollNumber } from '../models/ExamRollNumber';
import { IExamType, ExamType } from '../models/ExamType';
import { IGradeScale, GradeScale } from '../models/GradeScale';
import { IMark, Mark } from '../models/Mark';
import { IResult, Result } from '../models/Result';
import { IExamFee, ExamFee } from '../models/ExamFee';
import { IExamAttendance, ExamAttendance } from '../models/ExamAttendance';
import { IAdmitCardOverride, AdmitCardOverride } from '../models/AdmitCardOverride';

// Batch 8 operational models
import { INotice, Notice } from '../models/Notice';
import { INotification, Notification } from '../models/Notification';
import { IAuditLog, AuditLog } from '../models/AuditLog';
import { IAssignment, Assignment } from '../models/Assignment';
import { ISubmission, Submission } from '../models/Submission';
import { ITimetable, Timetable } from '../models/Timetable';
import { ILeaveRequest, LeaveRequest } from '../models/LeaveRequest';
import { IDataHistory, DataHistory } from '../models/DataHistory';
import { IExportPreset, ExportPreset } from '../models/ExportPreset';

export interface TenantModels {
  User: Model<IUser>;
  Role: Model<IRole>;
  SchoolSettings: Model<ISchoolSettings>;
  AcademicSession: Model<IAcademicSession>;
  AuthSession: Model<IAuthSession>;
  Class: Model<IClass>;
  Section: Model<ISection>;
  Student: Model<IStudent>;
  StudentHistory: Model<IStudentHistory>;
  ReceiptCounter: Model<IReceiptCounter>;
  TenantSequence: Model<ITenantSequence>;
  Staff: Model<IStaff>;
  Subject: Model<ISubject>;
  ClassTeacherAssignment: Model<IClassTeacherAssignment>;
  TemporaryAssignment: Model<ITemporaryAssignment>;
  Teacher: Model<ITeacher>;
  StudentAttendance: Model<IStudentAttendance>;
  TeacherAttendance: Model<ITeacherAttendance>;
  NonTeachingStaffAttendance: Model<INonTeachingStaffAttendance>;
  SchoolClosure: Model<ISchoolClosure>;
  FeeStructure: Model<IFeeStructure>;
  StudentFee: Model<IStudentFee>;
  Payment: Model<IPayment>;
  PaymentReversal: Model<IPaymentReversal>;
  SalaryRecord: Model<ISalaryRecord>;
  FeeDiscount: Model<IFeeDiscount>;
  FeeSetting: Model<IFeeSetting>;
  PaymentMethod: Model<IPaymentMethod>;
  FinancialIdempotency: Model<IFinancialIdempotency>;
  FinancialReference: Model<IFinancialReference>;
  ExamFeePayment: Model<IExamFeePayment>;
  StudentExamFee: Model<IStudentExamFee>;
  Expense: Model<IExpense>;
  Income: Model<IIncome>;
  Exam: Model<IExam>;
  ExamSchedule: Model<IExamSchedule>;
  ExamRollNumber: Model<IExamRollNumber>;
  ExamType: Model<IExamType>;
  GradeScale: Model<IGradeScale>;
  Mark: Model<IMark>;
  Result: Model<IResult>;
  ExamFee: Model<IExamFee>;
  ExamAttendance: Model<IExamAttendance>;
  AdmitCardOverride: Model<IAdmitCardOverride>;

  // Batch 8 operational models
  Notice: Model<INotice>;
  Notification: Model<INotification>;
  AuditLog: Model<IAuditLog>;
  Assignment: Model<IAssignment>;
  Submission: Model<ISubmission>;
  Timetable: Model<ITimetable>;
  LeaveRequest: Model<ILeaveRequest>;
  DataHistory: Model<IDataHistory>;
  ExportPreset: Model<IExportPreset>;
}

export function getTenantModels(tenantDb: Connection): TenantModels {
  
  const Staff = tenantDb.models.Staff || tenantDb.model<IStaff>('Staff', staffSchema, 'staff');
  const Teacher = (Staff.discriminators && Staff.discriminators['Teacher'] as Model<ITeacher>) || Staff.discriminator<ITeacher>('Teacher', teacherDiscriminatorSchema, 'teaching');
  
  if (!Staff.discriminators || !Staff.discriminators['non_teaching']) {
    Staff.discriminator('non_teaching', new mongoose.Schema({}, { _id: false, versionKey: false }), 'non_teaching');
  }

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
    TenantSequence: tenantDb.models.TenantSequence || tenantDb.model<ITenantSequence>('TenantSequence', tenantSequenceSchema),
    Staff,
    Teacher,
    Subject: tenantDb.models.Subject || tenantDb.model<ISubject>('Subject', subjectSchema),
    ClassTeacherAssignment: tenantDb.models.ClassTeacherAssignment || tenantDb.model<IClassTeacherAssignment>('ClassTeacherAssignment', classTeacherAssignmentSchema),
    TemporaryAssignment: tenantDb.models.TemporaryAssignment || tenantDb.model<ITemporaryAssignment>('TemporaryAssignment', temporaryAssignmentSchema),
    StudentAttendance: tenantDb.models.StudentAttendance || tenantDb.model<IStudentAttendance>('StudentAttendance', studentAttendanceSchema),
    TeacherAttendance: tenantDb.models.TeacherAttendance || tenantDb.model<ITeacherAttendance>('TeacherAttendance', teacherAttendanceSchema),
    NonTeachingStaffAttendance: tenantDb.models.NonTeachingStaffAttendance || tenantDb.model<INonTeachingStaffAttendance>('NonTeachingStaffAttendance', nonTeachingStaffAttendanceSchema),
    SchoolClosure: tenantDb.models.SchoolClosure || tenantDb.model<ISchoolClosure>('SchoolClosure', schoolClosureSchema),
    FeeStructure: tenantDb.models.FeeStructure || tenantDb.model<IFeeStructure>('FeeStructure', feeStructureSchema),
    StudentFee: tenantDb.models.StudentFee || tenantDb.model<IStudentFee>('StudentFee', studentFeeSchema),
    Payment: tenantDb.models.Payment || tenantDb.model<IPayment>('Payment', paymentSchema),
    PaymentReversal: tenantDb.models.PaymentReversal || tenantDb.model<IPaymentReversal>('PaymentReversal', paymentReversalSchema),
    SalaryRecord: tenantDb.models.SalaryRecord || tenantDb.model<ISalaryRecord>('SalaryRecord', salaryRecordSchema),
    FeeDiscount: tenantDb.models.FeeDiscount || tenantDb.model<IFeeDiscount>('FeeDiscount', feeDiscountSchema),
    FeeSetting: tenantDb.models.FeeSetting || tenantDb.model<IFeeSetting>('FeeSetting', feeSettingSchema),
    PaymentMethod: tenantDb.models.PaymentMethod || tenantDb.model<IPaymentMethod>('PaymentMethod', paymentMethodSchema),
    FinancialIdempotency: tenantDb.models.FinancialIdempotency || tenantDb.model<IFinancialIdempotency>('FinancialIdempotency', financialIdempotencySchema),
    FinancialReference: tenantDb.models.FinancialReference || tenantDb.model<IFinancialReference>('FinancialReference', financialReferenceSchema),
    ExamFeePayment: tenantDb.models.ExamFeePayment || tenantDb.model<IExamFeePayment>('ExamFeePayment', examFeePaymentSchema),
    StudentExamFee: tenantDb.models.StudentExamFee || tenantDb.model<IStudentExamFee>('StudentExamFee', studentExamFeeSchema),
    Expense: tenantDb.models.Expense || tenantDb.model<IExpense>('Expense', expenseSchema),
    Income: tenantDb.models.Income || tenantDb.model<IIncome>('Income', incomeSchema),
    Exam: tenantDb.models.Exam || tenantDb.model<IExam>('Exam', Exam.schema),
    ExamSchedule: tenantDb.models.ExamSchedule || tenantDb.model<IExamSchedule>('ExamSchedule', ExamSchedule.schema),
    ExamRollNumber: tenantDb.models.ExamRollNumber || tenantDb.model<IExamRollNumber>('ExamRollNumber', ExamRollNumber.schema),
    ExamType: tenantDb.models.ExamType || tenantDb.model<IExamType>('ExamType', ExamType.schema),
    GradeScale: tenantDb.models.GradeScale || tenantDb.model<IGradeScale>('GradeScale', GradeScale.schema),
    Mark: tenantDb.models.Mark || tenantDb.model<IMark>('Mark', Mark.schema),
    Result: tenantDb.models.Result || tenantDb.model<IResult>('Result', Result.schema, 'results'),
    ExamFee: tenantDb.models.ExamFee || tenantDb.model<IExamFee>('ExamFee', ExamFee.schema),
    ExamAttendance: tenantDb.models.ExamAttendance || tenantDb.model<IExamAttendance>('ExamAttendance', ExamAttendance.schema),
    AdmitCardOverride: tenantDb.models.AdmitCardOverride || tenantDb.model<IAdmitCardOverride>('AdmitCardOverride', AdmitCardOverride.schema),
    
    // Batch 8 operational models
    Notice: tenantDb.models.Notice || tenantDb.model<INotice>('Notice', Notice.schema),
    Notification: tenantDb.models.Notification || tenantDb.model<INotification>('Notification', Notification.schema),
    AuditLog: tenantDb.models.AuditLog || tenantDb.model<IAuditLog>('AuditLog', AuditLog.schema),
    Assignment: tenantDb.models.Assignment || tenantDb.model<IAssignment>('Assignment', Assignment.schema),
    Submission: tenantDb.models.Submission || tenantDb.model<ISubmission>('Submission', Submission.schema),
    Timetable: tenantDb.models.Timetable || tenantDb.model<ITimetable>('Timetable', Timetable.schema),
    LeaveRequest: tenantDb.models.LeaveRequest || tenantDb.model<ILeaveRequest>('LeaveRequest', LeaveRequest.schema),
    DataHistory: tenantDb.models.DataHistory || tenantDb.model<IDataHistory>('DataHistory', DataHistory.schema),
    ExportPreset: tenantDb.models.ExportPreset || tenantDb.model<IExportPreset>('ExportPreset', ExportPreset.schema),
  };
}
