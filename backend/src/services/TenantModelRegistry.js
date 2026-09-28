"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantModels = getTenantModels;
var mongoose_1 = __importDefault(require("mongoose"));
var User_1 = require("../models/User");
var Role_1 = require("../models/Role");
var SchoolSettings_1 = require("../models/SchoolSettings");
var AcademicSession_1 = require("../models/AcademicSession");
var AuthSession_1 = require("../models/AuthSession");
var Class_1 = require("../models/Class");
var Section_1 = require("../models/Section");
var Student_1 = require("../models/Student");
var StudentHistory_1 = require("../models/StudentHistory");
var ReceiptCounter_1 = require("../models/ReceiptCounter");
var TenantSequence_1 = require("../models/TenantSequence");
var Staff_1 = require("../models/Staff");
var Subject_1 = require("../models/Subject");
var ClassTeacherAssignment_1 = require("../models/ClassTeacherAssignment");
var TemporaryAssignment_1 = require("../models/TemporaryAssignment");
var Teacher_1 = require("../models/Teacher");
var StudentAttendance_1 = require("../models/StudentAttendance");
var TeacherAttendance_1 = require("../models/TeacherAttendance");
var NonTeachingStaffAttendance_1 = require("../models/NonTeachingStaffAttendance");
var SchoolClosure_1 = require("../models/SchoolClosure");
var FeeStructure_1 = require("../models/FeeStructure");
var StudentFee_1 = require("../models/StudentFee");
var Payment_1 = require("../models/Payment");
var PaymentReversal_1 = require("../models/PaymentReversal");
var SalaryRecord_1 = require("../models/SalaryRecord");
var FeeDiscount_1 = require("../models/FeeDiscount");
var FeeSetting_1 = require("../models/FeeSetting");
var PaymentMethod_1 = require("../models/PaymentMethod");
var FinancialIdempotency_1 = require("../models/FinancialIdempotency");
var FinancialReference_1 = require("../models/FinancialReference");
var ExamFeePayment_1 = require("../models/ExamFeePayment");
var StudentExamFee_1 = require("../models/StudentExamFee");
var Expense_1 = require("../models/Expense");
var Income_1 = require("../models/Income");
var Exam_1 = require("../models/Exam");
var ExamSchedule_1 = require("../models/ExamSchedule");
var ExamRollNumber_1 = require("../models/ExamRollNumber");
var ExamType_1 = require("../models/ExamType");
var GradeScale_1 = require("../models/GradeScale");
var Mark_1 = require("../models/Mark");
var Result_1 = require("../models/Result");
var ExamFee_1 = require("../models/ExamFee");
var ExamAttendance_1 = require("../models/ExamAttendance");
var AdmitCardOverride_1 = require("../models/AdmitCardOverride");
// Batch 8 operational models
var Notice_1 = require("../models/Notice");
var Notification_1 = require("../models/Notification");
var AuditLog_1 = require("../models/AuditLog");
var Assignment_1 = require("../models/Assignment");
var Submission_1 = require("../models/Submission");
var Timetable_1 = require("../models/Timetable");
var LeaveRequest_1 = require("../models/LeaveRequest");
var DataHistory_1 = require("../models/DataHistory");
var ExportPreset_1 = require("../models/ExportPreset");
function getTenantModels(tenantDb) {
    var Staff = tenantDb.models.Staff;
    var Teacher = tenantDb.models.Teacher;
    if (!Staff) {
        var tenantStaffSchema = Staff_1.staffSchema.clone();
        Staff = tenantDb.model('Staff', tenantStaffSchema, 'staff');
        Teacher = Staff.discriminator('Teacher', Teacher_1.teacherDiscriminatorSchema, 'teaching');
        Staff.discriminator('non_teaching', new mongoose_1.default.Schema({}, { _id: false, versionKey: false }), 'non_teaching');
    }
    else {
        Teacher = (Staff.discriminators && Staff.discriminators['Teacher']) || Staff;
    }
    return {
        User: tenantDb.models.User || tenantDb.model('User', User_1.User.schema),
        Role: tenantDb.models.Role || tenantDb.model('Role', Role_1.Role.schema),
        SchoolSettings: tenantDb.models.SchoolSettings || tenantDb.model('SchoolSettings', SchoolSettings_1.SchoolSettings.schema),
        AcademicSession: tenantDb.models.AcademicSession || tenantDb.model('AcademicSession', AcademicSession_1.AcademicSession.schema),
        AuthSession: tenantDb.models.AuthSession || tenantDb.model('AuthSession', AuthSession_1.AuthSession.schema),
        Class: tenantDb.models.Class || tenantDb.model('Class', Class_1.classSchema),
        Section: tenantDb.models.Section || tenantDb.model('Section', Section_1.sectionSchema),
        Student: tenantDb.models.Student || tenantDb.model('Student', Student_1.studentSchema),
        StudentHistory: tenantDb.models.StudentHistory || tenantDb.model('StudentHistory', StudentHistory_1.studentHistorySchema),
        ReceiptCounter: tenantDb.models.ReceiptCounter || tenantDb.model('ReceiptCounter', ReceiptCounter_1.receiptCounterSchema),
        TenantSequence: tenantDb.models.TenantSequence || tenantDb.model('TenantSequence', TenantSequence_1.tenantSequenceSchema),
        Staff: Staff,
        Teacher: Teacher,
        Subject: tenantDb.models.Subject || tenantDb.model('Subject', Subject_1.subjectSchema),
        ClassTeacherAssignment: tenantDb.models.ClassTeacherAssignment || tenantDb.model('ClassTeacherAssignment', ClassTeacherAssignment_1.classTeacherAssignmentSchema),
        TemporaryAssignment: tenantDb.models.TemporaryAssignment || tenantDb.model('TemporaryAssignment', TemporaryAssignment_1.temporaryAssignmentSchema),
        StudentAttendance: tenantDb.models.StudentAttendance || tenantDb.model('StudentAttendance', StudentAttendance_1.studentAttendanceSchema),
        TeacherAttendance: tenantDb.models.TeacherAttendance || tenantDb.model('TeacherAttendance', TeacherAttendance_1.teacherAttendanceSchema),
        NonTeachingStaffAttendance: tenantDb.models.NonTeachingStaffAttendance || tenantDb.model('NonTeachingStaffAttendance', NonTeachingStaffAttendance_1.nonTeachingStaffAttendanceSchema),
        SchoolClosure: tenantDb.models.SchoolClosure || tenantDb.model('SchoolClosure', SchoolClosure_1.schoolClosureSchema),
        FeeStructure: tenantDb.models.FeeStructure || tenantDb.model('FeeStructure', FeeStructure_1.feeStructureSchema),
        StudentFee: tenantDb.models.StudentFee || tenantDb.model('StudentFee', StudentFee_1.studentFeeSchema),
        Payment: tenantDb.models.Payment || tenantDb.model('Payment', Payment_1.paymentSchema),
        PaymentReversal: tenantDb.models.PaymentReversal || tenantDb.model('PaymentReversal', PaymentReversal_1.paymentReversalSchema),
        SalaryRecord: tenantDb.models.SalaryRecord || tenantDb.model('SalaryRecord', SalaryRecord_1.salaryRecordSchema),
        FeeDiscount: tenantDb.models.FeeDiscount || tenantDb.model('FeeDiscount', FeeDiscount_1.feeDiscountSchema),
        FeeSetting: tenantDb.models.FeeSetting || tenantDb.model('FeeSetting', FeeSetting_1.feeSettingSchema),
        PaymentMethod: tenantDb.models.PaymentMethod || tenantDb.model('PaymentMethod', PaymentMethod_1.paymentMethodSchema),
        FinancialIdempotency: tenantDb.models.FinancialIdempotency || tenantDb.model('FinancialIdempotency', FinancialIdempotency_1.financialIdempotencySchema),
        FinancialReference: tenantDb.models.FinancialReference || tenantDb.model('FinancialReference', FinancialReference_1.financialReferenceSchema),
        ExamFeePayment: tenantDb.models.ExamFeePayment || tenantDb.model('ExamFeePayment', ExamFeePayment_1.examFeePaymentSchema),
        StudentExamFee: tenantDb.models.StudentExamFee || tenantDb.model('StudentExamFee', StudentExamFee_1.studentExamFeeSchema),
        Expense: tenantDb.models.Expense || tenantDb.model('Expense', Expense_1.expenseSchema),
        Income: tenantDb.models.Income || tenantDb.model('Income', Income_1.incomeSchema),
        Exam: tenantDb.models.Exam || tenantDb.model('Exam', Exam_1.Exam.schema),
        ExamSchedule: tenantDb.models.ExamSchedule || tenantDb.model('ExamSchedule', ExamSchedule_1.ExamSchedule.schema),
        ExamRollNumber: tenantDb.models.ExamRollNumber || tenantDb.model('ExamRollNumber', ExamRollNumber_1.ExamRollNumber.schema),
        ExamType: tenantDb.models.ExamType || tenantDb.model('ExamType', ExamType_1.ExamType.schema),
        GradeScale: tenantDb.models.GradeScale || tenantDb.model('GradeScale', GradeScale_1.GradeScale.schema),
        Mark: tenantDb.models.Mark || tenantDb.model('Mark', Mark_1.Mark.schema),
        Result: tenantDb.models.Result || tenantDb.model('Result', Result_1.Result.schema, 'results'),
        ExamFee: tenantDb.models.ExamFee || tenantDb.model('ExamFee', ExamFee_1.ExamFee.schema),
        ExamAttendance: tenantDb.models.ExamAttendance || tenantDb.model('ExamAttendance', ExamAttendance_1.ExamAttendance.schema),
        AdmitCardOverride: tenantDb.models.AdmitCardOverride || tenantDb.model('AdmitCardOverride', AdmitCardOverride_1.AdmitCardOverride.schema),
        // Batch 8 operational models
        Notice: tenantDb.models.Notice || tenantDb.model('Notice', Notice_1.Notice.schema),
        Notification: tenantDb.models.Notification || tenantDb.model('Notification', Notification_1.Notification.schema),
        AuditLog: tenantDb.models.AuditLog || tenantDb.model('AuditLog', AuditLog_1.AuditLog.schema),
        Assignment: tenantDb.models.Assignment || tenantDb.model('Assignment', Assignment_1.Assignment.schema),
        Submission: tenantDb.models.Submission || tenantDb.model('Submission', Submission_1.Submission.schema),
        Timetable: tenantDb.models.Timetable || tenantDb.model('Timetable', Timetable_1.Timetable.schema),
        LeaveRequest: tenantDb.models.LeaveRequest || tenantDb.model('LeaveRequest', LeaveRequest_1.LeaveRequest.schema),
        DataHistory: tenantDb.models.DataHistory || tenantDb.model('DataHistory', DataHistory_1.DataHistory.schema),
        ExportPreset: tenantDb.models.ExportPreset || tenantDb.model('ExportPreset', ExportPreset_1.ExportPreset.schema),
    };
}
