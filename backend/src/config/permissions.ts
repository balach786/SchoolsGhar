/**
 * Permission system configuration — the single source of truth for
 * modules, actions, and default role matrices.
 *
 * No library / transport / parentPortal / rooms / GPA modules.
 */

export const PERMISSION_ACTIONS = [
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
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface ModuleDef {
  module: string;
  label: string;
  actions: PermissionAction[];
}

export interface PermissionCatalogEntry {
  module: string;
  label: string;
  actions: PermissionAction[];
  tenantManageable: boolean;
}

/**
 * Canonical permission catalog defining tenant manageability and action sets.
 * Single source of truth for the entire application.
 */
export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
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
export const PERMISSION_MODULES: ModuleDef[] = PERMISSION_CATALOG.map((m) => ({
  module: m.module,
  label: m.label,
  actions: m.actions,
}));

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOG.map((m) => [m.module, m.label])
);

/** Role slugs (exactly six system roles). */
export const ROLE_SLUGS = {
  superAdmin: 'super_admin',
  admin: 'admin',
  teacher: 'teacher',
  student: 'student',
  accountant: 'accountant',
  receptionist: 'receptionist',
} as const;

export const FULL_ACCESS: Record<string, string[]> = Object.fromEntries(
  PERMISSION_MODULES.map((m) => [m.module, [...m.actions] as string[]])
);

/** Default permission matrices for development/system roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  [ROLE_SLUGS.superAdmin]: FULL_ACCESS,
  [ROLE_SLUGS.admin]: FULL_ACCESS,


  [ROLE_SLUGS.teacher]: {
    dashboard: ['view'],
    studentAttendance: ['view', 'create', 'edit', 'export'],
    notices: ['view'],
  },

  [ROLE_SLUGS.student]: {
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

  [ROLE_SLUGS.accountant]: {
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

  [ROLE_SLUGS.receptionist]: {
    dashboard: ['view'],
    students: ['view', 'create', 'edit'],
    studentAttendance: ['view', 'create', 'edit'],
    teacherAttendance: ['view', 'create', 'edit'],
    nonTeachingAttendance: ['view', 'create', 'edit'],
    timetables: ['view'],
    leaveRequests: ['view', 'create', 'approve'],
    notices: ['view'],
  },
};

/** Map a loose permissions object to the compact stored format. */
export function normalizePermissions(perms: Record<string, string[]>): { module: string; actions: string[] }[] {
  const entries: { module: string; actions: string[] }[] = [];
  for (const def of PERMISSION_MODULES) {
    const actions = (perms[def.module] ?? []).filter((a) =>
      (def.actions as string[]).includes(a)
    );
    if (actions.length) entries.push({ module: def.module, actions });
  }
  return entries;
}
