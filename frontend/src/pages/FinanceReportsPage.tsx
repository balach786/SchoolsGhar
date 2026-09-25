import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, Loader2, Wallet, HandCoins, CircleDollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, getAccessToken, API_BASE_URL } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  const base = API_BASE_URL ? `${API_BASE_URL}/api` : '/api';
  const token = getAccessToken();
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error(`Export failed (${res.status})`);
    return;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Report downloaded');
}

export function FinanceReportsPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await api.get('/finance/dashboard');
      setSummary(res.data.data.financialSummary);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div>
      <PageHeader
        title="Finance Reports"
        description="Combined financial reporting, net cash flow, and module-wide exports."
        crumbs={[{ label: 'Finance' }, { label: 'Reports' }]}
      />

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Total Revenue (This Month)"
              value={formatCurrency(summary.totalRevenue)}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              title="Total Outflow (This Month)"
              value={formatCurrency(summary.totalOutflow)}
              icon={TrendingDown}
              tone="destructive"
            />
            <StatCard
              title="Net Cash Flow (This Month)"
              value={formatCurrency(summary.netCashFlow)}
              icon={Wallet}
              tone={summary.netCashFlow >= 0 ? 'success' : 'destructive'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Wallet className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Fee Reports</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Export collection and pending fee records.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/monthly-collection?format=csv&month=' + new Date().toISOString().slice(0, 7), 'monthly-collection.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Collection (Current Month)
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/pending-fees?format=csv', 'pending-fees.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Pending Fees
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <HandCoins className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Payroll Reports</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Export monthly salary and payout statements.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/salaries?format=csv&month=' + new Date().toISOString().slice(0, 7), 'salaries.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Salaries (Current Month)
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                  <CircleDollarSign className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Expense & Income</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Export operational expenses and miscellaneous income.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/expenses?format=csv', 'expenses.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> All Expenses
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/income?format=csv', 'income.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> All Income
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Financial Summary</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Export aggregate income vs expense reports.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadCsv('/finance/reports/income-vs-expense?format=csv', 'income-vs-expense.csv')}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Income vs Expense
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
