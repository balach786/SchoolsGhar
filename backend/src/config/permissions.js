"use strict";
/**
 * Permission system configuration — the single source of truth for
 * modules, actions, and default role matrices.
 *
 * No library / transport / parentPortal / rooms / GPA modules.
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE_PERMISSIONS = exports.FULL_ACCESS = exports.ROLE_SLUGS = exports.MODULE_LABELS = exports.PERMISSION_MODULES = exports.PERMISSION_CATALOG = exports.PERMISSION_ACTIONS = void 0;
exports.normalizePermissions = normalizePermissions;
exports.PERMISSION_ACTIONS = [
    'view',
    'create',
    'edit',
    'delete',
    'cleanup',
    'archive',
    'approve',
    'export',
    'import',
    'print',
    'publish',
    'collect',
    'schedule',
    'generate',
    'discount',
    'fine',
    'overrideEligibility',
    'mark',
    'review',
    'republish',
    'history',
];
/**
 * Canonical permission catalog defining tenant manageability and action sets.
 * Single source of truth for the entire application.
 */
exports.PERMISSION_CATALOG = [
    { module: 'dashboard', label: 'Dashboard', actions: ['view'], tenantManageable: true },
    { module: 'users', label: 'Users', actions: ['view', 'create', 'edit'], tenantManageable: true },
    { module: 'roles', label: 'Roles & Permissions', actions: ['view', 'create', 'edit'], tenantManageable: true },
    { module: 'students', label: 'Students', actions: ['view', 'create', 'edit', 'delete', 'archive', 'export', 'import', 'print'], tenantManageable: true },
    { module: 'teachers', label: 'Teachers', actions: ['view', 'create', 'edit', 'delete', 'archive', 'export', 'import', 'print'], tenantManageable: true },
    { module: 'classes', label: 'Classes', actions: ['view', 'create', 'edit', 'delete', 'archive'], tenantManageable: true },
    { module: 'sections', label: 'Sections', actions: ['view', 'create', 'edit', 'delete', 'archive'], tenantManageable: true },
    { module: 'subjects', label: 'Subjects', actions: ['view', 'create', 'edit', 'delete', 'archive'], tenantManageable: true },
    { module: 'academicSessions', label: 'Academic Sessions', actions: ['view', 'create', 'edit', 'delete'], tenantManageable: true },
    { module: 'studentAttendance', label: 'Student Attendance', actions: ['view', 'create', 'edit', 'export', 'import', 'print'], tenantManageable: true },
    { module: 'teacherAttendance', label: 'Teacher Attendance', actions: ['view', 'create', 'edit', 'export', 'import', 'print'], tenantManageable: true },
    { module: 'nonTeachingAttendance', label: 'Non-Teaching Staff Attendance', actions: ['view', 'create', 'edit', 'export', 'print'], tenantManageable: true },
    { module: 'timetables', label: 'Timetables', actions: ['view', 'create', 'edit', 'delete', 'print'], tenantManageable: true },
    { module: 'exams', label: 'Exams', actions: ['view', 'create', 'edit', 'delete', 'archive', 'schedule', 'publish'], tenantManageable: true },
    { module: 'examFees', label: 'Exam Fees', actions: ['view', 'generate', 'collect', 'edit', 'discount', 'fine', 'print', 'export'], tenantManageable: true },
    { module: 'admitCards', label: 'Admit Cards', actions: ['view', 'generate', 'print', 'overrideEligibility'], tenantManageable: true },
    { module: 'examAttendance', label: 'Exam Attendance', actions: ['view', 'mark', 'edit'], tenantManageable: true },
    { module: 'marks', label: 'Marks', actions: ['view', 'create', 'edit', 'export', 'import'], tenantManageable: true },
    { module: 'results', label: 'Results', actions: ['view', 'create', 'edit', 'review', 'publish', 'republish', 'history', 'print', 'export'], tenantManageable: true },
    { module: 'fees', label: 'Fees', actions: ['view', 'create', 'edit', 'collect', 'print', 'export', 'import'], tenantManageable: true },
    { module: 'payments', label: 'Payments', actions: ['view', 'create', 'edit', 'print', 'export'], tenantManageable: true },
    { module: 'incomes', label: 'Income', actions: ['view', 'create', 'edit', 'delete', 'export'], tenantManageable: true },
    { module: 'expenses', label: 'Expenses', actions: ['view', 'create', 'edit', 'delete', 'export'], tenantManageable: true },
    { module: 'salaries', label: 'Salaries', actions: ['view', 'create', 'edit', 'export'], tenantManageable: true },
    { module: 'assignments', label: 'Assignments', actions: ['view', 'create', 'edit', 'delete'], tenantManageable: true },
    { module: 'submissions', label: 'Submissions', actions: ['view', 'create', 'edit'], tenantManageable: true },
    { module: 'notices', label: 'Notices', actions: ['view', 'create', 'edit', 'delete', 'publish'], tenantManageable: true },
    { module: 'notifications', label: 'Notifications', actions: ['view', 'delete'], tenantManageable: true },
    { module: 'leaveRequests', label: 'Leave Requests', actions: ['view', 'create', 'approve'], tenantManageable: true },
    { module: 'reports', label: 'Reports', actions: ['view', 'export', 'print'], tenantManageable: true },
    { module: 'schoolSettings', label: 'School Settings', actions: ['view', 'edit'], tenantManageable: true },
    { module: 'auditLogs', label: 'Audit Logs', actions: ['view', 'export'], tenantManageable: true },
    { module: 'system', label: 'System', actions: ['view', 'cleanup'], tenantManageable: false },
    { module: 'dataManagement', label: 'Data Management', actions: ['view', 'export', 'import'], tenantManageable: true },
];
/** Derived backwards-compatible module definitions. */
exports.PERMISSION_MODULES = exports.PERMISSION_CATALOG.map(function (m) { return ({
    module: m.module,
    label: m.label,
    actions: m.actions,
}); });
exports.MODULE_LABELS = Object.fromEntries(exports.PERMISSION_CATALOG.map(function (m) { return [m.module, m.label]; }));
/** Role slugs (exactly six system roles). */
exports.ROLE_SLUGS = {
    superAdmin: 'super_admin',
    admin: 'admin',
    teacher: 'teacher',
    student: 'student',
    accountant: 'accountant',
    receptionist: 'receptionist',
};
exports.FULL_ACCESS = Object.fromEntries(exports.PERMISSION_MODULES.map(function (m) { return [m.module, __spreadArray([], m.actions, true)]; }));
/** Default permission matrices for development/system roles. */
exports.DEFAULT_ROLE_PERMISSIONS = (_a = {},
    _a[exports.ROLE_SLUGS.superAdmin] = exports.FULL_ACCESS,
    _a[exports.ROLE_SLUGS.admin] = exports.FULL_ACCESS,
    _a[exports.ROLE_SLUGS.teacher] = {
        dashboard: ['view'],
        studentAttendance: ['view', 'create', 'edit', 'export'],
        notices: ['view'],
    },
    _a[exports.ROLE_SLUGS.student] = {
        dashboard: ['view'],
        studentAttendance: ['view'],
        timetables: ['view'],
        exams: ['view'],
        examFees: ['view'],
        admitCards: ['view', 'print'],
        results: ['view', 'print'],
        fees: ['view'],
        payments: ['view'],
        assignments: ['view'],
        submissions: ['view', 'create'],
        notices: ['view'],
        notifications: ['view', 'delete'],
        leaveRequests: ['view', 'create'],
    },
    _a[exports.ROLE_SLUGS.accountant] = {
        dashboard: ['view'],
        students: ['view'],
        fees: ['view', 'create', 'edit', 'collect', 'print', 'export', 'import'],
        payments: ['view', 'create', 'edit', 'print', 'export'],
        examFees: ['view', 'generate', 'collect', 'edit', 'discount', 'fine', 'print', 'export'],
        incomes: ['view', 'create', 'edit', 'delete', 'export'],
        expenses: ['view', 'create', 'edit', 'export'],
        salaries: ['view', 'create', 'edit', 'export'],
        reports: ['view', 'export', 'print'],
        notices: ['view'],
        notifications: ['view', 'delete'],
        dataManagement: ['view', 'export'],
    },
    _a[exports.ROLE_SLUGS.receptionist] = {
        dashboard: ['view'],
        students: ['view', 'create', 'edit'],
        studentAttendance: ['view', 'create', 'edit'],
        teacherAttendance: ['view', 'create', 'edit'],
        nonTeachingAttendance: ['view', 'create', 'edit'],
        timetables: ['view'],
        leaveRequests: ['view', 'create', 'approve'],
        notices: ['view'],
    },
    _a);
/** Map a loose permissions object to the compact stored format. */
function normalizePermissions(perms) {
    var _a;
    var entries = [];
    var _loop_1 = function (def) {
        var actions = ((_a = perms[def.module]) !== null && _a !== void 0 ? _a : []).filter(function (a) {
            return def.actions.includes(a);
        });
        if (actions.length)
            entries.push({ module: def.module, actions: actions });
    };
    for (var _i = 0, PERMISSION_MODULES_1 = exports.PERMISSION_MODULES; _i < PERMISSION_MODULES_1.length; _i++) {
        var def = PERMISSION_MODULES_1[_i];
        _loop_1(def);
    }
    return entries;
}
