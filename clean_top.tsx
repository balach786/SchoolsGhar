import { useCallback, useEffect, useState } from 'react';
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
  const [feeType, setFeeType] = useState('all');
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
      .get<ApiListResponse<SessionRow>>('/academic-sessions?limit=50')
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
      .get<ApiListResponse<ClassRow>>(`/classes?sessionId=${sessionId}&limit=100`)
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
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (classId && classId !== 'all') params.set('classId', classId);
      if (feeType !== 'all') params.set('feeType', feeType);

      const res = await api.get<ApiListResponse<FeeRow>>(`/fee-structures?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
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
    if (!formTitle.trim()) {
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
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.

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
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.
