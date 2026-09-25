import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  Percent,
  Tag,
  ShieldCheck,
  RefreshCw,
  Layers,
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
import { formatCurrency, formatDate, percent, downloadCsv } from '@/lib/format';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useFeeSettings } from '@/hooks/useFeeSettings';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
}

interface FeesSummaryData {
  summary: {
    expectedAmount: number;
    collectedGross: number;
    reversalsAmount: number;
    collectedNet: number;
    pendingAmount: number;
    discountAmount: number;
    fineAmount: number;
    otherFeeAmount: number;
    admissionFeeAmount: number;
    totalInvoices: number;
    paidInvoices: number;
    partialInvoices: number;
    unpaidInvoices: number;
    collectionRate: number;
  };
  methodBreakdown: Array<{ _id: string; totalAmount: number; count: number }>;
  monthlyTrend: Array<{ year?: number; month: number; expected: number; collected: number; pending: number }>;
  year?: number;
}

export function FeeReportsPage() {
  const { hasLateFee, hasOtherFee, hasDiscounts, hasAdmissionFee, otherFeeName } = useFeeSettings();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [data, setData] = useState<FeesSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await api.get<ApiDataResponse<FeesSummaryData>>(
        `/finance/reports/fees-summary?${params}`
      );
      setData(res.data.data);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId, from, to]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  function exportReportCsv() {
    if (!data) return;
    const s = data.summary;
    const rows = [
      ['Total Expected Invoices (PKR)', (s.expectedAmount / 100).toFixed(2)],
      ['Gross Collected Amount (PKR)', (s.collectedGross / 100).toFixed(2)],
      ['Reversals & Refunds (PKR)', (s.reversalsAmount / 100).toFixed(2)],
      ['Net Realized Collection (PKR)', (s.collectedNet / 100).toFixed(2)],
      ['Pending Balance Arrears (PKR)', (s.pendingAmount / 100).toFixed(2)],
      ['Total Discounts Granted (PKR)', (s.discountAmount / 100).toFixed(2)],
      ['Total Late Fines Assessed (PKR)', (s.fineAmount / 100).toFixed(2)],
      [`${otherFeeName} Collected (PKR)`, (s.otherFeeAmount / 100).toFixed(2)],
      ['Admission Fees Collected (PKR)', (s.admissionFeeAmount / 100).toFixed(2)],
      ['Total Invoices Issued', String(s.totalInvoices)],
      ['Fully Settled Invoices', String(s.paidInvoices)],
      ['Partially Settled Invoices', String(s.partialInvoices)],
      ['Unpaid Invoices', String(s.unpaidInvoices)],
      ['Collection Recovery Rate (%)', `${s.collectionRate.toFixed(2)}%`],
    ];
    downloadCsv('Fees_Financial_Audit_Report', [['Financial Metric', 'Value'], ...rows]);
    toast.success('Financial audit report exported to CSV');
  }

  const s = data?.summary;
  const trendData = data?.monthlyTrend?.map((t) => ({
    name: MONTHS[t.month - 1] || `M${t.month}`,
    Expected: t.expected / 100,
    Collected: t.collected / 100,
    Pending: t.pending / 100,
  })) || [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Reports"
        description="Source-record accounting audit, reconciliation metrics, and recovery analysis"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportReportCsv}
              disabled={!data}
              className="h-9 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export Audit CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!data}
              className="h-9 gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Report
            </Button>
          </div>
        }
      />

      <FeesNavHeader activeTab="reports" />

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 shadow-xs flex flex-wrap items-center gap-4">
        {sessions.length > 0 && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Session Filter</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-44 h-8 text-xs bg-background">
                <SelectValue placeholder="All Sessions" />
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
        )}

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Date Range From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs w-36 bg-background"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Date Range To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs w-36 bg-background"
          />
        </div>

        <div className="pt-4 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadReport}
            className="h-8 text-xs gap-1.5 text-primary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Financial Audit Cards */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Expected Obligations
              </span>
              <div className="text-xl font-bold text-foreground mt-1">
                {formatCurrency(s.expectedAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                From {s.totalInvoices} generated invoices
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Net Realized Revenue
              </span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(s.collectedNet)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {s.collectionRate.toFixed(1)}% recovery rate
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Reversals & Refunds
              </span>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {formatCurrency(s.reversalsAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Deducted from gross collection
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Pending Balance Arrears
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(s.pendingAmount)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {s.unpaidInvoices} unpaid, {s.partialInvoices} partial
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auxiliary Charges Breakdown */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF]">
            <span className="text-[11px] text-muted-foreground font-medium">Discounts Granted:</span>
            <p className="text-base font-bold text-amber-600 mt-0.5">
              {formatCurrency(s.discountAmount)}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF]">
            <span className="text-[11px] text-muted-foreground font-medium">Assessed Late Fines:</span>
            <p className="text-base font-bold text-purple-600 mt-0.5">
              {formatCurrency(s.fineAmount)}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF]">
            <span className="text-[11px] text-muted-foreground font-medium">{otherFeeName} Charges:</span>
            <p className="text-base font-bold text-foreground mt-0.5">
              {formatCurrency(s.otherFeeAmount)}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF]">
            <span className="text-[11px] text-muted-foreground font-medium">Admission Fees Collected:</span>
            <p className="text-base font-bold text-emerald-600 mt-0.5">
              {formatCurrency(s.admissionFeeAmount)}
            </p>
          </div>
        </div>
      )}

      {/* Monthly Recovery Trend Chart */}
      {trendData.length > 0 && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Monthly Collection vs. Outstanding Obligations
            </CardTitle>
            <CardDescription className="text-xs">
              Directly reconciled with source invoices and verified transaction receipts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(val: any) => [`PKR ${Number(val).toLocaleString()}`, '']} />
                  <Legend />
                  <Bar dataKey="Expected" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Collected" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Financial Reconciliation Table */}
      {s && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Financial Reconciliation Summary
            </CardTitle>
            <CardDescription className="text-xs">
              Every figure is derived from immutable source database documents with full audit trail
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-y border-border/60 text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Accounting Item</th>
                    <th className="px-4 py-2.5 font-semibold">Audit Source Document</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Gross Amount</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Net Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr>
                    <td className="px-4 py-3 font-semibold">Total Fee Obligations</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">StudentFee.netPayable</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(s.expectedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(s.expectedAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold">Gross Payments Collected</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">Payment.amount</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(s.collectedGross)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">
                      {formatCurrency(s.collectedGross)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold">Reversals &amp; Refunds</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">PaymentReversal.amount</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      -{formatCurrency(s.reversalsAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">
                      -{formatCurrency(s.reversalsAmount)}
                    </td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      Net Realized Collection
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">Gross - Reversals</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(s.collectedNet)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(s.collectedNet)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold">Uncollected Arrears (Pending)</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">
                      StudentFee.remainingBalance
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(s.pendingAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-rose-600">
                      {formatCurrency(s.pendingAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
