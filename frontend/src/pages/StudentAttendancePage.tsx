import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Download, Filter, Users, Calendar, TrendingUp, Sparkles, GraduationCap, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDate, todayISO, getSchoolCurrentMonthISO, formatStudentIdentity } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { SchoolClosureDialog, type SchoolClosureItem } from '@/components/attendance/SchoolClosureDialog';
import { ManualAttendanceRegister, type CalendarDayItem, type RegisterRowItem } from '@/components/attendance/ManualAttendanceRegister';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionLite { _id: string; name: string; classId: string }
interface AttendanceRow {
  _id: string; studentId: string; studentName: string; admissionNumber: string; rollNumber: string;
  sessionId: string; classId: string; className: string; sectionId?: string | null; sectionName?: string;
  attendanceDate: string; status: 'present' | 'absent' | 'late' | 'leave';
  fatherName?: string | null; guardianName?: string | null; gender?: string; caste?: string | null;
}
interface StudentLite { _id: string; fullName: string; admissionNumber: string; rollNumber: string; fatherName?: string | null; guardianName?: string | null; gender?: string; caste?: string | null; }

interface MonthlyStudentRow {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: string;
  className: string;
  sectionName: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  caste?: string | null;
  profilePhotoUrl?: string | null;
  present: number;
  absent: number;
  late: number;
  leave: number;
  officialLeave?: number;
  schoolClosed?: number;
  totalRecorded: number;
  workingDays: number;
  attendanceRate: number;
  dailyMarks?: Record<number, any>;
}

interface MonthlySummaryData {
  month: string;
  daysInMonth: number;
  totalSundays?: number;
  totalOfficialLeaves?: number;
  totalSchoolClosed?: number;
  totalWorkingDays: number;
  netWorkingDays?: number;
  totalStudents: number;
  classAverageRate: number;
  totals: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    officialLeaves?: number;
    schoolClosed?: number;
  };
  calendarDays?: CalendarDayItem[];
  dailyTotals?: Record<number, { present: number; absent: number; late: number; leave: number }>;
  rows: MonthlyStudentRow[];
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'ST';
}

const STATUS_LABEL: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave' };
const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  present: 'success', absent: 'destructive', late: 'warning', leave: 'muted',
};

export function StudentAttendancePage() {
  const { can } = useAuth();
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<AttendanceRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Monthly Auto-Calculation State
  const [monthlyMonth, setMonthlyMonth] = useState(() => getSchoolCurrentMonthISO());
  const [monthlyData, setMonthlyData] = useState<MonthlySummaryData | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [scopeRequiredMessage, setScopeRequiredMessage] = useState<string | null>(null);
  const [monthlySubView, setMonthlySubView] = useState<'register' | 'summary'>('register');
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureInitialDate, setClosureInitialDate] = useState<string | undefined>(undefined);
  const [selectedClosure, setSelectedClosure] = useState<any>(null);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leave: 0, late: 0 });

  const canCreate = can('studentAttendance', 'create');
  const [canEditDaily, setCanEditDaily] = useState(false);
  
  useEffect(() => {
    if (!classFilter || classFilter === 'all') {
      setCanEditDaily(canCreate);
      return;
    }
    const checkDate = viewMode === 'daily' ? (from || todayISO()) : `${monthlyMonth}-01`;
    api.get<{canEdit: boolean}>(`/student-attendance/check-auth?classId=${classFilter}&date=${checkDate}`)
      .then(res => setCanEditDaily(res.data.canEdit))
      .catch(() => setCanEditDaily(false));
  }, [classFilter, viewMode, from, monthlyMonth, canCreate]);
  const canExport = can('studentAttendance', 'export');

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => {
      const list = r.data.data;
      setSessions(list);
      const active = list.find((s) => s.isActive) ?? list[0];
      if (active) setSessionId(active._id);
    }).catch(() => {});
  });

  // Classes for the selected session
  useEffect(() => {
    if (!sessionId) { setClasses([]); return; }
    api.get<ApiListResponse<ClassLite>>(`/classes/lookup?sessionId=${sessionId}`)
      .then((r) => setClasses(r.data.data)).catch(() => {});
  }, [sessionId]);

  // Sections for the selected class (filter list endpoint supports classId)
  useEffect(() => {
    if (!classFilter) { setSections([]); return; }
    api.get<ApiListResponse<SectionLite>>(`/sections/lookup?classId=${classFilter}`)
      .then((r) => setSections(r.data.data)).catch(() => {});
  }, [classFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (classFilter && classFilter !== 'all') params.set('classId', classFilter);
      if (sectionFilter && sectionFilter !== 'all') params.set('sectionId', sectionFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<ApiListResponse<AttendanceRow> & { data: { summary?: any } }>(`/student-attendance?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      setSummary(res.data.summary || { present: 0, absent: 0, leave: 0, late: 0 });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load student attendance'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, classFilter, sectionFilter, from, to, pagination.page, pagination.limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (classFilter && classFilter !== 'all') params.set('classId', classFilter);
      if (sectionFilter && sectionFilter !== 'all') params.set('sectionId', sectionFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/student-attendance/download?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student-attendance.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(apiErrorMessage(err, 'Export failed')); } finally { setExporting(false); }
  };

  const loadMonthly = useCallback(async () => {
    if (!sessionId) return;
    setLoadingMonthly(true);
    try {
      setScopeRequiredMessage(null);
      const params = new URLSearchParams({ sessionId, month: monthlyMonth });
      if (classFilter && classFilter !== 'all') params.set('classId', classFilter);
      if (sectionFilter && sectionFilter !== 'all') params.set('sectionId', sectionFilter);
      const res = await api.get<{ data: MonthlySummaryData }>(`/student-attendance/monthly-summary?${params}`);
      setMonthlyData(res.data.data);
    } catch (err: any) {
      const errCode = err?.response?.data?.error?.code || err?.response?.data?.code;
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message;
      if (errCode === 'MONTHLY_REPORT_SCOPE_REQUIRED') {
        setScopeRequiredMessage(errMsg || 'Please select a class to view the monthly attendance register.');
        setMonthlyData(null);
      } else {
        toast.error(apiErrorMessage(err, 'Failed to load monthly attendance'));
      }
    } finally {
      setLoadingMonthly(false);
    }
  }, [sessionId, classFilter, sectionFilter, monthlyMonth]);

  useEffect(() => {
    if (viewMode === 'monthly') {
      loadMonthly();
    }
  }, [viewMode, loadMonthly]);

  const exportMonthlyCsv = async () => {
    try {
      const params = new URLSearchParams({ sessionId, month: monthlyMonth, format: 'csv' });
      if (classFilter && classFilter !== 'all') params.set('classId', classFilter);
      if (sectionFilter && sectionFilter !== 'all') params.set('sectionId', sectionFilter);
      const res = await api.get(`/student-attendance/monthly-summary?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-monthly-attendance-${monthlyMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Monthly attendance exported');
    } catch (err: any) {
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          toast.error(parsed?.error?.message || parsed?.message || 'Please select a class to export monthly attendance');
          return;
        } catch {
          // ignore
        }
      }
      toast.error(apiErrorMessage(err, 'Export failed'));
    }
  };

  const filteredMonthlyRows = (monthlyData?.rows || []).filter((r) => {
    if (!monthlySearch.trim()) return true;
    const q = monthlySearch.toLowerCase();
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.rollNumber.toLowerCase().includes(q) ||
      r.admissionNumber.toLowerCase().includes(q) ||
      r.sectionName.toLowerCase().includes(q)
    );
  });

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'attendanceDate', header: 'Date',
      cell: (row) => <span className="whitespace-nowrap text-sm">{formatDate(row.attendanceDate)}</span>,
    },
    {
      key: 'student', header: 'Student',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{formatStudentIdentity(row as any)}</p>
          <p className="text-xs text-muted-foreground">{row.admissionNumber}</p>
        </div>
      ),
    },
    {
      key: 'rollNumber', header: 'Roll',
      cell: (row) => <span className="text-sm">{row.rollNumber || '—'}</span>,
    },
    {
      key: 'section', header: 'Class / Section',
      cell: (row) => <span className="text-sm">{row.className}{row.sectionName ? ` · ${row.sectionName}` : ''}</span>,
    },
    {
      key: 'status', header: 'Status',
      cell: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Attendance"
        description="Daily logs and automated monthly attendance calculations."
        crumbs={[{ label: 'Attendance' }, { label: 'Students' }]}
        actions={canCreate ? (
          <Button onClick={() => setMarkOpen(true)} className="gap-1.5 rounded-xl font-semibold">
            <CalendarCheck className="h-4 w-4" /> Mark Daily Attendance
          </Button>
        ) : undefined}
      />

      {/* Tabs: Daily vs Monthly Auto Calculation */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'daily' | 'monthly')} className="w-full">
        <TabsList className="bg-muted/70 p-1 rounded-xl">
          <TabsTrigger value="daily" className="rounded-lg text-xs font-semibold px-4 py-1.5">
            Daily Attendance Log
          </TabsTrigger>
          <TabsTrigger value="monthly" className="rounded-lg text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            Monthly Auto-Calculation
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === 'daily' && (
        <>
          <div className="mb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            {/* Filters on the left */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Filter className="h-4 w-4" /> Filters</div>
              <div className="w-full sm:w-[150px]">
                <Select value={sessionId || undefined} onValueChange={(v) => { setSessionId(v); setClassFilter(''); setSectionFilter(''); setPagination((p) => ({ ...p, page: 1 })); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={classFilter || undefined} onValueChange={(v) => { setClassFilter(v); setSectionFilter(''); setPagination((p) => ({ ...p, page: 1 })); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={sectionFilter || undefined} onValueChange={(v) => { setSectionFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary & Export on the right */}
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm shadow-sm">
                  <span className="font-semibold text-emerald-800">Present</span>
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-900">{summary.present}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm shadow-sm">
                  <span className="font-semibold text-rose-800">Absent</span>
                  <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-900">{summary.absent}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm shadow-sm">
                  <span className="font-semibold text-slate-800">Leave</span>
                  <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-900">{summary.leave}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm shadow-sm">
                  <span className="font-semibold text-amber-800">Late</span>
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">{summary.late}</span>
                </div>
              </div>
              
              {canExport && (
                <Button variant="outline" onClick={exportCsv} disabled={exporting}>
                  <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </Button>
              )}
            </div>
          </div>

          <DataTable columns={columns} data={data} loading={loading} pagination={pagination} rowKey={(r) => r._id}
            onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
            emptyTitle="No attendance records" emptyDescription="Mark attendance for a class to see records here." />
        </>
      )}

      {viewMode === 'monthly' && (
        <div className="space-y-4">
          {/* Monthly Filters */}
          <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-40">
                <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Month</Label>
                <Input
                  type="month"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="w-44">
                <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Session</Label>
                <Select value={sessionId || undefined} onValueChange={(v) => { setSessionId(v); setClassFilter(''); setSectionFilter(''); }}>
                  <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-44">
                <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Class</Label>
                <Select value={classFilter || undefined} onValueChange={(v) => { setClassFilter(v); setSectionFilter(''); }}>
                  <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-40">
                <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Section</Label>
                <Select value={sectionFilter || undefined} onValueChange={setSectionFilter}>
                  <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end">
              {/* Toggle Subview */}
              <div className="p-1 bg-muted rounded-xl flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setMonthlySubView('register')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    monthlySubView === 'register' ? 'bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Manual Register Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setMonthlySubView('summary')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    monthlySubView === 'summary' ? 'bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  KPI Summary List
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setClosureInitialDate(new Date().toISOString().slice(0, 10));
                  setSelectedClosure(null);
                  setClosureOpen(true);
                }}
                className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Declare Holiday / Closed Day
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={loadMonthly}
                disabled={loadingMonthly}
                className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-border/80"
              >
                {loadingMonthly ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                Recalculate
              </Button>
            </div>
          </div>

          {/* Subview 1: Authentic Manual Attendance Register Sheet */}
          {monthlySubView === 'register' && (
            <ManualAttendanceRegister
              title="Student Monthly Attendance Register"
              month={monthlyMonth}
              calendarDays={monthlyData?.calendarDays || []}
              rows={filteredMonthlyRows.map((r) => ({
                id: r.studentId,
                primaryLabel: r.studentName,
                secondaryLabel: `Roll: ${r.rollNumber} · Adm: ${r.admissionNumber}`,
                subLabel: `${r.className}${r.sectionName ? ` · ${r.sectionName}` : ''}`,
                avatarUrl: r.profilePhotoUrl,
                present: r.present,
                absent: r.absent,
                late: r.late,
                leave: r.leave,
                officialLeave: r.officialLeave || 0,
                schoolClosed: r.schoolClosed || 0,
                workingDays: r.workingDays || monthlyData?.netWorkingDays || monthlyData?.totalWorkingDays || 0,
                attendanceRate: r.attendanceRate,
                dailyMarks: r.dailyMarks || {},
              }))}
              dailyTotals={monthlyData?.dailyTotals}
              summaryTotals={monthlyData ? {
                present: monthlyData.totals.present,
                absent: monthlyData.totals.absent,
                late: monthlyData.totals.late,
                leave: monthlyData.totals.leave,
                officialLeaves: monthlyData.totalOfficialLeaves || monthlyData.totals.officialLeaves || 0,
                schoolClosed: monthlyData.totalSchoolClosed || monthlyData.totals.schoolClosed || 0,
                netWorkingDays: monthlyData.netWorkingDays || monthlyData.totalWorkingDays || 0,
              } : undefined}
              loading={loadingMonthly}
              emptyMessage={scopeRequiredMessage || undefined}
              onOpenClosureDialog={(dateStr, closure) => {
                setClosureInitialDate(dateStr || new Date().toISOString().slice(0, 10));
                setSelectedClosure(closure || null);
                setClosureOpen(true);
              }}
              onExportCsv={exportMonthlyCsv}
            />
          )}

          {/* Subview 2: KPI Summary Cards & Student Breakdown Table */}
          {monthlySubView === 'summary' && (
            <>
              {/* Monthly KPI Stats Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 text-[#1E3A8A] flex items-center justify-center border border-blue-200/60 shrink-0">
                    <Users className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Students</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{monthlyData?.totalStudents ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Enrolled in roster</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center border border-amber-200/60 shrink-0">
                    <Calendar className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Net Working Days</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{monthlyData?.netWorkingDays ?? monthlyData?.totalWorkingDays ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Sundays & Holidays excluded
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shrink-0">
                    <TrendingUp className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Class Attendance Rate</p>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">{monthlyData?.classAverageRate ?? 0}%</p>
                    <p className="text-[10px] text-muted-foreground">Auto-calculated avg</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/60 shrink-0">
                    <XCircle className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Total Absent Days</p>
                    <p className="text-xl font-bold text-rose-600 mt-0.5">{monthlyData?.totals.absent ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Logged across class</p>
                  </div>
                </div>
              </div>

              {/* Search bar inside Monthly View */}
              <div className="flex items-center justify-between gap-3">
                <Input
                  placeholder="Search by student name, roll number, or admission ID…"
                  value={monthlySearch}
                  onChange={(e) => setMonthlySearch(e.target.value)}
                  className="max-w-md h-9 text-xs rounded-xl"
                />
                <span className="text-xs text-muted-foreground">
                  Showing {filteredMonthlyRows.length} students
                </span>
              </div>

              {/* Monthly Summary Table */}
              <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs overflow-hidden">
                {loadingMonthly ? (
                  <div className="p-12 text-center">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Calculating monthly attendance from daily registers…</p>
                  </div>
                ) : filteredMonthlyRows.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">
                      {scopeRequiredMessage ? 'Class Selection Required' : 'No students found'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {scopeRequiredMessage || `Select a session and class, or ensure students have attendance marked for ${monthlyMonth}.`}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                          <th className="px-4 py-3 w-12 text-center">#</th>
                          <th className="px-4 py-3">Student</th>
                          <th className="px-4 py-3">Class / Section</th>
                          <th className="px-4 py-3 text-center">Present</th>
                          <th className="px-4 py-3 text-center">Absent</th>
                          <th className="px-4 py-3 text-center">Late</th>
                          <th className="px-4 py-3 text-center">Leave</th>
                          <th className="px-4 py-3 text-center">Holidays / Closed</th>
                          <th className="px-4 py-3 text-center">Net Working Days</th>
                          <th className="px-4 py-3 w-48 text-center">Monthly Attendance Rate</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredMonthlyRows.map((r, idx) => {
                          const rate = r.attendanceRate;
                          const isHigh = rate >= 90;
                          const isMid = rate >= 75 && rate < 90;

                          return (
                            <tr key={r.studentId} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-7 w-7 border border-border/80">
                                    <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                      {initials(r.studentName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-semibold text-foreground">{formatStudentIdentity(r as any)}</p>
                                    <p className="text-[10px] text-muted-foreground">Roll: {r.rollNumber} · Adm: {r.admissionNumber}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-medium text-muted-foreground">
                                {r.className} {r.sectionName ? `· ${r.sectionName}` : ''}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                                  {r.present}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600">
                                  {r.absent}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700">
                                  {r.late}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center font-medium text-muted-foreground">
                                {r.leave}
                              </td>
                              <td className="px-4 py-3 text-center font-medium text-purple-700">
                                {(r.officialLeave || 0) + (r.schoolClosed || 0)}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-muted-foreground">
                                {r.workingDays || monthlyData?.netWorkingDays || monthlyData?.totalWorkingDays || 0}
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px] font-bold">
                                    <span className={isHigh ? 'text-emerald-600' : isMid ? 'text-amber-600' : 'text-rose-600'}>
                                      {rate}%
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {r.present + r.late}/{r.workingDays || monthlyData?.netWorkingDays || monthlyData?.totalWorkingDays || 1} days
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isHigh ? 'bg-emerald-500' : isMid ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.min(100, rate)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isHigh ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-300/40 text-[10px] font-semibold">
                                    Excellent
                                  </Badge>
                                ) : isMid ? (
                                  <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-300/40 text-[10px] font-semibold">
                                    Satisfactory
                                  </Badge>
                                ) : (
                                  <Badge className="bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 border-rose-300/40 text-[10px] font-semibold">
                                    Low Attendance
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* School Closure / Official Leave Dialog */}
      <SchoolClosureDialog
        open={closureOpen}
        onOpenChange={setClosureOpen}
        initialDate={closureInitialDate}
        existingClosure={selectedClosure}
        onSuccess={() => {
          loadMonthly();
        }}
      />

      {markOpen && (
        <MarkAttendanceDialog
          open={markOpen}
          onOpenChange={setMarkOpen}
          sessionId={sessionId}
          classes={classes}
          initialClassId={classFilter}
          initialSectionId={sectionFilter}
          onSaved={() => {
            loadData();
            if (viewMode === 'monthly') loadMonthly();
          }}
        />
      )}
    </div>
  );
}

function MarkAttendanceDialog({
  open,
  onOpenChange,
  sessionId,
  classes,
  initialClassId,
  initialSectionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  classes: ClassLite[];
  initialClassId?: string;
  initialSectionId?: string;
  onSaved: () => void;
}) {
  const [classId, setClassId] = useState(initialClassId || '');
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [sectionId, setSectionId] = useState(initialSectionId || '');
  const [sectionsLoadedForClass, setSectionsLoadedForClass] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [savedStatuses, setSavedStatuses] = useState<Record<string, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const isDirty = useMemo(() => {
    if (students.length === 0) return false;
    return students.some((s) => (statuses[s._id] ?? 'present') !== (savedStatuses[s._id] ?? 'present'));
  }, [students, statuses, savedStatuses]);

  useEffect(() => {
    if (!open) {
      setClassId('');
      setSectionId('');
      setSections([]);
      setSectionsLoadedForClass(null);
      setStudents([]);
      setStatuses({});
      setSavedStatuses({});
      setOverwrite(false);
      setConfirmDiscardOpen(false);
      setPendingAction(null);
      return;
    }
    setDate(todayISO());
    if (initialClassId) setClassId(initialClassId);
    if (initialSectionId) setSectionId(initialSectionId);
  }, [open, initialClassId, initialSectionId]);

  useEffect(() => {
    if (!classId) {
      setSections([]);
      setSectionId('');
      setSectionsLoadedForClass(null);
      return;
    }
    api
      .get<ApiListResponse<SectionLite>>(`/sections/lookup?classId=${classId}`)
      .then((r) => {
        const list = r.data.data;
        setSections(list);
        setSectionsLoadedForClass(classId);
        if (initialSectionId && list.some((s) => s._id === initialSectionId)) {
          setSectionId(initialSectionId);
        } else if (list.length > 0) {
          setSectionId((prev) => (list.some((s) => s._id === prev) ? prev : ''));
        } else {
          setSectionId('');
        }
      })
      .catch(() => {
        setSections([]);
        setSectionId('');
        setSectionsLoadedForClass(classId);
      });
  }, [classId, initialSectionId]);

  useEffect(() => {
    if (!classId || !sessionId || sectionsLoadedForClass !== classId) {
      setStudents([]);
      setStatuses({});
      setSavedStatuses({});
      return;
    }

    // If class has sections, wait until one is chosen
    if (sections.length > 0 && !sectionId) {
      setStudents([]);
      setStatuses({});
      setSavedStatuses({});
      return;
    }

    setRosterLoading(true);
    const secQuery = sectionId ? `&sectionId=${sectionId}` : '';
    Promise.all([
      api.get<ApiListResponse<StudentLite>>(`/students?sessionId=${sessionId}&classId=${classId}${secQuery}&status=active&limit=100`),
      api.get<ApiListResponse<AttendanceRow>>(`/student-attendance?sessionId=${sessionId}&classId=${classId}${secQuery}&from=${date}&to=${date}&limit=100`),
    ])
      .then(([stuRes, attRes]) => {
        const list = stuRes.data.data;
        const existingList = attRes.data.data;
        const existingMap = new Map(existingList.map((r) => [r.studentId, r.status]));
        setStudents(list);

        const initialMap: Record<string, string> = {};
        for (const s of list) {
          initialMap[s._id] = existingMap.get(s._id) ?? 'present';
        }
        setStatuses(initialMap);
        setSavedStatuses(initialMap);

        if (existingList.length > 0) {
          setOverwrite(true);
        } else {
          setOverwrite(false);
        }
      })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setRosterLoading(false));
  }, [classId, sectionId, sessionId, date, sections.length, sectionsLoadedForClass]);

  const handleOpenChange = (v: boolean) => {
    if (!v && isDirty) {
      setPendingAction(() => () => onOpenChange(false));
      setConfirmDiscardOpen(true);
    } else {
      onOpenChange(v);
    }
  };

  const handleClassChange = (newVal: string) => {
    if (newVal === classId) return;
    if (isDirty) {
      setPendingAction(() => () => {
        setClassId(newVal);
        setSectionId('');
      });
      setConfirmDiscardOpen(true);
    } else {
      setClassId(newVal);
      setSectionId('');
    }
  };

  const handleSectionChange = (newVal: string) => {
    if (newVal === sectionId) return;
    if (isDirty) {
      setPendingAction(() => () => setSectionId(newVal));
      setConfirmDiscardOpen(true);
    } else {
      setSectionId(newVal);
    }
  };

  const handleDateChange = (newDate: string) => {
    if (newDate === date) return;
    if (isDirty) {
      setPendingAction(() => () => setDate(newDate));
      setConfirmDiscardOpen(true);
    } else {
      setDate(newDate);
    }
  };

  const submit = async () => {
    if (!classId || (sections.length > 0 && !sectionId) || !date || students.length === 0) return;
    setBusy(true);
    try {
      await api.post('/student-attendance/bulk', {
        sessionId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        attendanceDate: date,
        overwrite,
        records: students.map((s) => ({ studentId: s._id, status: statuses[s._id] ?? 'present' })),
      });
      toast.success(`Attendance saved for ${students.length} student(s)`);
      setSavedStatuses(statuses);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not mark attendance'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              {sections.length === 0 && classId
                ? "Review each student's status for this class, then save."
                : "Choose a class and section, set each student's status, then save."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId || undefined} onValueChange={handleClassChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              {classId && sections.length === 0 ? (
                <Select disabled>
                  <SelectTrigger className="w-full text-muted-foreground">
                    <SelectValue placeholder="No sections" />
                  </SelectTrigger>
                </Select>
              ) : (
                <Select
                  value={sectionId || undefined}
                  onValueChange={handleSectionChange}
                  disabled={!classId || sections.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={classId ? 'Select section' : 'Select class first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} max={todayISO()} onChange={(e) => handleDateChange(e.target.value)} />
            </div>
          </div>

          {rosterLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading roster…</p>
          ) : students.length ? (
            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Student</span>
                <span>Status</span>
              </div>
              <div className="max-h-72 divide-y overflow-y-auto">
                {students.map((s) => (
                  <div key={s._id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
                    <div className="leading-tight">
                      <p className="text-sm font-medium">{formatStudentIdentity(s)}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.admissionNumber} · Roll {s.rollNumber || '—'}
                      </p>
                    </div>
                    <Select
                      value={statuses[s._id] ?? 'present'}
                      onValueChange={(v) => setStatuses((prev) => ({ ...prev, [s._id]: v }))}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="leave">Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-1 h-5 w-5" />
              {classId && sections.length === 0
                ? 'No active students found in this class.'
                : 'Select a class and section to load the roster.'}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="overwrite" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
            <Label htmlFor="overwrite" className="text-sm font-normal">
              Overwrite attendance already marked for this date
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || students.length === 0}>
              {busy ? 'Saving…' : 'Save attendance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Discard unsaved changes?"
        description="You have unsaved changes to student attendance. If you proceed, your changes will be discarded."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        }}
      />
    </>
  );
}
