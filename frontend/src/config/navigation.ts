import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCog,
  CalendarRange,
  School,
  Layers,
  BookOpen,
  ClipboardCheck,
  CalendarClock,
  FileSpreadsheet,
  PenLine,
  Award,
  Wallet,
  Receipt,
  Banknote,
  HandCoins,
  BarChart3,
  BookMarked,
  Megaphone,
  Bell,
  CalendarOff,
  ShieldCheck,
  ScrollText,
  Settings,
  Search,
  TrendingUp,
  CreditCard,
  Database,
  History,
  ArrowUpDown,
  AlertCircle,
  Briefcase,
  CircleDollarSign,
  type LucideIcon,
} from 'lucide-react';
import type { AuthUser } from '@/context/AuthContext';
import { hasSchoolPermission, isPlatformUser } from '@/lib/permissions';

export function visibleNavigation(user: AuthUser | null) {
  if (!user || isPlatformUser(user)) return [];
  return NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items
      .filter(item => item.perm && hasSchoolPermission(user, item.perm.module, item.perm.action))
      .map(item => {
        // Resolve smart destination: if the item declares a fallbackTo, check whether
        // the user holds the primary permission (fallbackTo.primaryPerm). If not, use
        // the fallback route instead. This keeps the label and active-state unchanged.
        let resolvedTo = item.to;
        if (item.fallbackTo) {
          const hasPrimary = hasSchoolPermission(user, item.fallbackTo.primaryPerm, 'view');
          resolvedTo = hasPrimary ? item.to : item.fallbackTo.to;
        }

        if (!item.subItems) return { ...item, to: resolvedTo };
        return {
          ...item,
          to: resolvedTo,
          subItems: item.subItems
            .filter(sub => sub.perm && hasSchoolPermission(user, sub.perm.module, sub.perm.action))
            .map(sub => {
              let subResolvedTo = sub.to;
              if (sub.fallbackTo) {
                const hasPrimary = hasSchoolPermission(user, sub.fallbackTo.primaryPerm, 'view');
                subResolvedTo = hasPrimary ? sub.to : sub.fallbackTo.to;
              }
              return { ...sub, to: subResolvedTo };
            }),
        };
      })
  })).filter(section => section.items.length > 0);
}

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Required permission to see the item (module + action, defaults to 'view'). */
  perm?: { module: string | string[]; action?: string };
  subItems?: Omit<NavItem, 'icon' | 'subItems'>[];
  /**
   * Optional smart-destination fallback.
   * When present, `visibleNavigation` will navigate to `to` if the user has
   * `primaryPerm`, otherwise it navigates to `fallbackTo.to`.
   * The item is still shown (and active-state works for both routes) as long as
   * the item-level `perm` is satisfied.
   */
  fallbackTo?: { primaryPerm: string; to: string };
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for the sidebar navigation.
 * Items are filtered against the signed-in user's permissions.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, perm: { module: 'dashboard' } }],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Students', to: '/students', icon: Users, perm: { module: 'students' } },
      { label: 'Teachers', to: '/teachers', icon: GraduationCap, perm: { module: 'teachers' } },
      { label: 'Staff', to: '/staff', icon: Briefcase, perm: { module: 'users' } },
      { label: 'Daily Attendance', to: '/daily-attendance', icon: ClipboardCheck, perm: { module: ['studentAttendance', 'teacherAttendance'] } },
    ],
  },
  {
    label: 'Finance & Fees',
    items: [
      { 
        label: 'Finance Hub', 
        to: '/finance', 
        icon: TrendingUp, 
        perm: { module: ['fees', 'expenses', 'salaries', 'reports'] },
        subItems: [
          { label: 'Fees & Billing', to: '/fees', perm: { module: 'fees' } },
          { label: 'Payroll & Salaries', to: '/salaries', perm: { module: 'salaries' } },
          { label: 'Expenses & Income', to: '/expenses', perm: { module: 'expenses' } },
          { label: 'Finance Reports', to: '/finance-reports', perm: { module: 'reports' } },
        ]
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        label: 'Academic Sessions',
        to: '/sessions',
        icon: CalendarRange,
        perm: { module: 'academicSessions' },
      },
      {
        label: 'Classes & Roster',
        to: '/classes',
        icon: School,
        perm: { module: 'classes' },
        subItems: [
          { label: 'Sections', to: '/sections', perm: { module: 'sections' } },
          { label: 'Subjects', to: '/subjects', perm: { module: 'subjects' } },
          { label: 'Student Promotion', to: '/promotions', perm: { module: 'students', action: 'edit' } },
          { label: 'Timetable', to: '/timetable', perm: { module: 'timetables' } },
        ]
      },
    ],
  },
  {
    label: '',
    items: [
      {
        label: 'Exam Management',
        to: '/exams',
        icon: FileSpreadsheet,
        perm: { module: 'exams' },
        subItems: [
          { label: 'Exams', to: '/exams', perm: { module: 'exams' } },
          { label: 'Schedule', to: '/exams/schedule', perm: { module: 'exams' } },
          { label: 'Roll Numbers & Admit Cards', to: '/exams/admit-cards', perm: { module: 'admitCards' } },
          { label: 'Seating Plan', to: '/exams/seating-plan', perm: { module: 'admitCards' } },
          { label: 'Exam Attendance', to: '/exams/attendance', perm: { module: 'examAttendance' } },
          { label: 'Marks', to: '/exams/marks', perm: { module: 'marks' } },
          { label: 'Results', to: '/exams/results', perm: { module: 'results' } },
          { label: 'Exam Fees', to: '/exams/fees', perm: { module: 'examFees' } },
          { label: 'Exam Reports', to: '/exams/reports', perm: { module: 'reports' } },
        ]
      }
    ],
  },
  {
    label: 'Data Management',
    items: [
      { label: 'Data Exports', to: '/data-management', icon: ArrowUpDown, perm: { module: 'dataManagement' } },
    ],
  },
  {
    label: 'Communication',
    items: [

      { label: 'Notices', to: '/notices', icon: Megaphone, perm: { module: 'notices' } },
    ],
  },
  {
    label: 'System & Reports',
    items: [
      { label: 'Reports', to: '/reports', icon: BarChart3, perm: { module: 'reports' } },
      { label: 'Staff & Users', to: '/users', icon: UserCog, perm: { module: 'users' } },
      { label: 'Roles & Permissions', to: '/permissions', icon: ShieldCheck, perm: { module: 'roles' } },
      { label: 'School Settings', to: '/settings', icon: Settings, perm: { module: 'schoolSettings' } },
      { label: 'Billing & Subscription', to: '/billing', icon: CreditCard, perm: { module: 'schoolSettings' } },
    ],
  },
];
