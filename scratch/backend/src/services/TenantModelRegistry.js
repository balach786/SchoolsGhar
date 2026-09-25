"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantModels = getTenantModels;
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
var FeeDiscount_1 = require("../models/FeeDiscount");
var FeeSetting_1 = require("../models/FeeSetting");
var PaymentMethod_1 = require("../models/PaymentMethod");
var FinancialIdempotency_1 = require("../models/FinancialIdempotency");
var FinancialReference_1 = require("../models/FinancialReference");
function getTenantModels(tenantDb) {
    var Staff = tenantDb.models.Staff || tenantDb.model('Staff', Staff_1.staffSchema, 'staff');
    var Teacher = (Staff.discriminators && Staff.discriminators['Teacher']) || Staff.discriminator('Teacher', Teacher_1.teacherDiscriminatorSchema, 'teaching');
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
        FeeDiscount: tenantDb.models.FeeDiscount || tenantDb.model('FeeDiscount', FeeDiscount_1.feeDiscountSchema),
        FeeSetting: tenantDb.models.FeeSetting || tenantDb.model('FeeSetting', FeeSetting_1.feeSettingSchema),
        PaymentMethod: tenantDb.models.PaymentMethod || tenantDb.model('PaymentMethod', PaymentMethod_1.paymentMethodSchema),
        FinancialIdempotency: tenantDb.models.FinancialIdempotency || tenantDb.model('FinancialIdempotency', FinancialIdempotency_1.financialIdempotencySchema),
        FinancialReference: tenantDb.models.FinancialReference || tenantDb.model('FinancialReference', FinancialReference_1.financialReferenceSchema),
    };
}
