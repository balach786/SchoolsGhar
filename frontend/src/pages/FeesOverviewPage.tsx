import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  CreditCard,
  Layers,
  Settings2,
  FileText,
  BarChart3,
  Receipt,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  ArrowDownRight,
  Percent,
  Clock,
  HandCoins,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, percent } from '@/lib/format';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { StaggerContainer, StaggerItem } from '@/components/motion';
import { useFeeSettings } from '@/hooks/useFeeSettings';
import { useAuth } from '@/context/AuthContext';

const CHART_COLORS = ['#1E3A8A', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#8B5CF6'];

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

interface RecentPaymentRow {
  _id: string;
  studentId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  receiptNumber: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
}

export function FeesOverviewPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { hasLateFee, hasOtherFee, hasDiscounts, hasAdmissionFee, otherFeeName } = useFeeSettings();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [summaryData, setSummaryData] = useState<FeesSummaryData | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch academic sessions
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions/lookup')
      .then((res) => {
        if (mounted && res.data?.data) {
          setSessions(res.data.data);
          const active = res.data.data.find((s) => s.isActive);
          if (active) setSessionId(active._id);
          else if (res.data.data.length > 0) setSessionId(res.data.data[0]._id);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch summary reports & recent collections
  const loadDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);

      const [summaryRes, paymentsRes] = await Promise.all([
        api.get<ApiDataResponse<FeesSummaryData>>(`/finance/reports/fees-summary?${params}`),
        api.get<ApiListResponse<RecentPaymentRow>>('/payments?limit=7&page=1'),
      ]);

      if (summaryRes.data?.data) {
        setSummaryData(summaryRes.data.data);
      }
      if (paymentsRes.data?.data) {
        setRecentPayments(paymentsRes.data.data);
      }
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const s = summaryData?.summary;
  const collectionRatePct = s?.expectedAmount && s.expectedAmount > 0
    ? ((s.collectedNet / s.expectedAmount) * 100).toFixed(1)
    : '0.0';

  const methodChartData = summaryData?.methodBreakdown?.map((m) => ({
    name: m._id.replace('_', ' ').toUpperCase(),
    value: m.totalAmount / 100,
    count: m.count,
  })) || [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fees Management"
        description="Comprehensive billing, real-time collection counter, rule snapshots, and financial recovery"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {sessions.length > 0 && (
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger className="w-44 h-9 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((ses) => (
                    <SelectItem key={ses._id} value={ses._id}>
                      {ses.name} {ses.isActive ? '(Active)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData(true)}
              disabled={loading || refreshing}
              className="h-9 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            {can('payments', 'create') && (
              <Button
                size="sm"
                onClick={() => navigate('/fees/collect')}
                className="h-9 gap-1.5 bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white shadow-sm hover:opacity-95"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Collect Fee Counter
              </Button>
            )}
          </div>
        }
      />

      <FeesNavHeader activeTab="overview" />

      {/* KPI Cards Grid */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Expected */}
        <StaggerItem>
          <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Assessed
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#1E3A8A] dark:text-blue-400">
                <Wallet className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrency(s?.expectedAmount ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span>{s?.totalInvoices ?? 0} invoices issued</span>
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Collected Net */}
        <StaggerItem>
          <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Net Collected
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(s?.collectedNet ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                  {collectionRatePct}% recovery
                </Badge>
                {s?.reversalsAmount ? (
                  <span className="text-[11px] text-amber-600">
                    ({formatCurrency(s.reversalsAmount)} reversed)
                  </span>
                ) : null}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Pending Outstanding */}
        <StaggerItem>
          <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Balance
              </span>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {formatCurrency(s?.pendingAmount ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                <span>{s?.unpaidInvoices ?? 0} unpaid / {s?.partialInvoices ?? 0} partial</span>
                <button
                  type="button"
                  onClick={() => navigate('/fees/pending')}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  View Defaulters →
                </button>
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* Dynamic Fourth Card based on School Settings */}
        <StaggerItem>
          {hasDiscounts ? (
            <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Discounts Granted
                </span>
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <Percent className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  {formatCurrency(s?.discountAmount ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Basis-points prioritized discount snapshots
                </p>
              </CardContent>
            </Card>
          ) : hasLateFee ? (
            <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Assessed Fines
                </span>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
                  <Clock className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
                  {formatCurrency(s?.fineAmount ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Immutable overdue late fee assessments
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="relative overflow-hidden border-border/70 shadow-xs hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Invoices Settled
                </span>
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Receipt className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {s?.paidInvoices ?? 0} / {s?.totalInvoices ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Fully paid student invoices
                </p>
              </CardContent>
            </Card>
          )}
        </StaggerItem>
      </StaggerContainer>

      {/* Auxiliary Settings Summary Badges (When Other Fee, Late Fee or Admission Fee Enabled) */}
      {(hasOtherFee || hasLateFee || hasAdmissionFee) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {hasOtherFee && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 text-xs shadow-2xs">
              <span className="text-muted-foreground font-medium">{otherFeeName} Collected:</span>
              <span className="font-bold text-foreground">{formatCurrency(s?.otherFeeAmount ?? 0)}</span>
            </div>
          )}
          {hasLateFee && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 text-xs shadow-2xs">
              <span className="text-muted-foreground font-medium">Overdue Late Fines:</span>
              <span className="font-bold text-purple-600">{formatCurrency(s?.fineAmount ?? 0)}</span>
            </div>
          )}
          {hasAdmissionFee && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 text-xs shadow-2xs">
              <span className="text-muted-foreground font-medium">Admission Fees Collected:</span>
              <span className="font-bold text-emerald-600">{formatCurrency(s?.admissionFeeAmount ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* Visual Analytics & Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Methods Breakdown Chart */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Channels Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Breakdown by Cash, Bank Transfer, EasyPaisa, and JazzCash
            </CardDescription>
          </CardHeader>
          <CardContent>
            {methodChartData.length > 0 ? (
              <div className="h-64 flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height="80%">
                  <PieChart>
                    <Pie
                      data={methodChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {methodChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [`PKR ${Number(val).toLocaleString()}`, 'Amount']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-1 text-[11px]">
                  {methodChartData.map((m, idx) => (
                    <div key={m.name} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="text-muted-foreground font-medium">{m.name}:</span>
                      <span className="font-semibold text-foreground">PKR {m.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-muted-foreground text-xs">
                <CreditCard className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
                No payment transactions recorded yet in this session.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Operations & Navigation Shortcuts */}
        <Card className="border-border/70 shadow-xs lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Fee Operations & Workflows
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Fast shortcuts for cashier counter, batch invoice generation, and settings
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div
              onClick={() => navigate('/fees/collect')}
              className="group p-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-start gap-3"
            >
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Collect Fee Counter
                  <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Search student, calculate current vs previous pending fees, and issue receipts.
                </p>
              </div>
            </div>

            <div
              onClick={() => navigate('/fees/class-collection')}
              className="group p-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-start gap-3"
            >
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Class-wise Collection
                  <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Class roster view with monthly recovery rates, pending dues, and quick-collect.
                </p>
              </div>
            </div>

            <div
              onClick={() => navigate('/fees/setup')}
              className="group p-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-start gap-3"
            >
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 group-hover:scale-105 transition-transform">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Fee Setup & Structures
                  <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define class fee amounts and run idempotent batch monthly invoice generation.
                </p>
              </div>
            </div>

            <div
              onClick={() => navigate('/fees/pending')}
              className="group p-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-start gap-3"
            >
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 group-hover:scale-105 transition-transform">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Pending Defaulters
                  <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track overdue student accounts past grace periods with immutable assessed fines.
                </p>
              </div>
            </div>

            {can('salaries', 'view') && (
              <div
                onClick={() => navigate('/salaries')}
                className="group p-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-start gap-3 sm:col-span-2 md:col-span-1"
              >
                <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 group-hover:scale-105 transition-transform">
                  <HandCoins className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    Payroll & Salaries
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage and generate salaries for teaching and non-teaching staff.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Collections Ledger */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600" />
              Recent Payment Receipts
            </CardTitle>
            <CardDescription className="text-xs">
              Latest financial transactions received across all payment channels
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/fees/receipts')}
            className="text-xs text-primary gap-1"
          >
            All Receipts →
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-y border-border/60 text-muted-foreground uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Receipt #</th>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Admission / Roll</th>
                  <th className="px-4 py-2.5 font-semibold">Method</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentPayments.length > 0 ? (
                  recentPayments.map((p) => (
                    <tr key={p._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {p.receiptNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {p.studentName || 'Student'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.admissionNumber || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {p.paymentMethod.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No payments recorded yet.
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
