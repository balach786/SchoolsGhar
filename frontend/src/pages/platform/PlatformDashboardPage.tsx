import { RevealCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Layers,
  ChevronRight,
  TrendingUp,
  Receipt,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, apiErrorMessage } from '@/lib/api';

interface DashboardData {
  totalCustomers: number;
  activeSubscriptions: number;
  activeTrials: number;
  trialsExpiringSoon: number;
  expiredAccounts: number;
  suspendedAccounts: number;
  pendingPayments: number;
  approvedPayments: number;
  rejectedPayments: number;
  newCustomersThisMonth: number;
  totalRecordedRevenue: number;
  activePlans: number;
  monthlyRevenue: { _id: string; total: number; count: number }[];
  planDistribution: { name: string; count: number }[];
}

interface RecentCustomer {
  _id: string;
  name: string;
  slug: string;
  contactEmail: string;
  status: 'trial' | 'active' | 'expired' | 'suspended';
  planName: string;
  createdAt: string;
}

export function PlatformDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const [metricsRes, customersRes] = await Promise.all([
        api.get<{ success: boolean; data: DashboardData }>('/platform/dashboard'),
        api.get<{ success: boolean; data: RecentCustomer[] }>('/platform/customers?limit=6&sort=newest'),
      ]);

      if (metricsRes.data?.success) setData(metricsRes.data.data);
      if (customersRes.data?.success) setRecentCustomers(customersRes.data.data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (!loading && !data) return <div role="alert" className="rounded-2xl border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-10 text-center"><h1 className="text-xl font-semibold">We couldn’t load your platform overview.</h1><p className="my-4 text-muted-foreground">Please try again to see the latest school and payment information.</p><Button onClick={fetchMetrics}>Try again</Button></div>;
  if (loading || !data) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">SaaS Platform Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time subscriber metrics, revenue tracking, and account verifications across all schools.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/platform-admin/customers">
            <Button variant="outline" size="sm" className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground hover:bg-muted text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1.5" />
              Manage All Schools
            </Button>
          </Link>
          <Link to="/platform-admin/payments">
            <Button size="sm" className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-md shadow-teal-600/30">
              <Receipt className="w-3.5 h-3.5 mr-1.5" />
              Review Payments
              {data.pendingPayments > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-400 text-slate-950 font-bold">
                  {data.pendingPayments}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Urgent Action Callout if Pending Payments */}
      {data.pendingPayments > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-700 dark:text-amber-300">
          <div className="flex flex-wrap items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">
                {data.pendingPayments} Manual Payment {data.pendingPayments === 1 ? 'Proof' : 'Proofs'} Awaiting Review
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                Schools have uploaded transfer receipts. Approve them to immediately activate or extend their subscriptions.
              </p>
            </div>
          </div>
          <Link to="/platform-admin/payments">
            <Button size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold text-xs whitespace-nowrap">
              Review Queue <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Top 4 KPI Metrics */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers */}
        <StaggerItem><RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Schools
            </CardTitle>
            <Building2 className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.totalCustomers}</div>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-success font-semibold">+{data.newCustomersThisMonth}</span> joined this month
            </p>
          </CardContent>
        </RevealCard></StaggerItem>

        {/* Active Subscriptions */}
        <StaggerItem><RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Subscriptions
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.activeSubscriptions}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Schools with a paid subscription
            </p>
          </CardContent>
        </RevealCard></StaggerItem>

        {/* Active Free Trials */}
        <StaggerItem><RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Free Trials
            </CardTitle>
            <Sparkles className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.activeTrials}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {data.trialsExpiringSoon > 0 ? (
                <span className="text-amber-700 dark:text-amber-300 font-semibold">{data.trialsExpiringSoon} expiring in ≤ 2 days</span>
              ) : (
                'Onboarding prospects'
              )}
            </p>
          </CardContent>
        </RevealCard></StaggerItem>

        {/* Total Recorded Revenue */}
        <StaggerItem><RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Revenue
            </CardTitle>
            <CreditCard className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              PKR {data.totalRecordedRevenue.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-success" />
              PKR {(data.monthlyRevenue.find((month) => month._id === new Date().toISOString().slice(0, 7))?.total ?? 0).toLocaleString()} this month
            </p>
          </CardContent>
        </RevealCard></StaggerItem>
      </StaggerContainer>

      {/* Secondary Row: Plan Distribution & Health Statuses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier Distribution */}
        <RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Tier Breakdown</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Distribution of active customer accounts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-foreground font-medium">Free Trials</span>
                <span className="font-semibold text-primary">{data.activeTrials}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((data.activeTrials / (data.totalCustomers || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {data.planDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1 pt-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">{item.name}</span>
                  <span className="font-semibold text-success">{item.count}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((item.count / (data.totalCustomers || 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>Expired Accounts: <strong className="text-destructive">{data.expiredAccounts}</strong></span>
              <span>Suspended: <strong className="text-destructive">{data.suspendedAccounts}</strong></span>
            </div>
          </CardContent>
        </RevealCard>

        {/* Recent Registrations Table */}
        <RevealCard className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Recent School Registrations</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                The latest schools to join your platform
              </CardDescription>
            </div>
            <Link to="/platform-admin/customers" className="text-xs text-primary hover:underline">
              View All
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border bg-background text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">School Name</th>
                    <th className="px-4 py-2.5">Contact Email</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Plan</th>
                    <th className="px-4 py-2.5 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {recentCustomers.map((c) => (
                    <tr key={c._id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{c.contactEmail}</td>
                      <td className="px-4 py-2.5">
                        {c.status === 'active' && (
                          <Badge className="bg-emerald-500/10 text-success border-emerald-500/20 text-[10px]">
                            Active
                          </Badge>
                        )}
                        {c.status === 'trial' && (
                          <Badge className="bg-teal-500/10 text-primary border-teal-500/20 text-[10px]">
                            Trial
                          </Badge>
                        )}
                        {c.status === 'expired' && (
                          <Badge className="bg-rose-500/10 text-destructive border-rose-500/20 text-[10px]">
                            Expired
                          </Badge>
                        )}
                        {c.status === 'suspended' && (
                          <Badge className="bg-red-500/20 text-destructive border-red-500/30 text-[10px]">
                            Suspended
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{c.planName || 'Trial'}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </RevealCard>
      </div>
    </div>
  );
}
