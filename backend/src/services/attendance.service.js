"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchoolTodayISO = exports.SCHOOL_TIMEZONE = void 0;
exports.normalizeDate = normalizeDate;
exports.dayStart = dayStart;
exports.dayEnd = dayEnd;
exports.computeAttendanceRate = computeAttendanceRate;
exports.resolveAttendanceContext = resolveAttendanceContext;
exports.getOwnStudent = getOwnStudent;
exports.getOwnTeacher = getOwnTeacher;
exports.authorizeAttendanceModification = authorizeAttendanceModification;
var mongoose_1 = __importDefault(require("mongoose"));
var ApiError_1 = require("../utils/ApiError");
var TenantModelRegistry_1 = require("./TenantModelRegistry");
var schoolDate_1 = require("../utils/schoolDate");
Object.defineProperty(exports, "SCHOOL_TIMEZONE", { enumerable: true, get: function () { return schoolDate_1.SCHOOL_TIMEZONE; } });
Object.defineProperty(exports, "getSchoolTodayISO", { enumerable: true, get: function () { return schoolDate_1.getSchoolTodayISO; } });
function normalizeDate(value) {
    var str = typeof value === 'string'
        ? value.slice(0, 10)
        : new Date(value).toISOString().slice(0, 10);
    var _a = str.split('-').map(Number), y = _a[0], m = _a[1], d = _a[2];
    if (!y || !m || !d)
        throw ApiError_1.ApiError.badRequest('Invalid date value', 'INVALID_DATE');
    // Store as midnight UTC representation of the school calendar date
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function dayStart(d) {
    return normalizeDate(d);
}
function dayEnd(d) {
    var start = normalizeDate(d);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
/** Standard attendance percentage formula shared across daily, monthly, and profile views. */
function computeAttendanceRate(counts) {
    var totalRecorded = counts.present + counts.late + counts.absent + counts.leave;
    var attended = counts.present + counts.late;
    var attendanceRate = totalRecorded > 0
        ? Math.round((attended / totalRecorded) * 1000) / 10
        : 0;
    return { attended: attended, totalRecorded: totalRecorded, attendanceRate: attendanceRate };
}
/** Resolve and validate the session→class→optional-section chain for attendance. */
function resolveAttendanceContext(sessionId, classId, sectionId, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, AcademicSession, Class, Section, qSession, session, qClass, cls, section, qSection;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tenantDb)
                        throw new ApiError_1.ApiError(500, 'tenantDb connection is required');
                    _a = (0, TenantModelRegistry_1.getTenantModels)(tenantDb), AcademicSession = _a.AcademicSession, Class = _a.Class, Section = _a.Section;
                    qSession = { _id: sessionId };
                    if (tenantId)
                        qSession.tenantId = tenantId;
                    return [4 /*yield*/, AcademicSession.findOne(qSession)];
                case 1:
                    session = _b.sent();
                    if (!session)
                        throw ApiError_1.ApiError.notFound('Academic session not found');
                    if (session.isArchived)
                        throw ApiError_1.ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
                    if (!session.isActive)
                        throw ApiError_1.ApiError.badRequest('Attendance can only be marked for the active academic session', 'SESSION_INACTIVE');
                    qClass = { _id: classId };
                    if (tenantId)
                        qClass.tenantId = tenantId;
                    return [4 /*yield*/, Class.findOne(qClass)];
                case 2:
                    cls = _b.sent();
                    if (!cls)
                        throw ApiError_1.ApiError.notFound('Class not found');
                    if (cls.isArchived)
                        throw ApiError_1.ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
                    if (String(cls.sessionId) !== String(session._id)) {
                        throw ApiError_1.ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
                    }
                    section = null;
                    if (!sectionId) return [3 /*break*/, 4];
                    qSection = { _id: sectionId };
                    if (tenantId)
                        qSection.tenantId = tenantId;
                    return [4 /*yield*/, Section.findOne(qSection)];
                case 3:
                    section = _b.sent();
                    if (!section)
                        throw ApiError_1.ApiError.notFound('Section not found');
                    if (section.isArchived)
                        throw ApiError_1.ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
                    if (String(section.classId) !== String(cls._id)) {
                        throw ApiError_1.ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
                    }
                    _b.label = 4;
                case 4: return [2 /*return*/, { session: session, cls: cls, section: section }];
            }
        });
    });
}
/** Resolve the student profile of the currently signed-in student user. */
function getOwnStudent(user, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var StudentModel, student;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!tenantDb)
                        throw new Error('Tenant DB required');
                    StudentModel = (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Student;
                    return [4 /*yield*/, StudentModel.findOne({ userId: user._id, isArchived: false })];
                case 1:
                    student = _a.sent();
                    if (!student)
                        throw ApiError_1.ApiError.forbidden('No active student profile is linked to this account', 'STUDENT_PROFILE_REQUIRED');
                    return [2 /*return*/, student];
            }
        });
    });
}
/** Resolve the teacher profile of the currently signed-in teacher user. */
function getOwnTeacher(user, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var TeacherModel, UserModel, teacher, userDoc, matchQuery, potentialMatches;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!tenantDb)
                        throw new Error('Tenant DB required');
                    TeacherModel = (0, TenantModelRegistry_1.getTenantModels)(tenantDb).Teacher;
                    UserModel = (0, TenantModelRegistry_1.getTenantModels)(tenantDb).User;
                    return [4 /*yield*/, TeacherModel.findOne({ userId: user._id, isArchived: false })];
                case 1:
                    teacher = _a.sent();
                    if (!!teacher) return [3 /*break*/, 5];
                    return [4 /*yield*/, UserModel.findById(user._id).select('email tenantId')];
                case 2:
                    userDoc = _a.sent();
                    if (!(userDoc && userDoc.email)) return [3 /*break*/, 5];
                    matchQuery = {
                        email: userDoc.email.trim().toLowerCase(),
                        isArchived: false,
                        isActive: true,
                    };
                    if (userDoc.tenantId)
                        matchQuery.tenantId = userDoc.tenantId;
                    return [4 /*yield*/, TeacherModel.find(matchQuery)];
                case 3:
                    potentialMatches = _a.sent();
                    if (!(potentialMatches.length === 1 && !potentialMatches[0].userId)) return [3 /*break*/, 5];
                    teacher = potentialMatches[0];
                    teacher.userId = new mongoose_1.default.Types.ObjectId(user._id);
                    return [4 /*yield*/, teacher.save()];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    if (!teacher)
                        throw ApiError_1.ApiError.forbidden('No active teacher profile is linked to this account', 'TEACHER_PROFILE_REQUIRED');
                    return [2 /*return*/, teacher];
            }
        });
    });
}
var permission_service_1 = require("./permission.service");
function authorizeAttendanceModification(user, classId, attendanceDate, tenantId, tenantDb) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, Class, TemporaryAssignment, canManage, teacher, cls, startOfDay, assignment;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = (0, TenantModelRegistry_1.getTenantModels)(tenantDb), Class = _a.Class, TemporaryAssignment = _a.TemporaryAssignment;
                    return [4 /*yield*/, (0, permission_service_1.hasPermission)(user.roleId, user.role, 'studentAttendance', 'create', tenantId, tenantDb)];
                case 1:
                    canManage = _b.sent();
                    if (canManage)
                        return [2 /*return*/];
                    // If student or parent, deny immediately
                    if (user.role === 'student' || user.role === 'parent') {
                        throw ApiError_1.ApiError.forbidden('Students and parents cannot mark attendance', 'ATTENDANCE_FORBIDDEN');
                    }
                    return [4 /*yield*/, getOwnTeacher(user, tenantDb)];
                case 2:
                    teacher = _b.sent();
                    return [4 /*yield*/, Class.findOne({ _id: classId, tenantId: tenantId })];
                case 3:
                    cls = _b.sent();
                    if (!cls)
                        throw ApiError_1.ApiError.notFound('Class not found');
                    if (cls.classTeacherId && String(cls.classTeacherId) === String(teacher._id)) {
                        return [2 /*return*/]; // ALLOW
                    }
                    startOfDay = normalizeDate(attendanceDate);
                    return [4 /*yield*/, TemporaryAssignment.findOne({
                            classId: cls._id,
                            substituteTeacherId: teacher._id,
                            status: 'active',
                            startDate: { $lte: startOfDay },
                            endDate: { $gte: startOfDay }
                        })];
                case 4:
                    assignment = _b.sent();
                    if (assignment) {
                        return [2 /*return*/]; // ALLOW
                    }
                    throw ApiError_1.ApiError.forbidden('You are not authorized to mark attendance for this class today. Only the Class Teacher, an active Substitute, or an Admin can modify attendance.', 'ATTENDANCE_NOT_AUTHORIZED');
            }
        });
    });
}
