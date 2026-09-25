import { useEffect, useState } from 'react';
import {
  Users,
  GraduationCap,
  ClipboardCheck,
  Wallet,
  Receipt,
  FileSpreadsheet,
  BookOpen,
  Bell,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Building2,
  CalendarCheck,
  CalendarRange,
  School,
  HandCoins,
  ArrowRight,
  PenLine,
  Award,
  Layers,
  BarChart3,
  CircleDollarSign,
  BookOpenCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiErrorMessage } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { QuickActionGrid, QuickActionItem } from '@/components/dashboard/QuickActionGrid';
import { AttendanceDonut } from '@/components/dashboard/AttendanceDonut';
import { FeeOverviewCard } from '@/components/dashboard/FeeOverviewCard';
import { UpcomingActivity, ActivityItemData } from '@/components/dashboard/UpcomingActivity';
import { DashboardCalendar, CalendarEventItem } from '@/components/dashboard/DashboardCalendar';
import { NoticeBoard, NoticeItem } from '@/components/dashboard/NoticeBoard';
import { DashboardAnalytics } from '@/components/DashboardAnalytics';
import { RevealCard, ScrollReveal, StaggerContainer, StaggerItem } from '@/components/motion';
import { visibleNavigation } from '@/config/navigation';

interface StudentAnalytics {
  role: 'student';
  missingProfile?: boolean;
  attendance: { total: number; present: number; absent: number; late: number; leave: number; percentage: number };
  upcomingFees: { _id: string; title: string; feeType: string; netPayable: number; amountPaid: number; remaining: number; status: string; dueDate: string | null }[];
  pendingAssignments: { _id: string; title: string; subjectName: string | null; dueDate: string | null; maxMarks: number | null }[];
  latestResults: { examName: string; className: string; percentage: number; grade: string; position: string | null }[];
}

interface TeacherAnalytics {
  role: 'teacher';
  missingProfile?: boolean;
  myClasses: { _id: string; name: string }[];
  studentTotal: number;
  myAttendanceToday: string;
  recentAssignments: { _id: string; title: string; className: string; dueDate: string | null }[];
}

interface StaffAnalytics {
  role: 'staff';
  totals: {
    students: number;
    teachers: number;
    classes: number;
    upcomingExams?: number;
    newAdmissionsThisMonth?: number;
  };
  genderSplit: Record<string, number>;
  studentsByClass: { classId: string; className: string; count: number }[];
  attendanceToday: { present: number; absent: number; late: number; leave: number; total: number };
  teacherAttendanceToday: { present: number; absent: number; late?: number; leave: number; total?: number };
  finance: {
    collectionThisMonth: number;
    paymentsThisMonth: number;
    pendingFees: number | { amount: number; count: number };
    pendingFeesAmount?: number;
    partialFees: number | { amount: number; count: number };
    paidFees: number | { amount: number; count: number };
    incomeThisMonth: number;
    expensesThisMonth: number;
    monthlyFeeCollected?: number;
    monthlyFeePending?: number;
    examFeeCollected?: number;
    examFeePending?: number;
    examFeeCollectedThisMonth?: number;
  };
  monthly: { month: string; collection: number; income: number; expenses: number }[];
  classPerformance: { exam: string; class: string; students: number; avgPercentage: number | null; passRate: number | null }[];
  recentNotices: NoticeItem[];
  upcomingActivities?: ActivityItemData[];
  calendarEvents?: CalendarEventItem[];
}

interface SubscriptionStatus {
  tenant: {
    _id: string;
    name: string;
    status: string;
    subscriptionStatus: string;
  };
  status: 'trial' | 'active' | 'expired' | 'suspended';
  daysRemaining: number;
  isExpired: boolean;
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  currentPlan?: { name: string } | null;
}

type Analytics = StudentAnalytics | TeacherAnalytics | StaffAnalytics;

export function DashboardPage() {
  const { user, can, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ success: boolean; data: { schoolName?: string } }>('/school-settings')
      .then((res) => {
        if (mounted && res.data?.data?.schoolName) {
          setSchoolName(res.data.data.schoolName);
        }
      })
      .catch(() => { });
    return () => {
      mounted = false;
    };
  }, []);

  const sections = visibleNavigation(user);
  const hasNoModules = !can('dashboard', 'view') && sections.length === 0;

  useEffect(() => {
    let cancelled = false;

    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        const promises: Promise<any>[] = [api.get<{ success: boolean; data: Analytics }>('/dashboard/analytics')];

        if (user && !user.isPlatformAdmin) {
          promises.push(api.get<{ success: boolean; data: SubscriptionStatus }>('/subscription/me'));
        }

        const results = await Promise.allSettled(promises);

        if (!cancelled) {
          if (results[0].status === 'fulfilled' && results[0].value.data?.success) {
            setAnalytics(results[0].value.data.data);
          } else if (results[0].status === 'rejected') {
            setLoadError(true);
            toast.error(apiErrorMessage(results[0].reason, 'Could not load analytics'));
          }

          if (results[1] && results[1].status === 'fulfilled' && results[1].value.data?.success) {
            setSubStatus(results[1].value.data.data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Dashboard fetch error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboard();

    return () => {
      cancelled = true;
    };
  }, [user, retry]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Build permission-aware quick actions
  const getQuickActions = (): QuickActionItem[] => {
    if (!user) return [];

    const actions: QuickActionItem[] = [
      { id: 'att-mark', label: 'Take Attendance', subtitle: 'Daily roll-call', icon: ClipboardCheck, to: '/attendance', permission: can('studentAttendance', 'create') || can('studentAttendance', 'edit'), color: 'navy' },
      { id: 'att-view', label: 'My Attendance', subtitle: 'View record', icon: ClipboardCheck, to: '/attendance', permission: can('studentAttendance', 'view') && !can('studentAttendance', 'create') && !can('studentAttendance', 'edit'), color: 'navy' },
      
      { id: 'add-student', label: 'Add Student', subtitle: 'New enrollment', icon: Users, to: '/students', permission: can('students', 'create'), color: 'navy' },
      { id: 'search-stu', label: 'Student Directory', subtitle: 'Search records', icon: School, to: '/students', permission: can('students', 'view') && !can('students', 'create'), color: 'amber' },
      
      { id: 'add-teacher', label: 'Add Teacher', subtitle: 'Faculty onboarding', icon: GraduationCap, to: '/teachers', permission: can('teachers', 'create'), color: 'amber' },
      
      { id: 'monthly-fee', label: 'Collect Monthly Fee', subtitle: 'Tuition receipts', icon: Wallet, to: '/fees/collect', permission: can('fees', 'create') || can('payments', 'create'), color: 'amber' },
      { id: 'pay-fees', label: 'Pay Fees', subtitle: 'Pending dues', icon: Wallet, to: '/fees', permission: can('fees', 'view') && !can('fees', 'create') && !can('payments', 'create'), color: 'amber' },
      
      { id: 'exam-fee', label: 'Collect Exam Fee', subtitle: 'Term examination', icon: Receipt, to: '/exams/fees', permission: can('examFees', 'create'), color: 'navy' },
      
      { id: 'create-exam', label: 'Create Exam', subtitle: 'Tests & schedules', icon: FileSpreadsheet, to: '/exams', permission: can('exams', 'create'), color: 'amber' },
      { id: 'my-exams', label: 'Exams', subtitle: 'Schedules', icon: FileSpreadsheet, to: '/exams', permission: can('exams', 'view') && !can('exams', 'create'), color: 'amber' },
      
      { id: 'add-expense', label: 'Add Expense', subtitle: 'Campus spend', icon: CircleDollarSign, to: '/expenses', permission: can('expenses', 'create'), color: 'navy' },
      { id: 'pending-fees', label: 'Pending Fees', subtitle: 'Balances', icon: Wallet, to: '/fees/pending', permission: can('fees', 'view') && can('reports', 'view'), color: 'navy' },
      { id: 'receipts', label: 'Print Receipt', subtitle: 'Fee records', icon: Receipt, to: '/fees/receipts', permission: can('payments', 'view'), color: 'navy' },
      
      { id: 'create-notice', label: 'Create Notice', subtitle: 'School circulars', icon: Bell, to: '/notices', permission: can('notices', 'create'), color: 'amber' },
      { id: 'staff-att', label: 'Staff Attendance', subtitle: 'Faculty check-in', icon: ClipboardCheck, to: '/teacher-attendance', permission: can('teacherAttendance', 'create'), color: 'navy' },
      
      { id: 'assignment-create', label: 'Add Assignment', subtitle: 'Homework syllabus', icon: BookOpenCheck, to: '/assignments', permission: can('assignments', 'create'), color: 'amber' },
      { id: 'assignment-view', label: 'Assignments', subtitle: 'View pending', icon: BookOpenCheck, to: '/assignments', permission: can('assignments', 'view') && !can('assignments', 'create'), color: 'amber' },
      
      { id: 'marks', label: 'Enter Marks', subtitle: 'Exam scoring', icon: PenLine, to: '/exams/marks', permission: can('marks', 'create') || can('marks', 'edit'), color: 'navy' },
      { id: 'results', label: 'View Results', subtitle: 'Marks & rankings', icon: Award, to: '/exams/results', permission: can('results', 'view'), color: 'navy' },
      
      { id: 'reports', label: 'Generate Report', subtitle: 'Audit & analytics', icon: BarChart3, to: '/reports', permission: can('reports', 'view'), color: 'amber' },
    ];

    // Filter by permission
    const permittedActions = actions.filter(a => a.permission !== false);

    if (user?.dashboardOrder && user.dashboardOrder.length > 0) {
      const ordered: QuickActionItem[] = [];
      const permittedMap = new Map(permittedActions.map(a => [a.id, a]));
      
      // Add items from saved order that still exist and are permitted
      for (const id of user.dashboardOrder) {
        if (permittedMap.has(id)) {
          ordered.push(permittedMap.get(id)!);
          permittedMap.delete(id);
        }
      }
      
      // Append any remaining permitted items not in the saved order
      for (const action of permittedMap.values()) {
        ordered.push(action);
      }
      
      return ordered;
    }

    return permittedActions;
  };

  const handleReorder = async (newOrder: string[]) => {
    try {
      await api.patch('/auth/me/preferences', { dashboardOrder: newOrder });
      await refreshUser();
    } catch (err) {
      toast.error('Failed to save dashboard layout');
    }
  };

  const isStaff = analytics?.role === 'staff';
  const staffData = isStaff ? (analytics as StaffAnalytics) : null;
  const isNewSchool =
    isStaff &&
    can('academicSessions', 'create') &&
    can('classes', 'create') &&
    can('students', 'create') &&
    staffData?.totals.students === 0 &&
    staffData?.totals.classes === 0;

  const pendingFeesAmount = staffData
    ? staffData.finance.pendingFeesAmount !== undefined
      ? staffData.finance.pendingFeesAmount
      : typeof staffData.finance.pendingFees === 'number'
        ? 0
        : staffData.finance.pendingFees?.amount ?? 0
    : 0;

  if (hasNoModules) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">No modules assigned</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          No modules have been assigned to your account. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Welcome Header ── */}
      {user && (
        <ScrollReveal
          viewport={{ once: true, amount: 'some' }}
          className="flex flex-col gap-4 rounded-3xl border border-blue-400/30 bg-gradient-to-r from-[#1E3A8A] via-[#1e40af] to-[#2563eb] p-5 sm:p-6 shadow-lg text-white sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm shadow-sm border border-white/25">
                <Building2 className="h-5 w-5 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
                  {getGreeting()}, {schoolName || user.name}
                </h1>
                <p className="text-xs sm:text-sm text-blue-100/90 font-medium mt-0.5">
                  Here’s what’s happening in your school today.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {subStatus && ['super_admin', 'admin'].includes(user.role) && (
              <Link to="/billing">
                {subStatus.status === 'trial' && (
                  <Badge className="bg-white/20 text-white border-white/30 px-3.5 py-1.5 text-xs font-bold hover:bg-white/30 transition-colors flex items-center gap-1.5 cursor-pointer backdrop-blur-sm shadow-xs">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    Trial Active · {subStatus.daysRemaining} days remaining
                  </Badge>
                )}
                {subStatus.status === 'active' && (
                  <Badge className="bg-emerald-500/25 text-emerald-200 border-emerald-400/40 px-3.5 py-1.5 text-xs font-bold hover:bg-emerald-500/35 transition-colors flex items-center gap-1.5 cursor-pointer backdrop-blur-sm shadow-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    {subStatus.currentPlan?.name || 'Pro Plan'} · Active
                  </Badge>
                )}
                {subStatus.isExpired && (
                  <Badge variant="destructive" className="px-3.5 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs">
                    <AlertCircle className="w-4 h-4" />
                    Subscription Expired · Renew
                  </Badge>
                )}
              </Link>
            )}
          </div>
        </ScrollReveal>
      )}

      {/* ── Top Quick-Action Grid ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </p>
        </div>
        <QuickActionGrid actions={getQuickActions()} onReorder={handleReorder} />
      </div>

      {/* ── Brand-New School Empty State Guide ── */}
      {isNewSchool && (
        <ScrollReveal viewport={{ once: true, amount: 'some' }}>
          <RevealCard className="rounded-3xl border-primary/30 bg-gradient-to-b from-primary/5 to-transparent p-6 sm:p-8">
            <div className="max-w-3xl space-y-2 mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-xs font-semibold text-primary">
                <Sparkles className="w-3.5 h-3.5" /> New School Workspace
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Welcome to Your School Management Portal
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Follow these simple steps to set up your academic session, define classes, and start enrolling students.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link to="/sessions" className="group">
                <div className="p-4 rounded-2xl border border-border/80 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm hover:border-primary/50 hover:shadow-md transition-all space-y-2 h-full flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded-lg bg-primary/10 text-primary">
                      Step 1
                    </span>
                    <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
                      Academic Session
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Define current session to activate admissions.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs mt-3 rounded-xl">
                    Create Session
                  </Button>
                </div>
              </Link>

              <Link to="/classes" className="group">
                <div className="p-4 rounded-2xl border border-border/80 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm hover:border-primary/50 hover:shadow-md transition-all space-y-2 h-full flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded-lg bg-primary/10 text-primary">
                      Step 2
                    </span>
                    <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
                      Create First Class
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Add grade levels (e.g. Class 1–10) and sections.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs mt-3 rounded-xl">
                    Add Classes
                  </Button>
                </div>
              </Link>

              <Link to="/teachers" className="group">
                <div className="p-4 rounded-2xl border border-border/80 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm hover:border-primary/50 hover:shadow-md transition-all space-y-2 h-full flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded-lg bg-primary/10 text-primary">
                      Step 3
                    </span>
                    <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
                      Faculty Members
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Register teachers and assign subjects.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs mt-3 rounded-xl">
                    Add Teachers
                  </Button>
                </div>
              </Link>

              <Link to="/students" className="group">
                <div className="p-4 rounded-2xl border border-border/80 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm hover:border-primary/50 hover:shadow-md transition-all space-y-2 h-full flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded-lg bg-primary/10 text-primary">
                      Step 4
                    </span>
                    <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
                      Add First Student
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Enroll students with automated roll & admission IDs.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full text-xs mt-3 rounded-xl">
                    Enroll Student
                  </Button>
                </div>
              </Link>
            </div>
          </RevealCard>
        </ScrollReveal>
      )}

      {/* ── Primary Statistics Row (Staff / Admin) ── */}
      {isStaff && (
        <StaggerContainer className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {can('classes', 'view') && (
            <StaggerItem>
              <StatCard
                title="TOTAL CLASSES"
                value={loading ? null : staffData?.totals.classes ?? 0}
                icon={School}
                loading={loading}
                description={loading ? '' : 'Active grade levels'}
                onClick={() => navigate('/classes')}
              />
            </StaggerItem>
          )}

          {can('students', 'view') && (
            <StaggerItem>
              <StatCard
                title="TOTAL STUDENTS"
                value={loading ? null : staffData?.totals.students ?? 0}
                icon={Users}
                loading={loading}
                description={loading ? '' : `${staffData?.genderSplit.male ?? 0} M · ${staffData?.genderSplit.female ?? 0} F`}
                onClick={() => navigate('/students')}
              />
            </StaggerItem>
          )}

          {can('teachers', 'view') && (
            <StaggerItem>
              <StatCard
                title="TOTAL TEACHERS"
                value={loading ? null : staffData?.totals.teachers ?? 0}
                icon={GraduationCap}
                loading={loading}
                description={loading ? '' : 'Teaching faculty'}
                onClick={() => navigate('/teachers')}
              />
            </StaggerItem>
          )}

          {can('studentAttendance', 'view') && (
            <StaggerItem>
              <StatCard
                title="PRESENT TODAY"
                value={
                  loading
                    ? null
                    : !staffData?.attendanceToday || staffData.attendanceToday.total === 0
                      ? 'Not marked yet'
                      : staffData.attendanceToday.present
                }
                icon={ClipboardCheck}
                loading={loading}
                tone={staffData?.attendanceToday && staffData.attendanceToday.total > 0 ? 'success' : 'default'}
                description={
                  loading
                    ? ''
                    : !staffData?.attendanceToday || staffData.attendanceToday.total === 0
                      ? 'Roll call pending'
                      : `${Math.round((staffData.attendanceToday.present / staffData.attendanceToday.total) * 100)}% attendance rate`
                }
                onClick={() => navigate('/attendance')}
              />
            </StaggerItem>
          )}

          {can('fees', 'view') && (
            <StaggerItem>
              <StatCard
                title="PENDING FEES"
                value={loading ? null : formatCurrency(pendingFeesAmount)}
                icon={Wallet}
                loading={loading}
                tone="warning"
                description={loading ? '' : 'Outstanding balances'}
                onClick={() => navigate('/fees/pending')}
              />
            </StaggerItem>
          )}

          {can('exams', 'view') && (
            <StaggerItem>
              <StatCard
                title="UPCOMING EXAMS"
                value={loading ? null : staffData?.totals.upcomingExams ?? 0}
                icon={FileSpreadsheet}
                loading={loading}
                description={loading ? '' : 'Scheduled tests'}
                onClick={() => navigate('/exams')}
              />
            </StaggerItem>
          )}
        </StaggerContainer>
      )}

      {/* ── Main Dashboard Lower Section (Structured Grid) ── */}
      {isStaff && staffData && (
        <div className="space-y-6">
          {/* Row 1: Attendance Donut | Fee Collection Overview | Upcoming Activity */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {can('studentAttendance', 'view') && (
              <AttendanceDonut
                attendance={staffData.attendanceToday}
                canTakeAttendance={can('studentAttendance', 'create')}
                className="h-full"
              />
            )}

            {can('fees', 'view') && (
              <FeeOverviewCard
                monthlyCollected={staffData.finance.collectionThisMonth}
                monthlyPending={pendingFeesAmount}
                examFeeCollected={staffData.finance.examFeeCollected ?? 0}
                examFeePending={staffData.finance.examFeePending ?? 0}
                examFeeThisMonth={staffData.finance.examFeeCollectedThisMonth ?? 0}
                className="h-full"
              />
            )}

            <UpcomingActivity
              activities={staffData.upcomingActivities || []}
              className="h-full"
            />
          </div>

          {/* Row 2: School Calendar | Notice Board */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DashboardCalendar
              events={staffData.calendarEvents || []}
              className="h-full"
            />

            <NoticeBoard
              notices={staffData.recentNotices || []}
              canCreateNotice={can('notices', 'create')}
              className="h-full"
            />
          </div>

          {/* Collapsible Analytics & Academic Performance */}
          <DashboardAnalytics attendance={staffData.attendanceToday} monthly={staffData.monthly} />
        </div>
      )}

      {/* ── Teacher Portal Section ── */}
      {analytics?.role === 'teacher' && (
        <div className="space-y-6">
          {analytics.missingProfile && (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 p-5 flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-warning-foreground text-sm">Profile Not Linked</h4>
                <p className="text-xs text-muted-foreground mt-1">Your account is not linked to a Teacher profile. Please contact the administrator to assign you to a faculty record.</p>
              </div>
            </div>
          )}
          <StaggerContainer className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {can('classes', 'view') && (
              <StaggerItem>
                <StatCard
                  title="MY CLASSES"
                  value={loading ? null : (analytics.myClasses?.length ?? 0)}
                  icon={School}
                  loading={loading}
                  description={analytics.myClasses?.map((c: any) => c.name).join(', ') || 'No classes assigned'}
                  onClick={() => navigate('/classes')}
                />
              </StaggerItem>
            )}
            {can('students', 'view') && (
              <StaggerItem>
                <StatCard
                  title="MY STUDENTS"
                  value={loading ? null : (analytics.studentTotal ?? 0)}
                  icon={Users}
                  loading={loading}
                  description="Across assigned sections"
                  onClick={() => navigate('/students')}
                />
              </StaggerItem>
            )}
            <StaggerItem>
              <StatCard
                title="MY ATTENDANCE TODAY"
                value={loading ? null : analytics.myAttendanceToday === 'none' ? 'Not marked' : analytics.myAttendanceToday}
                icon={CalendarCheck}
                loading={loading}
                tone={analytics.myAttendanceToday === 'present' ? 'success' : 'default'}
                description="Staff check-in status"
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                title="RECENT ASSIGNMENTS"
                value={loading ? null : analytics.recentAssignments.length}
                icon={BookOpenCheck}
                loading={loading}
                description="Posted homework"
                onClick={() => navigate('/assignments')}
              />
            </StaggerItem>
          </StaggerContainer>

          <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold text-foreground">Recent Class Assignments</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">Homework assignments across your assigned classes</CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {analytics.recentAssignments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4">No assignments assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {analytics.recentAssignments.map((a) => (
                    <div key={a._id} className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{a.title}</p>
                        <p className="text-[11px] text-muted-foreground">{a.className}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {a.dueDate ? `Due ${formatDate(a.dueDate)}` : 'No due date'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Student Portal Section ── */}
      {analytics?.role === 'student' && (
        <div className="space-y-6">
          {analytics.missingProfile && (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 p-5 flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-warning-foreground text-sm">Profile Not Linked</h4>
                <p className="text-xs text-muted-foreground mt-1">Your account is not linked to a Student profile. Please contact the administrator to assign you to a student record.</p>
              </div>
            </div>
          )}
          <StaggerContainer className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <StatCard
                title="ATTENDANCE"
                value={loading ? null : `${analytics.attendance.percentage}%`}
                icon={CalendarCheck}
                loading={loading}
                tone="success"
                description={`${analytics.attendance.present} present of ${analytics.attendance.total} days`}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                title="PENDING FEES"
                value={loading ? null : formatCurrency(analytics.upcomingFees.reduce((a, f) => a + f.remaining, 0))}
                icon={Wallet}
                loading={loading}
                tone="warning"
                description={`${analytics.upcomingFees.filter((f) => f.status === 'overdue').length} overdue bills`}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                title="PENDING ASSIGNMENTS"
                value={loading ? null : analytics.pendingAssignments.length}
                icon={BookOpenCheck}
                loading={loading}
                description="Waiting for submission"
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                title="LATEST RESULT"
                value={loading ? null : analytics.latestResults[0] ? `${analytics.latestResults[0].percentage}%` : '—'}
                icon={Award}
                loading={loading}
                description={analytics.latestResults[0]?.examName ?? 'No results published'}
              />
            </StaggerItem>
          </StaggerContainer>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-bold text-foreground">Upcoming Fees & Dues</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Tuition and exam fees payable</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2">
                {analytics.upcomingFees.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">No outstanding fees found. All clear!</p>
                ) : (
                  analytics.upcomingFees.slice(0, 5).map((f) => (
                    <div key={f._id} className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{f.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.feeType.replace(/_/g, ' ')} {f.dueDate ? `· Due ${formatDate(f.dueDate)}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">{formatCurrency(f.remaining)}</p>
                        <Badge variant={f.status === 'overdue' ? 'destructive' : 'warning'} className="text-[10px]">
                          {f.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-bold text-foreground">Recent Examination Results</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Scores and grades from published exams</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2">
                {analytics.latestResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">No published exam results yet.</p>
                ) : (
                  analytics.latestResults.slice(0, 5).map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{r.examName}</p>
                        <p className="text-[11px] text-muted-foreground">{r.className}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">{r.percentage}%</p>
                        <Badge variant="success" className="text-[10px]">Grade {r.grade}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div role="alert" className="rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="font-semibold text-foreground">We couldn’t load your school overview.</p>
          <p className="my-2 text-xs text-muted-foreground">Please check your network and try again.</p>
          <Button variant="outline" size="sm" className="rounded-xl mt-2" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
