import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Filter,
  CreditCard,
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatCurrency, percent, downloadCsv, formatStudentIdentity } from '@/lib/format';
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

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
}

interface ClassRow {
  _id: string;
  name: string;
}

interface SectionRow {
  _id: string;
  name: string;
  classId: string;
}

interface ClassSummaryStudent {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  rollNumber?: string;
  invoiceId: string | null;
  netPayable: number;
  amountPaid: number;
  remainingBalance: number;
  previousOutstanding: number;
  totalOutstanding: number;
  status: 'paid' | 'partial' | 'unpaid' | 'not_generated';
  dueDate: string | null;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  caste?: string | null;
}

interface ClassSummaryResponse {
  summary: {
    totalStudents: number;
    totalExpected: number;
    totalCollected: number;
    totalRemaining: number;
    totalPreviousOutstanding: number;
    totalAllOutstanding: number;
    collectionRate: number;
  };
  students: ClassSummaryStudent[];
}

export function ClassCollectionPage() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);

  const [sessionId, setSessionId] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [sectionId, setSectionId] = useState<string>('all');
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const [data, setData] = useState<ClassSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

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
          else if (r.data.data.length > 0) setSessionId(r.data.data[0]._id);
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
          if (r.data.data.length > 0) setClassId(r.data.data[0]._id);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Load Sections
  useEffect(() => {
    if (!classId) return;
    let mounted = true;
    api
      .get<ApiListResponse<SectionRow>>(`/sections/lookup?classId=${classId}`)
      .then((r) => {
        if (mounted && r.data?.data) {
          setSections(r.data.data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [classId]);

  // Fetch Class Summary Data
  const loadClassSummary = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId,
        month: String(month),
        year: String(year),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (sectionId && sectionId !== 'all') params.set('sectionId', sectionId);

      const res = await api.get<ApiDataResponse<ClassSummaryResponse>>(
        `/student-fees/class-summary?${params}`
      );
      setData(res.data.data);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId, sessionId, sectionId, month, year]);

  useEffect(() => {
    loadClassSummary();
  }, [loadClassSummary]);

  function exportClassCollectionCsv() {
    if (!data?.students?.length) {
      toast.error('No class records to export');
      return;
    }
    const headers = [
      'Roll Number', 
      'Admission Number', 
      'Student Name', 
      'Current Payable (PKR)', 
      'Paid (PKR)', 
      'Current Remaining (PKR)', 
      'Previous Outstanding (PKR)', 
      'Total Outstanding (PKR)', 
      'Status'
    ];
    const rows = data.students.map((s) => [
      s.rollNumber || '—',
      s.admissionNumber,
      formatStudentIdentity(s),
      (s.netPayable / 100).toFixed(2),
      (s.amountPaid / 100).toFixed(2),
      (s.remainingBalance / 100).toFixed(2),
      (s.previousOutstanding / 100).toFixed(2),
      (s.totalOutstanding / 100).toFixed(2),
      s.status.toUpperCase(),
    ]);
    downloadCsv(`Class_Collection_${MONTHS[month - 1]}_${year}`, [headers, ...rows]);
    toast.success('Class collection sheet exported to CSV');
  }

  const s = data?.summary;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Class-wise Collection"
        description="Class and section fee recovery ledger, individual student balances, and quick cashier actions"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportClassCollectionCsv}
              disabled={!data?.students?.length}
              className="h-9 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!data?.students?.length}
              className="h-9 gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Roster
            </Button>
          </div>
        }
      />

      <FeesNavHeader activeTab="class-collection" />

      {/* Filter Control Bar */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {/* Session */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Session</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((ses) => (
                <SelectItem key={ses._id} value={ses._id}>
                  {ses.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Class */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select Class" />
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

        {/* Section */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Section</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sections.map((sec) => (
                <SelectItem key={sec._id} value={sec._id}>
                  {sec.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Month */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, idx) => (
                <SelectItem key={m} value={String(idx + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Year</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 text-xs"
          />
        </div>
      </div>

      {/* Class Summary KPI Cards */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Total Enrolled
              </span>
              <div className="text-xl font-bold text-foreground mt-1">{s.totalStudents} Students</div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Expected Dues
              </span>
              <div className="text-xl font-bold text-foreground mt-1">
                {formatCurrency(s.totalExpected)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Collected Dues
              </span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(s.totalCollected)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {s.collectionRate.toFixed(1)}% recovery rate
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Pending Balance (Current)
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(s.totalRemaining)}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Total All Outstanding
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(s.totalAllOutstanding)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Student Collection Roster Table */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Class Student Fee Ledger ({MONTHS[month - 1]} {year})
          </CardTitle>
          <CardDescription className="text-xs">
            Shows each student's net obligation, recorded payments, remaining balance, and status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-y border-border/60 text-muted-foreground uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Roll</th>
                  <th className="px-4 py-2.5 font-semibold">Student Name</th>
                  <th className="px-4 py-2.5 font-semibold">Admission #</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Current Payable</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Paid</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Curr. Remaining</th>
                  <th className="px-4 py-2.5 font-semibold text-right text-amber-700/80 dark:text-amber-400/80">Prev. Outstanding</th>
                  <th className="px-4 py-2.5 font-semibold text-right text-rose-700/80 dark:text-rose-400/80">Total Due</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Loading class fee records...
                      </div>
                    </td>
                  </tr>
                ) : data?.students && data.students.length > 0 ? (
                  data.students.map((st) => (
                    <tr key={st.studentId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {st.rollNumber || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{formatStudentIdentity(st)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{st.admissionNumber}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {st.status === 'not_generated' ? '—' : formatCurrency(st.netPayable)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {st.status === 'not_generated' ? '—' : formatCurrency(st.amountPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-rose-600/70">
                        {st.status === 'not_generated' ? '—' : formatCurrency(st.remainingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">
                        {st.previousOutstanding > 0 ? formatCurrency(st.previousOutstanding) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">
                        {formatCurrency(st.totalOutstanding)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            st.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 text-[10px]'
                              : st.status === 'partial'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 text-[10px]'
                              : st.status === 'not_generated'
                              ? 'bg-muted text-muted-foreground border-border text-[10px]'
                              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 text-[10px]'
                          }
                        >
                          {st.status === 'not_generated' ? 'NOT GENERATED' : st.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/fees/collect?studentId=${st.studentId}&month=${month}&year=${year}`
                            )
                          }
                          className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                        >
                          <CreditCard className="h-3 w-3" />
                          Collect
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                      No student fee records found for this class in {MONTHS[month - 1]} {year}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
