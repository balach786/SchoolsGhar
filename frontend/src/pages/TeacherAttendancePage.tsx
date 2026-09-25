import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Download, Calendar, TrendingUp, Sparkles, XCircle, Users, ArrowRight, Loader2, DollarSign, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDate, todayISO, formatCurrency, getSchoolCurrentMonthISO } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { SchoolClosureDialog, type SchoolClosureItem } from '@/components/attendance/SchoolClosureDialog';
import { ManualAttendanceRegister, type CalendarDayItem, type RegisterRowItem } from '@/components/attendance/ManualAttendanceRegister';

interface TeacherLite { _id: string; fullName: string; employeeId: string; isActive: boolean; isArchived: boolean }
interface Row {
  _id: string; teacherId: string; teacherName: string; employeeId: string;
  attendanceDate: string; status: 'present' | 'absent' | 'late' | 'leave';
}

interface MonthlyTeacherRow {
  teacherId: string;
  teacherName: string;
  employeeId: string;
  department: string;
  designation: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  officialLeave?: number;
  schoolClosed?: number;
  totalRecorded: number;
  workingDays: number;
  attendanceRate: number;
  baseSalary: number;
  dailyRate: number;
  absentDeduction: number;
  projectedNet: number;
  dailyMarks?: Record<number, any>;
  salaryRecord: {
    status: string;
    baseAmount: number;
    adjustmentAmount: number;
    netAmount: number;
    paymentDate: string | null;
  } | null;
}

interface MonthlyTeacherSummaryData {
  month: string;
  daysInMonth: number;
  totalSundays?: number;
  totalOfficialLeaves?: number;
  totalSchoolClosed?: number;
  totalWorkingDays: number;
  netWorkingDays?: number;
  totalTeachers: number;
  staffAverageRate: number;
  totals: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    officialLeaves?: number;
    schoolClosed?: number;
    totalDeductions: number;
    totalProjectedNet: number;
  };
  calendarDays?: CalendarDayItem[];
  dailyTotals?: Record<number, { present: number; absent: number; late: number; leave: number }>;
  rows: MonthlyTeacherRow[];
}

const STATUS_LABEL: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave' };
const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  present: 'success', absent: 'destructive', late: 'warning', leave: 'muted',
};

export function TeacherAttendancePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leave: 0, late: 0 });

  // Monthly Auto-Calculation State
  const [monthlyMonth, setMonthlyMonth] = useState(() => getSchoolCurrentMonthISO());
  const [monthlyData, setMonthlyData] = useState<MonthlyTeacherSummaryData | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [monthlySubView, setMonthlySubView] = useState<'register' | 'summary'>('register');
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureInitialDate, setClosureInitialDate] = useState<string | undefined>(undefined);
  const [selectedClosure, setSelectedClosure] = useState<any>(null);

  const canCreate = can('teacherAttendance', 'create');
  const canExport = can('teacherAttendance', 'export');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<ApiListResponse<Row> & { data: { summary?: any } }>(`/teacher-attendance?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      setSummary(res.data.summary || { present: 0, absent: 0, leave: 0, late: 0 });
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, from, to]);

  useEffect(() => { load(); }, [load]);

  const loadMonthly = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const res = await api.get<{ data: MonthlyTeacherSummaryData }>(`/teacher-attendance/monthly-summary?month=${monthlyMonth}`);
      setMonthlyData(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to load monthly staff attendance'));
    } finally {
      setLoadingMonthly(false);
    }
  }, [monthlyMonth]);

  useEffect(() => {
    if (viewMode === 'monthly') {
      loadMonthly();
    }
  }, [viewMode, loadMonthly]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/teacher-attendance/download?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'teacher-attendance.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(apiErrorMessage(err, 'Export failed')); } finally { setExporting(false); }
  };

  const exportMonthlyCsv = async () => {
    try {
      const res = await api.get(`/teacher-attendance/monthly-summary?month=${monthlyMonth}&format=csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teacher-monthly-attendance-${monthlyMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Staff monthly attendance exported');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Export failed'));
    }
  };

  const filteredMonthlyRows = (monthlyData?.rows || []).filter((r) => {
    if (!monthlySearch.trim()) return true;
    const q = monthlySearch.toLowerCase();
    return (
      r.teacherName.toLowerCase().includes(q) ||
      r.employeeId.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.designation.toLowerCase().includes(q)
    );
  });

  const columns: Column<Row>[] = [
    {
      key: 'attendanceDate', header: 'Date',
      cell: (row) => <span className="whitespace-nowrap text-sm">{formatDate(row.attendanceDate)}</span>,
    },
    {
      key: 'teacher', header: 'Teacher',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.teacherName}</p>
          <p className="text-xs text-muted-foreground">{row.employeeId}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      cell: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teacher Attendance"
        description="Daily logs and automated monthly staff attendance & pay deductions."
        crumbs={[{ label: 'Attendance' }, { label: 'Teachers' }]}
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
            Monthly Auto-Calculation & Pay Breakdown
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === 'daily' && (
        <>
          <div className="filter-toolbar mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

          <DataTable columns={columns} data={data} loading={loading} pagination={pagination} rowKey={(r) => r._id}
            onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
            emptyTitle="No teacher attendance records"
            emptyDescription="Mark teacher attendance to see records here." />
        </>
      )}

      {viewMode === 'monthly' && (
        <div className="space-y-4">
          {/* Monthly Control Bar */}
          <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Calculation Month</Label>
                <Input
                  type="month"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="pt-4 flex items-center gap-2">
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
                    Payroll Breakdown
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

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportMonthlyCsv}
                className="h-9 rounded-xl text-xs font-semibold gap-1.5 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                Export Monthly Sheet
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/salaries')}
                className="h-9 rounded-xl text-xs font-semibold gap-1.5 bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90"
              >
                <Wallet className="h-3.5 w-3.5" />
                Staff Salaries & Payroll
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Subview 1: Authentic Manual Attendance Register Sheet */}
          {monthlySubView === 'register' && (
            <ManualAttendanceRegister
              title="Staff Monthly Attendance & Pay Register"
              month={monthlyMonth}
              calendarDays={monthlyData?.calendarDays || []}
              rows={filteredMonthlyRows.map((r) => ({
                id: r.teacherId,
                primaryLabel: r.teacherName,
                secondaryLabel: `ID: ${r.employeeId}`,
                subLabel: r.designation || r.department || 'Staff',
                present: r.present,
                absent: r.absent,
                late: r.late,
                leave: r.leave,
                officialLeave: r.officialLeave || 0,
                schoolClosed: r.schoolClosed || 0,
                workingDays: r.workingDays || monthlyData?.netWorkingDays || monthlyData?.totalWorkingDays || 0,
                attendanceRate: r.attendanceRate,
                baseSalary: r.baseSalary,
                dailyRate: r.dailyRate,
                absentDeduction: r.absentDeduction,
                projectedNet: r.projectedNet,
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
              isStaff={true}
              loading={loadingMonthly}
              onOpenClosureDialog={(dateStr, closure) => {
                setClosureInitialDate(dateStr || new Date().toISOString().slice(0, 10));
                setSelectedClosure(closure || null);
                setClosureOpen(true);
              }}
              onExportCsv={exportMonthlyCsv}
            />
          )}

          {/* Subview 2: KPI Cards and Pay Breakdown Table */}
          {monthlySubView === 'summary' && (
            <>
              {/* Monthly KPI Stats Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-blue-50 text-[#1E3A8A] flex items-center justify-center border border-blue-200/60 shrink-0">
                    <Users className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Teaching Staff</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{monthlyData?.totalTeachers ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Active faculty</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center border border-amber-200/60 shrink-0">
                    <Calendar className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Net Working Days</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{monthlyData?.netWorkingDays ?? monthlyData?.totalWorkingDays ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">in {monthlyMonth}</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shrink-0">
                    <TrendingUp className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Staff Attendance Rate</p>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">{monthlyData?.staffAverageRate ?? 0}%</p>
                    <p className="text-[10px] text-muted-foreground">Auto-calculated avg</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/60 shrink-0">
                    <DollarSign className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">Absent Deductions</p>
                    <p className="text-xl font-bold text-rose-600 mt-0.5">{formatCurrency(monthlyData?.totals.totalDeductions ?? 0)}</p>
                    <p className="text-[10px] text-muted-foreground">{monthlyData?.totals.absent ?? 0} absent days deducted</p>
                  </div>
                </div>
              </div>

              {/* Search bar inside Monthly View */}
              <div className="flex items-center justify-between gap-3">
                <Input
                  placeholder="Search by teacher name, employee ID, or department…"
                  value={monthlySearch}
                  onChange={(e) => setMonthlySearch(e.target.value)}
                  className="max-w-md h-9 text-xs rounded-xl"
                />
                <span className="text-xs text-muted-foreground">
                  Showing {filteredMonthlyRows.length} staff members
                </span>
              </div>

              {/* Monthly Staff Attendance & Pay Table */}
              <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-xs overflow-hidden">
                {loadingMonthly ? (
                  <div className="p-12 text-center">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">Calculating monthly attendance & deductions…</p>
                  </div>
                ) : filteredMonthlyRows.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">No teachers found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ensure active teachers are registered and attendance has been marked for {monthlyMonth}.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                          <th className="px-4 py-3 w-12 text-center">#</th>
                          <th className="px-4 py-3">Teacher / Staff</th>
                          <th className="px-4 py-3 text-center">Present</th>
                          <th className="px-4 py-3 text-center">Absent</th>
                          <th className="px-4 py-3 text-center">Late / Leave</th>
                          <th className="px-4 py-3 text-center">Holidays / Closed</th>
                          <th className="px-4 py-3 text-center">Attendance %</th>
                          <th className="px-4 py-3 text-right">Base Salary</th>
                          <th className="px-4 py-3 text-right">Per Day Rate</th>
                          <th className="px-4 py-3 text-right">Absent Deduction</th>
                          <th className="px-4 py-3 text-right">Projected Net</th>
                          <th className="px-4 py-3 text-center">Payroll Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredMonthlyRows.map((r, idx) => {
                          const rate = r.attendanceRate;
                          const isHigh = rate >= 90;
                          const hasAbsent = r.absent > 0;

                          return (
                            <tr key={r.teacherId} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                              <td className="px-4 py-3">
                                <div className="leading-tight">
                                  <p className="font-semibold text-foreground">{r.teacherName}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono">ID: {r.employeeId} · {r.designation || r.department || 'Staff'}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                                  {r.present}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                  hasAbsent ? 'bg-rose-500/10 text-rose-600 font-extrabold' : 'bg-muted text-muted-foreground'
                                }`}>
                                  {r.absent}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-muted-foreground">
                                {r.late} late · {r.leave} leave
                              </td>
                              <td className="px-4 py-3 text-center font-medium text-purple-700">
                                {(r.officialLeave || 0) + (r.schoolClosed || 0)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-bold ${isHigh ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {rate}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-foreground">
                                {formatCurrency(r.baseSalary)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">
                                {formatCurrency(r.dailyRate)}/day
                              </td>
                              <td className="px-4 py-3 text-right">
                                {hasAbsent ? (
                                  <span className="font-bold text-rose-600">
                                    - {formatCurrency(r.absentDeduction)}
                                    <span className="block text-[9px] font-normal text-rose-500">
                                      ({r.absent} × {formatCurrency(r.dailyRate)})
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">PKR 0</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-foreground">
                                {formatCurrency(r.projectedNet)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {r.salaryRecord ? (
                                  r.salaryRecord.status === 'paid' ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300/40 text-[10px]">
                                      Paid
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300/60 text-[10px]">
                                      Generated (Unpaid)
                                    </Badge>
                                  )
                                ) : (
                                  <span className="text-[11px] text-muted-foreground italic">Not generated</span>
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
        <MarkTeacherDialog
          open={markOpen}
          onOpenChange={setMarkOpen}
          onSaved={() => { load(); if (viewMode === 'monthly') loadMonthly(); }}
        />
      )}
    </div>
  );
}

function MarkTeacherDialog({ open, onOpenChange, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [date, setDate] = useState(todayISO());
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffectOnce(() => {
    api.get<ApiListResponse<TeacherLite>>('/teachers?limit=100').then((r) => {
      const active = r.data.data.filter((t) => t.isActive && !t.isArchived);
      setTeachers(active);
      setStatuses(Object.fromEntries(active.map((t) => [t._id, 'present'])));
    }).catch(() => {});
  });

  useEffect(() => { if (open) setDate(todayISO()); }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/teacher-attendance/bulk', {
        attendanceDate: date, overwrite,
        records: teachers.map((t) => ({ teacherId: t._id, status: statuses[t._id] ?? 'present' })),
      });
      toast.success(`Attendance marked for ${teachers.length} teacher(s)`);
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error(apiErrorMessage(err, 'Could not mark attendance')); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark teacher attendance</DialogTitle>
          <DialogDescription>Set each teacher's status for the day, then save.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Teacher</span><span>Status</span>
          </div>
          <div className="max-h-72 divide-y overflow-y-auto">
            {teachers.map((t) => (
              <div key={t._id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
                <div className="leading-tight">
                  <p className="text-sm font-medium">{t.fullName}</p>
                  <p className="text-xs text-muted-foreground">{t.employeeId}</p>
                </div>
                <Select value={statuses[t._id] ?? 'present'} onValueChange={(v) => setStatuses((prev) => ({ ...prev, [t._id]: v }))}>
                  <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
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

        <div className="flex items-center gap-2">
          <Checkbox id="t-overwrite" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
          <Label htmlFor="t-overwrite" className="text-sm font-normal">
            Overwrite attendance already marked for this date
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || teachers.length === 0}>{busy ? 'Saving…' : 'Save attendance'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
