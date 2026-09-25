import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Archive, ArchiveRestore, Sparkles, Loader2, History } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FinanceNavHeader } from '@/components/finance/FinanceNavHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatCurrency, toPaisa } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

const FEE_TYPES: Record<string, string> = {
  monthly_tuition: 'Monthly Tuition',
  admission_fee: 'Admission Fee',
  other: 'Other',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface SessionRow { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassRow { _id: string; name: string; sessionId: string; isArchived: boolean }
interface FeeRow {
  _id: string; sessionId: string; classId: string; feeType: string; title: string;
  amount: number; month: number | null; dueDate: string | null; description?: string;
  isActive: boolean; isArchived: boolean; className?: string; sessionName?: string;
}

export function FeeStructuresPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<FeeRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('all');
  const [feeType, setFeeType] = useState('monthly_tuition');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FeeRow | null>(null);
  const [generateTarget, setGenerateTarget] = useState<FeeRow | null>(null);
  const [generateResult, setGenerateResult] = useState<{ created: number; skipped: number } | null>(null);

  const canCreate = can('fees', 'create');
  const canEdit = can('fees', 'edit');

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionRow>>('/academic-sessions/lookup').then((r) => {
      setSessions(r.data.data.filter((s) => !s.isArchived));
      const active = r.data.data.find((s) => s.isActive);
      if (active) setSessionId(active._id);
    }).catch(() => {});
  });

  useEffect(() => {
    if (!sessionId) return;
    api.get<ApiListResponse<ClassRow>>(`/classes/lookup?sessionId=${sessionId}`).then((r) => {
      setClasses(r.data.data.filter((c) => !c.isArchived));
    }).catch(() => {});
  }, [sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const limitToUse = feeType === 'monthly_tuition' ? 500 : pagination.limit;
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(limitToUse) });
      if (sessionId) params.set('sessionId', sessionId);
      if (classId && classId !== 'all') params.set('classId', classId);
      if (feeType !== 'all') params.set('feeType', feeType);
      
      const res = await api.get<ApiListResponse<FeeRow>>(`/fee-structures?${params}`);
      setData(res.data.data);
      
      if (feeType !== 'monthly_tuition') {
        setPagination(res.data.pagination);
      } else {
        setPagination((prev) => ({ 
          ...prev, 
          total: res.data.pagination.total, 
          totalPages: Math.ceil(res.data.pagination.total / limitToUse) 
        }));
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sessionId, classId, feeType]);

  useEffect(() => { load(); }, [load]);

  // Transform data for Matrix view
  const matrixData = useMemo(() => {
    if (feeType !== 'monthly_tuition') return [];
    const grouped = new Map<string, { classId: string; className: string; sessionName: string; months: Record<number, FeeRow> }>();
    
    // Seed with selected classes so even empty ones show up in matrix
    if (classes.length > 0) {
       classes.forEach(c => {
         if (classId === 'all' || classId === c._id) {
           const sessionName = sessions.find(s => s._id === c.sessionId)?.name ?? '';
           grouped.set(c._id, { classId: c._id, className: c.name, sessionName, months: {} });
         }
       });
    }

    data.forEach(fee => {
      if (fee.feeType === 'monthly_tuition' && fee.month) {
        if (!grouped.has(fee.classId)) {
          grouped.set(fee.classId, { classId: fee.classId, className: fee.className ?? 'Unknown', sessionName: fee.sessionName ?? '', months: {} });
        }
        grouped.get(fee.classId)!.months[fee.month] = fee;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.className.localeCompare(b.className));
  }, [data, feeType, classes, classId, sessions]);


  const columns: Column<FeeRow>[] = [
    {
      key: 'title', header: 'Fee',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">{FEE_TYPES[row.feeType] ?? row.feeType}</p>
        </div>
      ),
    },
    { key: 'class', header: 'Class', cell: (row) => <span className="text-sm">{row.className ?? '—'} · {row.sessionName ?? '—'}</span> },
    { key: 'amount', header: 'Amount', cell: (row) => <span className="font-medium">{formatCurrency(row.amount)}</span> },
    {
      key: 'month', header: 'Month',
      cell: (row) => <span className="text-sm">{row.month ? MONTHS[row.month - 1] : '—'}</span>,
    },
    {
      key: 'status', header: 'Status',
      cell: (row) => row.isArchived
        ? <Badge variant="secondary">Archived</Badge>
        : <Badge variant="outline" className="text-emerald-600">Active</Badge>,
    },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canCreate && !row.isArchived && (
            <Button size="sm" variant="outline" onClick={() => setGenerateTarget(row)}>
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Generate
            </Button>
          )}
          <Button size="sm" variant="ghost" title="Student fee ledger" onClick={() => navigate(`/payments`)}>
            <History className="h-3.5 w-3.5" />
          </Button>
          {canEdit && !row.isArchived && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row)}>
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ── Form state ────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [formClassId, setFormClassId] = useState('');
  const [formFeeType, setFormFeeType] = useState('monthly_tuition');
  const [amountText, setAmountText] = useState('');
  const [monthVal, setMonthVal] = useState(String(new Date().getMonth() + 1));
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  function openCreate() {
    setEditing(null);
    setTitle('');
    setFormClassId(classId && classId !== 'all' ? classId : classes[0]?._id ?? '');
    setFormFeeType(feeType !== 'all' ? feeType : 'monthly_tuition');
    setAmountText('');
    setMonthVal(String(new Date().getMonth() + 1));
    setDueDate('');
    setDescription('');
    setFormOpen(true);
  }

  function openEdit(row: FeeRow) {
    setEditing(row);
    setTitle(row.title);
    setFormClassId(row.classId);
    setFormFeeType(row.feeType);
    setAmountText((row.amount / 100).toFixed(2));
    setMonthVal(row.month ? String(row.month) : String(new Date().getMonth() + 1));
    setDueDate(row.dueDate ? row.dueDate.slice(0, 10) : '');
    setDescription(row.description ?? '');
    setFormOpen(true);
  }

  async function submitForm() {
    if (!title.trim()) return toast.error('Fee title is required');
    if (!formClassId) return toast.error('Select a class');
    const amount = toPaisa(amountText);
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        sessionId,
        classId: formClassId,
        feeType: formFeeType,
        title: title.trim(),
        amount,
        dueDate: dueDate || undefined,
        description: description || undefined,
      };
      if (formFeeType === 'monthly_tuition') payload.month = Number(monthVal);
      if (editing) {
        await api.patch(`/fee-structures/${editing._id}`, payload);
        toast.success('Fee structure updated');
      } else {
        await api.post('/fee-structures', payload);
        toast.success('Fee structure created');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      const action = archiveTarget.isArchived ? 'restore' : 'archive';
      await api.post(`/fee-structures/${archiveTarget._id}/${action}`);
      toast.success(archiveTarget.isArchived ? 'Fee structure restored' : 'Fee structure archived');
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateFees() {
    if (!generateTarget) return;
    setBusy(true);
    try {
      const res = await api.post<ApiDataResponse<{ created: number; skipped: number }>>('/student-fees/generate', {
        sessionId: generateTarget.sessionId,
        classId: generateTarget.classId,
        feeStructureId: generateTarget._id,
      });
      setGenerateResult(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setGenerateTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function renderMatrix() {
    if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
    if (matrixData.length === 0) return <div className="py-12 text-center text-muted-foreground bg-white rounded-xl border border-slate-200">No monthly tuition structures found.</div>;

    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700 sticky left-0 z-20 bg-slate-50 border-r border-slate-200 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Class</th>
                {MONTHS.map((month) => (
                  <th key={month} className="px-3 py-3 font-semibold text-slate-600 text-center min-w-[110px]">{month.slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrixData.map((row) => (
                <tr key={row.classId} className="group/tr hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-medium sticky left-0 z-10 bg-white group-hover/tr:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-slate-800 transition-colors">
                    {row.className}
                  </td>
                  {MONTHS.map((_, i) => {
                    const monthNum = i + 1;
                    const fee = row.months[monthNum];
                    return (
                      <td key={monthNum} className="px-2 py-2 text-center border-l border-slate-100 first:border-l-0 relative group/cell">
                        {fee ? (
                          <div className="flex flex-col items-center justify-center min-h-[44px]">
                            {fee.isArchived ? (
                              <span className="text-[11px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 uppercase tracking-wider">Archived</span>
                            ) : (
                              <span className="font-semibold text-slate-700">{formatCurrency(fee.amount)}</span>
                            )}
                            
                            {/* Hover Actions Block */}
                            <div className="absolute inset-0 bg-white/95 flex items-center justify-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity backdrop-blur-[2px] z-10">
                               {canCreate && !fee.isArchived && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700" onClick={() => setGenerateTarget(fee)} title="Generate Fees">
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                               )}
                               {canEdit && !fee.isArchived && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-slate-600 hover:bg-slate-100" onClick={() => openEdit(fee)} title="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                               )}
                               {canEdit && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50" onClick={() => setArchiveTarget(fee)} title={fee.isArchived ? "Restore" : "Archive"}>
                                  {fee.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                </Button>
                               )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-light">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Structures & Rules"
        description="Define tuition rates, admission, exam fees, and billing cycles per class."
        crumbs={[{ label: 'Finance' }, { label: 'Fees' }]}
        actions={canCreate && (
          <Button
            onClick={openCreate}
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all"
          >
            <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" /> New Fee
          </Button>
        )}
      />

      {/* Finance Navigation Hub */}
      <FinanceNavHeader />

      <div className="filter-toolbar mb-4 flex flex-wrap items-center gap-3">
        <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setClassId('all'); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={classId} onValueChange={(v) => { setClassId(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={feeType} onValueChange={(v) => { setFeeType(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Fee type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(FEE_TYPES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {feeType === 'monthly_tuition' ? (
        renderMatrix()
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          rowKey={(r) => r._id}
          pagination={pagination}
          onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
          onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
          emptyTitle="No fee structures"
          emptyDescription={canCreate ? 'Define the first fee for this session.' : undefined}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit fee' : 'New fee structure'}</DialogTitle>
            <DialogDescription>Amounts are stored as integers in the smallest currency unit — no floating-point rounding.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fee-title">Title</Label>
              <Input id="fee-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly Tuition" maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Class</Label>
                <Select value={formClassId} onValueChange={setFormClassId} disabled={Boolean(editing)}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={formFeeType} onValueChange={setFormFeeType} disabled={Boolean(editing)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FEE_TYPES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formFeeType === 'monthly_tuition' && (
              <div className="grid gap-1.5">
                <Label>Month</Label>
                <Select value={monthVal} onValueChange={setMonthVal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((name, i) => <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="fee-amount">Amount (PKR)</Label>
                <Input id="fee-amount" type="number" min={0.01} step={0.01} value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="2500.00" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fee-due">Due date</Label>
                <Input id="fee-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fee-desc">Description</Label>
              <Textarea id="fee-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create fee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Restore fee structure?' : 'Archive fee structure?'}
        description={archiveTarget?.isArchived ? 'The fee becomes active again.' : 'The fee will be hidden from lists. Existing student fee rows and payments are kept.'}
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        onConfirm={toggleArchive}
        loading={busy}
      />

      <Dialog open={Boolean(generateTarget)} onOpenChange={(o) => !o && setGenerateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate student fees</DialogTitle>
            <DialogDescription>
              Creates a fee row for every active student in <b>{generateTarget?.className ?? 'the class'}</b> for
              “{generateTarget?.title}”. Students who already have this fee are skipped.
            </DialogDescription>
          </DialogHeader>
          {generateResult ? (
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                <p><span className="font-semibold">{generateResult.created}</span> fee row{generateResult.created === 1 ? '' : 's'} created</p>
                <p><span className="font-semibold">{generateResult.skipped}</span> skipped (already existed)</p>
              </div>
              <DialogFooter>
                <Button onClick={() => { setGenerateTarget(null); setGenerateResult(null); load(); }}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateTarget(null)} disabled={busy}>Cancel</Button>
              <Button onClick={generateFees} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Generate
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
