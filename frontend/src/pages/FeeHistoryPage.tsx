import { useCallback, useEffect, useState, useRef } from 'react';
import {
  History,
  Search,
  Download,
  AlertCircle,
  Loader2,
  User,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, downloadCsv, formatStudentIdentity } from '@/lib/format';

interface StudentSearchResult {
  _id: string;
  fullName: string;
  admissionNumber: string;
  rollNumber?: string;
  className?: string;
  sectionName?: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  guardianPhone?: string;
}

interface LedgerRow {
  date: string;
  kind: 'charge' | 'payment' | 'reversal';
  feeType: string;
  month: number | null;
  title: string;
  charge: number;
  discount: number;
  scholarship: number;
  fine: number;
  payment: number;
  receipt: string | null;
  balance: number;
}

export function FeeHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);

  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Student Search Logic
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(() => {
      setSearchLoading(true);
      api
        .get<ApiListResponse<StudentSearchResult>>(`/students?search=${encodeURIComponent(searchQuery)}&limit=10`)
        .then((res) => setSearchResults(res.data.data))
        .catch(() => toast.error('Failed to search students'))
        .finally(() => setSearchLoading(false));
    }, 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  const loadLedger = useCallback(async (studentId: string) => {
    setLedgerLoading(true);
    try {
      const res = await api.get<{ data: { rows: LedgerRow[]; closingBalance: number } }>(
        `/finance/reports/student-ledger?studentId=${studentId}`
      );
      setLedger(res.data.data.rows);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      loadLedger(selectedStudent._id);
    }
  }, [selectedStudent, loadLedger]);

  function exportLedgerCsv() {
    if (!ledger.length || !selectedStudent) {
      toast.error('No ledger records to export');
      return;
    }
    const headers = [
      'Date',
      'Transaction Type',
      'Title / Description',
      'Charge (PKR)',
      'Payment / Credit (PKR)',
      'Receipt',
      'Running Balance (PKR)',
    ];
    const rows = ledger.map((r) => [
      formatDate(r.date),
      r.kind.toUpperCase(),
      r.title,
      r.charge > 0 ? (r.charge / 100).toFixed(2) : '—',
      r.payment > 0 ? (r.payment / 100).toFixed(2) : '—',
      r.receipt || '—',
      (r.balance / 100).toFixed(2),
    ]);
    downloadCsv(`Ledger_${selectedStudent.admissionNumber}_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
    toast.success('Student ledger exported to CSV');
  }

  const columns: Column<LedgerRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-semibold text-foreground">{formatDate(row.date)}</p>
          <p className="text-[10px] text-muted-foreground">{new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (row) => (
        <div className="flex items-start gap-2">
          {row.kind === 'charge' && <ArrowUpRight className="h-4 w-4 text-rose-500 mt-0.5" />}
          {row.kind === 'payment' && <ArrowDownRight className="h-4 w-4 text-emerald-500 mt-0.5" />}
          {row.kind === 'reversal' && <RefreshCcw className="h-4 w-4 text-amber-500 mt-0.5" />}
          <div>
            <p className="font-semibold text-foreground">{row.title}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{row.kind}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'receipt',
      header: 'Receipt #',
      cell: (row) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.receipt || '—'}
        </span>
      ),
    },
    {
      key: 'charge',
      header: 'Debit (Charge)',
      cell: (row) => (
        <span className={`text-xs font-semibold ${row.charge > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
          {row.charge > 0 ? formatCurrency(row.charge) : '—'}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Credit (Payment)',
      cell: (row) => (
        <span className={`text-xs font-semibold ${row.payment > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {row.payment > 0 ? formatCurrency(row.payment) : '—'}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Running Balance',
      cell: (row) => (
        <span
          className={`text-sm font-bold ${
            row.balance > 0 ? 'text-rose-600' : row.balance < 0 ? 'text-emerald-600' : 'text-foreground'
          }`}
        >
          {formatCurrency(row.balance)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee History & True Ledger"
        description="Chronological view of all fee charges, payments, and reversals for a complete financial picture."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportLedgerCsv}
            disabled={!ledger.length}
            className="h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Ledger CSV
          </Button>
        }
      />

      <FeesNavHeader activeTab="history" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Search & Selection */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Find Student
              </CardTitle>
              <CardDescription className="text-xs">
                Search by Student Name, Roll Number, or Admission Number to load their ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type name, roll, admission #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Results List */}
              {searchResults.length > 0 && (
                <div className="max-h-60 overflow-y-auto divide-y divide-border/60 rounded-xl border border-border/70 bg-muted/20">
                  {searchResults.map((s) => (
                    <div
                      key={s._id}
                      onClick={() => {
                        setSelectedStudent(s);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="p-2.5 hover:bg-primary/5 transition-colors cursor-pointer text-xs flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{formatStudentIdentity(s)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {s.className || 'Class'} • Roll #{s.rollNumber || '—'}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {s.admissionNumber}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedStudent && (
            <Card className="border-border/70 shadow-xs bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {formatStudentIdentity(selectedStudent)}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-background">
                    {selectedStudent.admissionNumber}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>
                    Class:{' '}
                    <span className="font-medium text-foreground">
                      {selectedStudent.className || '—'} ({selectedStudent.sectionName || '—'})
                    </span>
                  </p>
                  <p>
                    Guardian:{' '}
                    <span className="font-medium text-foreground">
                      {selectedStudent.guardianName || '—'}
                    </span>
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full h-8 text-xs mt-2 bg-background border"
                  onClick={() => loadLedger(selectedStudent._id)}
                >
                  <RefreshCcw className="h-3 w-3 mr-1" /> Reload Ledger
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Ledger Table */}
        <div className="lg:col-span-3">
          <Card className="border-border/70 shadow-xs h-full">
            <CardContent className="p-0">
              {!selectedStudent ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <History className="h-10 w-10 mb-3 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">No Student Selected</p>
                  <p className="text-xs">Search and select a student to view their chronological ledger.</p>
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={ledger}
                  loading={ledgerLoading}
                  rowKey={(r) => String(r.date) + String(Math.random())}
                  emptyTitle="No financial records found"
                  emptyDescription="This student has no charges or payments recorded yet."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
