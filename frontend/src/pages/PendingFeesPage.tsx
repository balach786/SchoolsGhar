import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  CreditCard,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Users,
  Calendar,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, downloadCsv } from '@/lib/format';
import { useFeeSettings } from '@/hooks/useFeeSettings';
import { useAuth } from '@/context/AuthContext';

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

interface PendingFeeRow {
  _id: string;
  studentId: string;
  sessionId: string;
  classId: string;
  sectionId?: string;
  title: string;
  feeType: string;
  month: number | null;
  billingMonth: number | null;
  billingYear: number | null;
  dueDate: string | null;
  originalAmount: number;
  discountAmount: number;
  fineAmount: number;
  otherFeeAmount: number;
  netPayable: number;
  amountPaid: number;
  remainingBalance: number;
  status: 'unpaid' | 'partial' | 'paid';
  studentName?: string;
  admissionNumber?: string;
  rollNumber?: string;
  className?: string;
  sectionName?: string;
}

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
}

interface ClassRow {
  _id: string;
  name: string;
}

export function PendingFeesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { hasLateFee } = useFeeSettings();

  const [data, setData] = useState<PendingFeeRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [classId, setClassId] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);

  // Summary stats
  const [totalPendingPaisa, setTotalPendingPaisa] = useState<number>(0);

  // Load Sessions
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions/lookup')
      .then((r) => {
        if (mounted && r.data?.data) {
          setSessions(r.data.data);
          const active = r.data.data.find((s) => s.isActive);
          if (active) setSessionId(active._id);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Load Classes
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    api
      .get<ApiListResponse<ClassRow>>(`/classes/lookup?sessionId=${sessionId}`)
      .then((r) => {
        if (mounted && r.data?.data) {
          setClasses(r.data.data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Load Pending Fees
  const loadPendingFees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        status: 'unpaid', // API accepts status or comma separated
      });

      if (sessionId) params.set('sessionId', sessionId);
      if (classId && classId !== 'all') params.set('classId', classId);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<ApiListResponse<PendingFeeRow>>(`/student-fees?${params}`);
      let rows = res.data.data;

      // Filter overdue if requested
      if (overdueOnly) {
        const now = new Date().getTime();
        rows = rows.filter((r) => r.dueDate && new Date(r.dueDate).getTime() < now);
      }

      setData(rows);
      setPagination(res.data.pagination);

      // Sum pending amount
      const total = rows.reduce((sum, r) => sum + r.remainingBalance, 0);
      setTotalPendingPaisa(total);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sessionId, classId, search, overdueOnly]);

  useEffect(() => {
    loadPendingFees();
  }, [loadPendingFees]);

  function exportDefaultersCsv() {
    if (!data.length) {
      toast.error('No records to export');
      return;
    }
    const headers = [
      'Student Name',
      'Admission Number',
      'Roll Number',
      'Class',
      'Fee Title',
      'Due Date',
      'Net Payable (PKR)',
      'Paid (PKR)',
      'Remaining Balance (PKR)',
      'Status',
    ];
    const rows = data.map((r) => [
      r.studentName || 'Student',
      r.admissionNumber || '—',
      r.rollNumber || '—',
      r.className || '—',
      r.title,
      formatDate(r.dueDate),
      (r.netPayable / 100).toFixed(2),
      (r.amountPaid / 100).toFixed(2),
      (r.remainingBalance / 100).toFixed(2),
      r.status.toUpperCase(),
    ]);
    downloadCsv('Pending_Defaulters_List', [headers, ...rows]);
    toast.success('Defaulters list exported to CSV');
  }

  const columns: Column<PendingFeeRow>[] = [
    {
      key: 'student',
      header: 'Student Info',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-semibold text-foreground">{row.studentName || 'Student'}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.admissionNumber} • Roll #{row.rollNumber || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class / Section',
      cell: (row) => (
        <span className="text-xs text-foreground font-medium">
          {row.className || 'Class'} {row.sectionName ? `(${row.sectionName})` : ''}
        </span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee Obligation',
      cell: (row) => {
        const m = row.billingMonth || row.month;
        const isCurrent = m === (new Date().getMonth() + 1) && row.billingYear === new Date().getFullYear();
        return (
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-foreground">{row.title}</p>
              {isCurrent ? (
                <Badge variant="outline" className="text-[9px] bg-blue-50/50 text-blue-600 border-blue-200 uppercase tracking-wider font-semibold py-0">Current</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] bg-amber-50/50 text-amber-600 border-amber-200 uppercase tracking-wider font-semibold py-0">Previous</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {m ? `${MONTHS[m - 1]} ${row.billingYear || ''}` : 'One-Time'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'dueDate',
      header: 'Due Date / Urgency',
      cell: (row) => {
        if (!row.dueDate) return <span className="text-xs text-muted-foreground">—</span>;
        const due = new Date(row.dueDate);
        const now = new Date();
        const isPast = due.getTime() < now.getTime();
        const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));

        return (
          <div className="leading-tight">
            <p className="text-xs text-foreground">{formatDate(row.dueDate)}</p>
            {isPast ? (
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 mt-0.5">
                {diffDays} days overdue
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 mt-0.5">
                Current
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'fine',
      header: 'Late Fine',
      cell: (row) => (
        <span className="text-xs font-semibold text-purple-600">
          {row.fineAmount > 0 ? formatCurrency(row.fineAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'Net Payable',
      cell: (row) => (
        <span className="text-xs font-medium text-foreground">{formatCurrency(row.netPayable)}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Pending Balance',
      cell: (row) => (
        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
          {formatCurrency(row.remainingBalance)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/fees/collect?studentId=${row.studentId}`)}
          className="h-8 gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/5"
        >
          <CreditCard className="h-3 w-3" />
          Collect
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Pending Fees & Defaulters"
        description="Monitor outstanding student fee accounts, overdue days, assessed late fines, and initiate collections"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportDefaultersCsv}
            disabled={!data.length}
            className="h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Defaulters CSV
          </Button>
        }
      />

      <FeesNavHeader activeTab="pending" />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/70 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Pending Defaulter Invoices
              </span>
              <div className="text-2xl font-bold text-foreground mt-0.5">
                {pagination.total} Invoices
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-xs sm:col-span-2">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Total Uncollected Arrears
              </span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                {formatCurrency(totalPendingPaisa)}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Previous unpaid balances stay strictly separated</p>
              <p className="text-[11px] text-primary font-medium">Historical snapshots are fully preserved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {sessions.length > 0 && (
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-44 h-8 text-xs bg-background">
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-40 h-8 text-xs bg-background">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search student or roll #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-48 bg-background"
            />
          </div>
        </div>

        {/* Overdue Switch */}
        <div className="flex items-center gap-2">
          <Switch
            id="overdueToggle"
            checked={overdueOnly}
            onCheckedChange={setOverdueOnly}
          />
          <Label htmlFor="overdueToggle" className="text-xs cursor-pointer select-none">
            Past Due Date Only
          </Label>
        </div>
      </div>

      {/* Pending Fees Table */}
      <DataTable<PendingFeeRow>
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
        emptyTitle="No pending fee invoices found. All students are in good standing!"
      />
    </div>
  );
}
