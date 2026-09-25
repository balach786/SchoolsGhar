import { RevealCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Loader2, Users, Wallet, CalendarDays, Layers, GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, getAccessToken, API_BASE_URL } from '@/lib/api';
import { formatCurrency, formatDate, getSchoolCurrentMonthISO } from '@/lib/format';

interface ExamReportRow {
  exam: string;
  className: string;
  examDate: string | null;
  students: number;
  avgPercentage: number | null;
  passRate: number | null;
}
interface AttendanceReportRow {
  className: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  percentage: number;
}
interface SessionReportRow {
  session: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  classes: number;
  students: number;
  payments: number;
  collectionAmount: number;
}
interface TeacherWorkloadRow {
  teacherId: string;
  fullName: string;
  employeeId: string;
  classesAssigned: number;
  subjectsAssigned: number;
  attendanceThisMonth: number | null;
}

interface ReportResponse<T> {
  success: boolean;
  data: { rows: T[]; count: number; month?: string };
}

/** Download a CSV report (authenticated GET with ?format=csv) and trigger a browser download. */
async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  const base = API_BASE_URL ? `${API_BASE_URL}/api` : '/api';
  const token = getAccessToken();
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error(`Export failed (${res.status})`);
    return;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Report downloaded');
}

export function ReportsPage() {
  const [tab, setTab] = useState('exams');
  const [loading, setLoading] = useState(true);

  // Exams
  const [examRows, setExamRows] = useState<ExamReportRow[]>([]);
  // Attendance
  const [attMonth, setAttMonth] = useState(() => getSchoolCurrentMonthISO());
  const [attRows, setAttRows] = useState<AttendanceReportRow[]>([]);
  // Sessions
  const [sessionRows, setSessionRows] = useState<SessionReportRow[]>([]);
  // Teachers
  const [teacherRows, setTeacherRows] = useState<TeacherWorkloadRow[]>([]);

  const loadExams = useCallback(async () => {
    try {
      const res = await api.get<ReportResponse<ExamReportRow>>('/reports/exams');
      setExamRows(res.data.data.rows);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReportResponse<AttendanceReportRow>>(`/reports/attendance?month=${attMonth}`);
      setAttRows(res.data.data.rows);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [attMonth]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReportResponse<SessionReportRow>>('/reports/session-overview');
      setSessionRows(res.data.data.rows);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReportResponse<TeacherWorkloadRow>>('/reports/teacher-workload');
      setTeacherRows(res.data.data.rows);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
    loadAttendance();
    loadSessions();
    loadTeachers();
  }, [loadExams, loadAttendance, loadSessions, loadTeachers]);

  const examColumns: Column<ExamReportRow>[] = [
    { key: 'exam', header: 'Exam', cell: (row) => <span className="text-sm font-medium">{row.exam}</span> },
    { key: 'class', header: 'Class', cell: (row) => <span className="text-sm">{row.className}</span> },
    { key: 'date', header: 'Date', cell: (row) => <span className="text-sm">{row.examDate ? formatDate(row.examDate) : '—'}</span> },
    { key: 'students', header: 'Students', cell: (row) => <span className="text-sm">{row.students}</span> },
    {
      key: 'avg',
      header: 'Average %',
      cell: (row) => <span className="text-sm">{row.avgPercentage !== null ? `${row.avgPercentage.toFixed(1)}%` : '—'}</span>,
    },
    {
      key: 'pass',
      header: 'Pass rate',
      cell: (row) => (
        <Badge variant={row.passRate !== null && row.passRate >= 50 ? 'success' : row.passRate !== null ? 'warning' : 'muted'}>
          {row.passRate !== null ? `${row.passRate.toFixed(0)}%` : '—'}
        </Badge>
      ),
    },
  ];

  const attendanceColumns: Column<AttendanceReportRow>[] = [
    { key: 'class', header: 'Class', cell: (row) => <span className="text-sm font-medium">{row.className}</span> },
    { key: 'present', header: 'Present', cell: (row) => <span className="text-sm">{row.present}</span> },
    { key: 'absent', header: 'Absent', cell: (row) => <span className="text-sm">{row.absent}</span> },
    { key: 'late', header: 'Late', cell: (row) => <span className="text-sm">{row.late}</span> },
    { key: 'leave', header: 'Leave', cell: (row) => <span className="text-sm">{row.leave}</span> },
    { key: 'total', header: 'Total', cell: (row) => <span className="text-sm">{row.total}</span> },
    {
      key: 'pct',
      header: 'Present %',
      cell: (row) => (
        <Badge variant={row.percentage >= 85 ? 'success' : row.percentage >= 70 ? 'warning' : 'destructive'}>{row.percentage.toFixed(1)}%</Badge>
      ),
    },
  ];

  const sessionColumns: Column<SessionReportRow>[] = [
    {
      key: 'session',
      header: 'Session',
      cell: (row) => (
        <div className="leading-tight">
          <p className="flex items-center gap-2 text-sm font-medium">
            {row.session}
            {row.isActive && <Badge variant="success">Active</Badge>}
          </p>
          {(row.startDate || row.endDate) && (
            <p className="text-xs text-muted-foreground">
              {row.startDate ? formatDate(row.startDate) : '—'} → {row.endDate ? formatDate(row.endDate) : '—'}
            </p>
          )}
        </div>
      ),
    },
    { key: 'classes', header: 'Classes', cell: (row) => <span className="text-sm">{row.classes}</span> },
    { key: 'students', header: 'Students', cell: (row) => <span className="text-sm">{row.students}</span> },
    { key: 'payments', header: 'Payments', cell: (row) => <span className="text-sm">{row.payments}</span> },
    { key: 'collection', header: 'Collection', cell: (row) => <span className="text-sm font-medium">{formatCurrency(row.collectionAmount)}</span> },
  ];

  const teacherColumns: Column<TeacherWorkloadRow>[] = [
    {
      key: 'teacher',
      header: 'Teacher',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.fullName}</p>
          <p className="text-xs text-muted-foreground">{row.employeeId}</p>
        </div>
      ),
    },
    { key: 'classes', header: 'Classes', cell: (row) => <span className="text-sm">{row.classesAssigned}</span> },
    { key: 'subjects', header: 'Subjects', cell: (row) => <span className="text-sm">{row.subjectsAssigned}</span> },
    {
      key: 'attendance',
      header: 'Attendance (this month)',
      cell: (row) => (
        <Badge variant={row.attendanceThisMonth === null ? 'muted' : row.attendanceThisMonth >= 90 ? 'success' : row.attendanceThisMonth >= 75 ? 'warning' : 'destructive'}>
          {row.attendanceThisMonth !== null ? `${row.attendanceThisMonth.toFixed(1)}%` : 'no records'}
        </Badge>
      ),
    },
  ];

  const totals = useMemo(() => {
    const students = examRows.reduce((acc, r) => acc + r.students, 0);
    const collection = sessionRows.reduce((acc, r) => acc + r.collectionAmount, 0);
    return { exams: examRows.length, students, collection, sessions: sessionRows.length, teachers: teacherRows.length };
  }, [examRows, sessionRows, teacherRows]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="A clear view of exams, attendance, academic sessions and teacher workload."
        crumbs={[{ label: 'Finance' }, { label: 'Reports' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Exam reports" value={totals.exams} icon={BarChart3} tone="primary" />
        <StatCard title="Students across reports" value={totals.students} icon={Users} tone="success" />
        <StatCard title="Academic sessions" value={totals.sessions} icon={CalendarDays} tone="gold" />
        <StatCard title="Fee collected" value={formatCurrency(totals.collection)} icon={Wallet} tone="warning" />
        <StatCard title="Teachers" value={totals.teachers} icon={GraduationCap} tone="navy" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="teachers">Teacher workload</TabsTrigger>
        </TabsList>

        <TabsContent value="exams" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadCsv('/reports/exams?format=csv', 'exams-report.csv')}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <DataTable
            columns={examColumns}
            data={examRows}
            loading={loading && tab === 'exams'}
            rowKey={(r) => `${r.exam}-${r.className}`}
            emptyTitle="No published exams"
            emptyDescription="Exam reports appear once exams are published with marks."
          />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="w-44">
              <Label className="text-xs">Month</Label>
              <Input type="month" value={attMonth} onChange={(e) => setAttMonth(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`/reports/attendance?format=csv&month=${attMonth}`, `attendance-report-${attMonth}.csv`)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <DataTable
            columns={attendanceColumns}
            data={attRows}
            loading={loading && tab === 'attendance'}
            rowKey={(r) => r.className}
            emptyTitle="No attendance records"
            emptyDescription={`No attendance rows found for ${attMonth}.`}
          />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadCsv('/reports/session-overview?format=csv', 'session-overview.csv')}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <DataTable
            columns={sessionColumns}
            data={sessionRows}
            loading={loading && tab === 'sessions'}
            rowKey={(r) => r.session}
            emptyTitle="No sessions"
            emptyDescription="Create an academic session to see its overview."
          />
        </TabsContent>

        <TabsContent value="teachers" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadCsv('/reports/teacher-workload?format=csv', 'teacher-workload.csv')}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <DataTable
            columns={teacherColumns}
            data={teacherRows}
            loading={loading && tab === 'teachers'}
            rowKey={(r) => r.teacherId}
            emptyTitle="No teachers"
            emptyDescription="Teacher workload appears once teachers are created."
          />
        </TabsContent>
      </Tabs>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        Reports reflect your latest school records.
      </p>
    </div>
  );
}
