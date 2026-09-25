
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Sparkles,
  Loader2,
  Layers,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatCurrency, formatDate, toPaisa } from '@/lib/format';
import { useFeeSettings } from '@/hooks/useFeeSettings';

const FEE_TYPES: Record<string, string> = {
  monthly_tuition: 'Monthly Tuition',
  admission_fee: 'Admission Fee',
  other: 'Other Fee',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
  isArchived: boolean;
}

interface ClassRow {
  _id: string;
  name: string;
  sessionId: string;
  isArchived: boolean;
}

interface FeeRow {
  _id: string;
  sessionId: string;
  classId: string;
  feeType: string;
  title: string;
  amount: number;
  month: number | null;
  effectiveFromMonth: number | null;
  effectiveFromYear: number | null;
  dueDate: string | null;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  className?: string;
  sessionName?: string;
}

export function FeeSetupPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { hasDueDate, defaultDueDay } = useFeeSettings();

  const [data, setData] = useState<FeeRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('all');
  const [feeType, setFeeType] = useState('monthly_tuition');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  // Structure Form Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeeRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Form Fields
  const [formSessionId, setFormSessionId] = useState('');
  const [formFeeType, setFormFeeType] = useState('monthly_tuition');
  const [formTitle, setFormTitle] = useState('');
  const [formMonth, setFormMonth] = useState<number | null>(null);
  const [formEffectiveFromMonth, setFormEffectiveFromMonth] = useState<number | null>(null);
  const [formEffectiveFromYear, setFormEffectiveFromYear] = useState<number | null>(null);
  const [formDueDate, setFormDueDate] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRows, setFormRows] = useState<{ classId: string; amountPkr: string }[]>([{ classId: '', amountPkr: '' }]);

  // Generation Modal
  const [generateTarget, setGenerateTarget] = useState<FeeRow | null>(null);
  const [genMonth, setGenMonth] = useState<number>(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState<number>(new Date().getFullYear());
  const [genBusy, setGenBusy] = useState(false);
  const [genEligibleCount, setGenEligibleCount] = useState<number | null>(null);
  const [genExistingCount, setGenExistingCount] = useState<number | null>(null);
  const [genCheckLoading, setGenCheckLoading] = useState(false);

  // Archive Target
  const [archiveTarget, setArchiveTarget] = useState<FeeRow | null>(null);

  const canCreate = can('fees', 'create');
  const canEdit = can('fees', 'edit');

  // Load Sessions
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions/lookup')
      .then((r) => {
        if (mounted && r.data?.data) {
          const valid = r.data.data.filter((s) => !s.isArchived);
          setSessions(valid);
          const active = valid.find((s) => s.isActive);
          if (active) {
            setSessionId(active._id);
            setFormSessionId(active._id);
          } else if (valid.length > 0) {
            setSessionId(valid[0]._id);
            setFormSessionId(valid[0]._id);
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Load Classes for selected session
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    api
      .get<ApiListResponse<ClassRow>>(`/classes/lookup?sessionId=${sessionId}`)
      .then((r) => {
        if (mounted && r.data?.data) {
          setClasses(r.data.data.filter((c) => !c.isArchived));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Load Structures
  const loadStructures = useCallback(async () => {
    setLoading(true);
    try {
      const limitToUse = feeType === 'monthly_tuition' ? 500 : pagination.limit;
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(limitToUse),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (classId && classId !== 'all') params.set('classId', classId);
      if (feeType !== 'all') params.set('feeType', feeType);

      const res = await api.get<ApiListResponse<FeeRow>>(`/fee-structures?${params}`);
      setData(res.data.data);
      if (feeType !== 'monthly_tuition') {
        setPagination(res.data.pagination);
      } else {
        setPagination(prev => ({ 
          ...prev, 
          total: res.data.pagination.total, 
          totalPages: Math.ceil(res.data.pagination.total / limitToUse) 
        }));
      }
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sessionId, classId, feeType]);

  useEffect(() => {
    loadStructures();
  }, [loadStructures]);

  function openCreate() {
    setEditing(null);
    setFormSessionId(sessionId || (sessions[0]?._id ?? ''));
    setFormFeeType('monthly_tuition');
    setFormTitle('');
    setFormMonth(null);
    setFormEffectiveFromMonth(null);
    setFormEffectiveFromYear(null);
    setFormDueDate('');
    setFormDesc('');
    setFormRows([{ classId: classes[0]?._id ?? '', amountPkr: '' }]);
    setFormOpen(true);
  }

  function openEdit(row: FeeRow) {
    setEditing(row);
    setFormSessionId(row.sessionId);
    setFormFeeType(row.feeType);
    setFormTitle(row.title);
    setFormMonth(row.month);
    setFormEffectiveFromMonth(row.effectiveFromMonth);
    setFormEffectiveFromYear(row.effectiveFromYear);
    setFormDueDate(row.dueDate ? row.dueDate.split('T')[0] : '');
    setFormDesc(row.description || '');
    setFormRows([{ classId: row.classId, amountPkr: String(row.amount / 100) }]);
    setFormOpen(true);
  }

  async function handleSaveStructure(e: React.FormEvent) {
    e.preventDefault();
    if (formFeeType !== 'monthly_tuition' && !formTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    
    // Validation
    for (let i = 0; i < formRows.length; i++) {
      const row = formRows[i];
      if (!row.classId) return toast.error(`Please select a class in row ${i + 1}`);
      const amt = parseFloat(row.amountPkr);
      if (isNaN(amt) || amt <= 0) return toast.error(`Please enter a valid amount in row ${i + 1}`);
    }

    setBusy(true);

    try {
      const hasDueDate = formFeeType === 'monthly_tuition' || formFeeType === 'monthly_transport' || formFeeType === 'hostel_fee';
      const basePayload: any = {
        title: formFeeType === 'monthly_tuition' ? 'Monthly Tuition' : formTitle, // Fallback, backend overrides
        description: formDesc,
      };

      if (formFeeType === 'monthly_tuition' || formFeeType === 'monthly_transport' || formFeeType === 'hostel_fee') {
        basePayload.month = formMonth || null;
      }

      basePayload.effectiveFromMonth = formEffectiveFromMonth || null;
      basePayload.effectiveFromYear = formEffectiveFromYear || null;

      if (hasDueDate && formDueDate) {
        basePayload.dueDate = new Date(formDueDate).toISOString();
      }

      if (editing) {
        const amt = parseFloat(formRows[0].amountPkr);
        await api.patch(`/fee-structures/${editing._id}`, {
          ...basePayload,
          amount: toPaisa(amt),
        });
        toast.success('Fee structure updated successfully');
      } else {
        const promises = formRows.map(row => {
          return api.post('/fee-structures', {
            ...basePayload,
            sessionId: formSessionId,
            classId: row.classId,
            feeType: formFeeType,
            amount: toPaisa(parseFloat(row.amountPkr)),
          });
        });
        await Promise.all(promises);
        toast.success(`${formRows.length} Fee structure(s) created successfully`);
      }
      setFormOpen(false);
      loadStructures();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Pre-check eligible student count when generation dialog opens or month/year changes
  const loadGenPreCheck = useCallback(async (target: FeeRow, m: number, y: number) => {
    setGenCheckLoading(true);
    try {
      // Count eligible students (active, non-archived, in this class/session)
      const stuRes = await api.get<ApiListResponse<{ _id: string }>>(
        `/students?sessionId=${target.sessionId}&classId=${target.classId}&limit=1&isActive=true`
      );
      const eligibleTotal = stuRes.data?.pagination?.total ?? 0;
      setGenEligibleCount(eligibleTotal);

      // Count already-generated invoices for this month/year
      const feeRes = await api.get<ApiListResponse<{ _id: string }>>(
        `/student-fees?sessionId=${target.sessionId}&classId=${target.classId}&feeType=monthly_tuition&month=${m}&limit=1`
      );
      setGenExistingCount(feeRes.data?.pagination?.total ?? 0);
    } catch {
      setGenEligibleCount(null);
      setGenExistingCount(null);
    } finally {
      setGenCheckLoading(false);
    }
  }, []);

  async function handleBatchGenerate() {
    if (!generateTarget) return;
    setGenBusy(true);
    try {
      const payload = {
        sessionId: generateTarget.sessionId,
        classId: generateTarget.classId,
        feeStructureId: generateTarget._id,
        month: genMonth,
        year: genYear,
      };

      const res = await api.post<{ success: boolean; data: { created: number; skipped: number } }>(
        '/student-fees/generate',
        payload
      );

      const { created, skipped } = res.data.data;
      toast.success(
        `Generated ${created} invoices successfully! (${skipped} already existing were skipped)`,
        { duration: 5000 }
      );
      setGenerateTarget(null);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setGenBusy(false);
    }
  }

  async function toggleArchive(row: FeeRow) {
    try {
      if (row.isArchived) {
        await api.post(`/fee-structures/${row._id}/restore`);
        toast.success('Fee structure restored');
      } else {
        await api.post(`/fee-structures/${row._id}/archive`);
        toast.success('Fee structure archived');
      }
      setArchiveTarget(null);
      loadStructures();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    }
  }

  const columns: Column<FeeRow>[] = [
    {
      key: 'title',
      header: 'Structure Title',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-semibold text-foreground">{row.title}</p>
          <p className="text-xs text-muted-foreground">{FEE_TYPES[row.feeType] ?? row.feeType}</p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class / Session',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium text-foreground">{row.className || 'Class'}</p>
          <p className="text-[11px] text-muted-foreground">{row.sessionName || 'Session'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Base Amount',
      cell: (row) => (
        <span className="font-bold text-foreground">{formatCurrency(row.amount)}</span>
      ),
    },
    {
      key: 'month',
      header: 'Month / Schedule',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.feeType === 'monthly_tuition' && row.month
            ? MONTHS[row.month - 1]
            : row.feeType === 'admission_fee'
            ? 'One-Time / Admission'
            : 'As Scheduled'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge
          variant={row.isArchived ? 'outline' : row.isActive ? 'default' : 'secondary'}
          className={
            row.isArchived
              ? 'border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-950/40 text-[10px]'
              : row.isActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]'
              : 'text-[10px]'
          }
        >
          {row.isArchived ? 'Archived' : row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.feeType === 'monthly_tuition' && !row.isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const m = row.month || new Date().getMonth() + 1;
                const y = new Date().getFullYear();
                setGenerateTarget(row);
                setGenMonth(m);
                setGenYear(y);
                setGenEligibleCount(null);
                setGenExistingCount(null);
                loadGenPreCheck(row, m, y);
              }}
              className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/5"
            >
              <Calendar className="h-3.5 w-3.5" /> Generate
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Transform data for Matrix view
  const matrixData = useMemo(() => {
    if (feeType !== 'monthly_tuition') return [];
    const grouped = new Map<string, { classId: string; className: string; sessionName: string; months: Record<number, FeeRow> }>();
    
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
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700" 
                                  onClick={() => {
                                    const m = fee.month || new Date().getMonth() + 1;
                                    const y = new Date().getFullYear();
                                    setGenerateTarget(fee);
                                    setGenMonth(m);
                                    setGenYear(y);
                                    setGenEligibleCount(null);
                                    setGenExistingCount(null);
                                    loadGenPreCheck(fee, m, y);
                                  }}
                                  title="Generate Fees"
                                >
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
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <PageHeader title="Fee Structures" description="Manage class fee structures" />
        <FeesNavHeader />

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map(s => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={feeType} onValueChange={setFeeType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Fee Type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FEE_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Structure
          </Button>
        </div>

        {feeType === 'monthly_tuition' ? (
          renderMatrix()
        ) : (
          <DataTable
            columns={columns}
            data={data}
            loading={loading}
            pagination={pagination}
            onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
            onLimitChange={(limit) => setPagination(prev => ({ ...prev, limit, page: 1 }))}
            rowKey={r => r._id}
          />
        )}

        {/* Create / Edit Form Dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Fee Structure' : 'Create Fee Structure'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Update the details for this fee structure.' : 'Set up a new fee structure for classes.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveStructure} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Academic Session</Label>
                  <Select value={formSessionId} onValueChange={setFormSessionId} disabled={!!editing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sessions.map(s => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fee Type</Label>
                  <Select value={formFeeType} onValueChange={setFormFeeType} disabled={!!editing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FEE_TYPES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formFeeType !== 'monthly_tuition' && (
                <div className="space-y-2">
                  <Label>Structure Title</Label>
                  <Input
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. Monthly Tuition Fee 2024"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Additional details..."
                />
              </div>

              {(formFeeType === 'monthly_tuition' || formFeeType === 'monthly_transport' || formFeeType === 'hostel_fee') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Applicable Month (1-12)</Label>
                    <Select
                      value={formMonth ? String(formMonth) : ""}
                      onValueChange={v => setFormMonth(v ? Number(v) : null)}
                    >
                      <SelectTrigger><SelectValue placeholder="All Months" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value=" ">All Months (Default)</SelectItem>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Class Amounts</Label>
                  {!editing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormRows([...formRows, { classId: classes[0]?._id ?? '', amountPkr: '' }])}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Class
                    </Button>
                  )}
                </div>
                
                {formRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <Select
                      value={row.classId}
                      onValueChange={v => {
                        const newRows = [...formRows];
                        newRows[idx].classId = v;
                        setFormRows(newRows);
                      }}
                      disabled={!!editing}
                    >
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">Rs</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="pl-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="Amount"
                        value={row.amountPkr}
                        onChange={e => {
                          const newRows = [...formRows];
                          newRows[idx].amountPkr = e.target.value;
                          setFormRows(newRows);
                        }}
                      />
                    </div>

                    {!editing && formRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-rose-500"
                        onClick={() => {
                          const newRows = [...formRows];
                          newRows.splice(idx, 1);
                          setFormRows(newRows);
                        }}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {editing ? 'Save Changes' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Generate Dialog */}
        <Dialog open={!!generateTarget} onOpenChange={open => !open && setGenerateTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Monthly Invoices</DialogTitle>
              <DialogDescription>
                Generate fees for {generateTarget?.className} - {FEE_TYPES[generateTarget?.feeType || '']}
              </DialogDescription>
            </DialogHeader>

            {genCheckLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select value={String(genMonth)} onValueChange={v => setGenMonth(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select value={String(genYear)} onValueChange={v => setGenYear(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2].map(offset => {
                          const y = new Date().getFullYear() + offset - 1;
                          return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border p-4 bg-muted/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Eligible Active Students:</span>
                    <span className="font-medium">{genEligibleCount ?? '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Already Generated:</span>
                    <span className="font-medium text-amber-600">{genExistingCount ?? '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2 mt-2">
                    <span className="text-muted-foreground">To Generate Now:</span>
                    <span className="font-bold text-primary">
                      {genEligibleCount !== null && genExistingCount !== null 
                        ? Math.max(0, genEligibleCount - genExistingCount) 
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateTarget(null)}>Cancel</Button>
              <Button onClick={handleBatchGenerate} disabled={genBusy || genCheckLoading}>
                {genBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Generate Invoices
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Archive Dialog */}
        <ConfirmDialog
          open={!!archiveTarget}
          onOpenChange={open => !open && setArchiveTarget(null)}
          title={archiveTarget?.isArchived ? 'Restore Fee Structure?' : 'Archive Fee Structure?'}
          description={archiveTarget?.isArchived 
            ? 'This will make the fee structure active again.' 
            : 'Archived structures will not be used for new students but existing invoices remain intact.'}
          onConfirm={() => toggleArchive(archiveTarget!)}


        />
      </div>
    );
  }
