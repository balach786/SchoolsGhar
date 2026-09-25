import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Download, Pencil, CheckCircle2, Lock, Loader2, Search, Sparkles, Calendar, AlertCircle, HandCoins, CircleDollarSign } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatCurrency, formatDate, toPaisa, getSchoolCurrentMonthISO, getSchoolTodayISO } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface StaffLite { _id: string; fullName: string; employeeId: string; staffType: string; designation: string; salary?: number; isArchived?: boolean }
interface SessionRow { _id: string; name: string; isActive: boolean; isArchived?: boolean }
interface SalaryRow {
  _id: string; staffId: string; sessionId: string; salaryMonth: string;
  baseAmount: number; adjustmentAmount: number; netAmount: number;
  status: 'unpaid' | 'paid'; paymentDate: string | null; paymentMethod: string | null; notes: string | null; absentDays?: number;
  bonusAmount?: number; bonusReason?: string | null;
  staffName?: string; employeeId?: string; staffType?: string; designation?: string;
}

interface AttendanceCalcResult {
  baseAmount: number;
  workingDays: number;
  daysInMonth: number;
  dailyRate: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  deductionAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  notes: string;
}

export function SalariesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<SalaryRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('all');
  const [staffList, setStaffList] = useState<StaffLite[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [payTarget, setPayTarget] = useState<SalaryRow | null>(null);

  const canCreate = can('salaries', 'create');
  const canEdit = can('salaries', 'edit');

  useEffectOnce(() => {
    api.get<ApiListResponse<StaffLite>>('/staff?limit=500').then((r) => setStaffList(r.data.data.filter((s) => !s.isArchived && s.salary && s.salary > 0))).catch(() => {});
    api.get<ApiListResponse<SessionRow>>('/academic-sessions/lookup').then((r) => setSessions(r.data.data.filter((s) => !s.isArchived))).catch(() => {});
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (month) params.set('month', month);
      if (status !== 'all') params.set('status', status);
      const res = await api.get<ApiListResponse<SalaryRow>>(`/salaries?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, month, status]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<SalaryRow>[] = [
    {
      key: 'staff', header: 'Staff Member',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium flex items-center gap-1.5">
            {row.staffName ?? '—'}
            {row.staffType === 'teaching' ? (
              <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-blue-50 text-blue-700 border-blue-200">Teacher</Badge>
            ) : row.staffType === 'non_teaching' ? (
              <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-slate-50 text-slate-700 border-slate-200">{row.designation || 'Staff'}</Badge>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">{row.employeeId ?? '—'}</p>
        </div>
      ),
    },
    { key: 'month', header: 'Month', cell: (row) => <span className="text-sm">{row.salaryMonth}</span> },
    { key: 'base', header: 'Base Salary', cell: (row) => <span className="text-sm whitespace-nowrap">{formatCurrency(row.baseAmount)}</span> },
    { key: 'absentDays', header: 'Absent Days', cell: (row) => <span className="text-sm text-muted-foreground">{row.absentDays ?? 0}</span> },
    {
      key: 'deduction', header: 'Deduction',
      cell: (row) => (
        <span className={row.adjustmentAmount < 0 ? 'text-sm text-rose-600 font-medium whitespace-nowrap' : 'text-sm text-muted-foreground'}>
          {row.adjustmentAmount < 0 ? '−' : ''}{formatCurrency(Math.abs(row.adjustmentAmount))}
        </span>
      ),
    },
    {
      key: 'bonus', header: 'Bonus',
      cell: (row) => (
        <div className="leading-tight">
          {(row.bonusAmount ?? 0) > 0 ? (
            <>
              <span className="text-sm text-emerald-600 font-medium whitespace-nowrap">+{formatCurrency(row.bonusAmount!)}</span>
              {row.bonusReason && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[100px] truncate" title={row.bonusReason}>{row.bonusReason}</p>}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    { key: 'net', header: 'Net Salary', cell: (row) => <span className="font-bold whitespace-nowrap">{formatCurrency(row.netAmount)}</span> },
    {
      key: 'status', header: 'Status',
      cell: (row) => row.status === 'paid'
        ? (
          <div className="leading-tight">
            <Badge className="bg-emerald-600 text-white">Paid</Badge>
            {row.paymentDate && <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.paymentDate)}</p>}
          </div>
        )
        : <Badge variant="outline" className="text-amber-600">Unpaid</Badge>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canEdit && row.status === 'unpaid' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(row); openEdit(row); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPayTarget(row)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark paid
              </Button>
            </>
          )}
          {row.status === 'paid' && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> locked
            </span>
          )}
        </div>
      ),
    },
  ];

  // ── Form state ────────────────────────────────────────
  const [staffId, setStaffId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(() => getSchoolCurrentMonthISO());
  const [adjustmentText, setAdjustmentText] = useState('0');
  const [bonusText, setBonusText] = useState('0');
  const [bonusReason, setBonusReason] = useState('');
  const [notes, setNotes] = useState('');
  const [payDate, setPayDate] = useState(() => getSchoolTodayISO());
  const [payMethod, setPayMethod] = useState('bank_transfer');

  // Auto-Calculate from Attendance state
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [calcPreview, setCalcPreview] = useState<AttendanceCalcResult | null>(null);
  const [loadingCalc, setLoadingCalc] = useState(false);

  useEffect(() => {
    if (formOpen && staffId && salaryMonth) {
      setLoadingCalc(true);
      api.get<ApiDataResponse<AttendanceCalcResult>>(`/salaries/calculate?staffId=${staffId}&salaryMonth=${salaryMonth}`)
        .then((r) => {
          const c = r.data.data;
          setCalcPreview(c);
          if (!editing) {
            setAdjustmentText((c.adjustmentAmount / 100).toFixed(2));
            if (c.notes) setNotes(c.notes);
          }
        })
        .catch(() => setCalcPreview(null))
        .finally(() => setLoadingCalc(false));
    } else {
      setCalcPreview(null);
    }
  }, [formOpen, staffId, salaryMonth, editing]);

  function openCreate() {
    setEditing(null);
    setStaffId('');
    const active = sessions.find((s) => s.isActive);
    setSessionId(active?._id ?? sessions[0]?._id ?? '');
    setSalaryMonth(getSchoolCurrentMonthISO());
    setAdjustmentText('0');
    setBonusText('0');
    setBonusReason('');
    setNotes('');
    setCalcPreview(null);
    setFormOpen(true);
  }

  function openEdit(row: SalaryRow) {
    setEditing(row);
    setStaffId(row.staffId);
    setSessionId(row.sessionId);
    setSalaryMonth(row.salaryMonth);
    setAdjustmentText(((row.adjustmentAmount ?? 0) / 100).toFixed(2));
    setBonusText(((row.bonusAmount ?? 0) / 100).toFixed(2));
    setBonusReason(row.bonusReason ?? '');
    setNotes(row.notes ?? '');
    setCalcPreview(null);
    setFormOpen(true);
  }

  const selectedStaff = staffList.find((s) => s._id === staffId);
  const basePaisa = selectedStaff?.salary ?? 0;
  const adjPaisa = toPaisa(adjustmentText || '0');
  const bonusPaisa = toPaisa(bonusText || '0');
  const netPreview = basePaisa + adjPaisa + bonusPaisa;

  async function submitForm() {
    if (!staffId) return toast.error('Select a staff member');
    if (!sessionId) return toast.error('Select a session');
    if (!salaryMonth) return toast.error('Select the salary month');
    if (bonusPaisa < 0) return toast.error('Bonus amount cannot be negative');
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        staffId,
        sessionId,
        salaryMonth,
        adjustmentAmount: adjPaisa,
        bonusAmount: bonusPaisa,
        bonusReason: bonusReason.trim() || undefined,
        notes: notes || undefined,
      };
      if (editing) {
        await api.patch(`/salaries/${editing._id}`, payload);
        toast.success('Salary record updated');
      } else {
        await api.post('/salaries', payload);
        toast.success('Salary record created');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    if (!payTarget) return;
    setBusy(true);
    try {
      await api.post(`/salaries/${payTarget._id}/mark-paid`, { paymentDate: payDate, paymentMethod: payMethod });
      toast.success(`Salary for ${payTarget.staffName ?? 'staff'} marked paid`);
      setPayTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await api.get('/salaries?format=csv&limit=1000', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salaries-${new Date().toISOString().slice(0, 7)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Salaries"
        description="Monthly salary records with automated absent days deduction based on staff attendance."
        crumbs={[{ label: 'Finance' }, { label: 'Salaries' }]}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            {canCreate && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setAutoGenOpen(true)}
                  className="border-amber-400/80 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 rounded-xl font-semibold gap-1.5"
                >
                  <Sparkles className="h-4 w-4 text-amber-600" /> Auto-Calculate from Attendance
                </Button>
                <Button onClick={openCreate} className="rounded-xl font-semibold gap-1">
                  <Plus className="mr-1.5 h-4 w-4" /> New record
                </Button>
              </>
            )}
          </>
        }
      />



      <div className="filter-toolbar mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search staff name or ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
        </div>
        <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Salary month" />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
        emptyTitle="No salary records"
        emptyDescription={canCreate ? 'Create the first record or auto-calculate from monthly attendance.' : undefined}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit salary record' : 'New salary record'}</DialogTitle>
            <DialogDescription>One record per staff member per month. Paid records are locked.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Staff Member</Label>
              <Select value={staffId} onValueChange={setStaffId} disabled={Boolean(editing)}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.fullName} · {s.employeeId} ({s.staffType === 'teaching' ? 'Teacher' : s.designation})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Session</Label>
                <Select value={sessionId} onValueChange={setSessionId} disabled={Boolean(editing)}>
                  <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sal-month">Month</Label>
                <Input id="sal-month" type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} disabled={Boolean(editing)} />
              </div>
            </div>

            {/* Live Monthly Attendance Deduction Preview Card */}
            {loadingCalc && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Calculating monthly attendance records for {salaryMonth}…
              </div>
            )}

            {calcPreview && !loadingCalc && (
              <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-amber-950">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    Attendance Auto-Calculation ({salaryMonth})
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-background border-amber-300">
                    {calcPreview.workingDays} days base
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-emerald-700 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    ✓ {calcPreview.presentDays} Present
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                    calcPreview.absentDays > 0 ? 'bg-rose-500/10 text-rose-700 font-extrabold' : 'bg-muted text-muted-foreground'
                  }`}>
                    ✗ {calcPreview.absentDays} Absent
                  </span>
                  <span className="text-muted-foreground">
                    • {calcPreview.lateDays} Late · {calcPreview.leaveDays} Leave
                  </span>
                </div>
                <div className="text-[11px] pt-0.5 text-foreground leading-relaxed border-t border-amber-200/60">
                  <p>
                    Per-Day Rate: <span className="font-mono font-semibold">{formatCurrency(calcPreview.dailyRate)}</span>
                  </p>
                  {calcPreview.absentDays > 0 ? (
                    <p className="text-rose-600 font-bold mt-0.5">
                      Absent Deduction ({calcPreview.absentDays} × {formatCurrency(calcPreview.dailyRate)}): -{formatCurrency(calcPreview.deductionAmount)}
                    </p>
                  ) : (
                    <p className="text-emerald-600 font-medium mt-0.5">
                      ✓ No absent days in {salaryMonth} (Full monthly pay, no deduction)
                    </p>
                  )}
                </div>
                {calcPreview.deductionAmount > 0 && Math.abs(adjPaisa - calcPreview.adjustmentAmount) > 10 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-amber-900 hover:bg-amber-500/20 font-semibold rounded-lg"
                    onClick={() => {
                      setAdjustmentText((calcPreview.adjustmentAmount / 100).toFixed(2));
                      setNotes(calcPreview.notes);
                    }}
                  >
                    Re-apply Absent Deduction (-{formatCurrency(calcPreview.deductionAmount)})
                  </Button>
                )}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="sal-adj">Adjustment (PKR) — leave as auto-calculated deduction</Label>
              <Input id="sal-adj" type="number" step={0.01} value={adjustmentText} onChange={(e) => setAdjustmentText(e.target.value)} />
            </div>

            {/* One-Time Bonus Section */}
            <div className="rounded-xl border border-emerald-300/70 bg-emerald-500/5 p-3 space-y-2.5">
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                One-Time Bonus (optional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="sal-bonus">Bonus Amount (PKR)</Label>
                  <Input
                    id="sal-bonus"
                    type="number"
                    step={0.01}
                    min={0}
                    value={bonusText}
                    onChange={(e) => setBonusText(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sal-bonus-reason">Bonus Reason</Label>
                  <Input
                    id="sal-bonus-reason"
                    type="text"
                    value={bonusReason}
                    onChange={(e) => setBonusReason(e.target.value)}
                    placeholder="e.g. Eid Bonus, Performance"
                    maxLength={200}
                  />
                </div>
              </div>
              {bonusPaisa > 0 && (
                <p className="text-[11px] text-emerald-700 font-semibold">
                  + {formatCurrency(bonusPaisa)} bonus applied to this month only.
                </p>
              )}
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Net Preview: </span>
              Base <span className="font-medium">{formatCurrency(basePaisa)}</span>
              <span className={adjPaisa < 0 ? ' text-rose-600' : ' text-emerald-600'}> {adjPaisa >= 0 ? '+' : '−'} {formatCurrency(Math.abs(adjPaisa))}</span>
              {bonusPaisa > 0 && <span className="text-emerald-600"> + {formatCurrency(bonusPaisa)}</span>}
              {' = '}<span className="font-bold text-foreground">{formatCurrency(netPreview)}</span>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="sal-notes">Notes</Label>
              <Textarea id="sal-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payTarget)} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark salary paid</DialogTitle>
            <DialogDescription>
              {payTarget ? `${payTarget.staffName ?? 'Staff'} — ${payTarget.salaryMonth} · ${formatCurrency(payTarget.netAmount)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="paid-date">Payment date</Label>
              <Input id="paid-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={markPaid} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Calculate & Auto-Generate Salaries from Attendance Dialog */}
      <AutoGenerateSalariesDialog
        open={autoGenOpen}
        onOpenChange={setAutoGenOpen}
        sessions={sessions}
        onGenerated={load}
      />
    </div>
  );
}

function AutoGenerateSalariesDialog({
  open,
  onOpenChange,
  sessions,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessions: SessionRow[];
  onGenerated: () => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(() => getSchoolCurrentMonthISO());
  const [workingDays, setWorkingDays] = useState('30');
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !sessionId) {
      const active = sessions.find((s) => s.isActive) ?? sessions[0];
      if (active) setSessionId(active._id);
    }
  }, [open, sessions, sessionId]);

  const handleGenerate = async () => {
    if (!sessionId) return toast.error('Select an academic session');
    if (!salaryMonth) return toast.error('Select salary month');
    setBusy(true);
    try {
      const res = await api.post<{
        data: {
          createdCount: number;
          updatedCount: number;
          skippedCount: number;
          totalDeductions: number;
          totalNet: number;
          message: string;
        };
      }>('/salaries/auto-generate', {
        sessionId,
        salaryMonth,
        workingDays: Number(workingDays) || 30,
        overwriteExisting: overwrite,
      });
      toast.success(
        `Auto-calculated salaries: ${res.data.data.createdCount} created, ${res.data.data.updatedCount} updated, ${res.data.data.skippedCount} skipped.`
      );
      onOpenChange(false);
      onGenerated();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to auto-generate salaries'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Auto-Calculate Staff Salaries from Attendance
          </DialogTitle>
          <DialogDescription>
            Scans all active teaching and non-teaching staff, checks their monthly attendance records, and automatically calculates pay with deductions ONLY for absent days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="rounded-xl bg-amber-500/10 border border-amber-300/60 p-3 text-amber-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Automated Absent Deduction Formula
            </p>
            <p className="text-[11px] text-muted-foreground">
              Daily Rate = Base Monthly Salary ÷ Working Days (default 30).
              Deduction = Absent Days × Daily Rate. Present, late, and leave days are not deducted.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Academic Session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Salary Month</Label>
              <Input
                type="month"
                value={salaryMonth}
                onChange={(e) => setSalaryMonth(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Working Days (for daily rate)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="overwrite-salaries"
              checked={overwrite}
              onCheckedChange={(c) => setOverwrite(Boolean(c))}
            />
            <Label htmlFor="overwrite-salaries" className="text-xs font-normal cursor-pointer">
              Recalculate & overwrite existing unpaid salaries for {salaryMonth}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="rounded-xl text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={busy}
            className="bg-primary text-primary-foreground font-semibold rounded-xl text-xs gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate Salaries with Deductions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

