import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Wallet, Receipt, TrendingUp, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useNavigate } from 'react-router-dom';

interface ExamFinancialCardProps {
  expected: number;
  collected: number;
  pending: number;
  expenses: number;
  netBalance?: number;
  className?: string;
}

export function ExamFinancialCard({
  expected,
  collected,
  pending,
  expenses,
  netBalance,
  className,
}: ExamFinancialCardProps) {
  const navigate = useNavigate();

  // Formula: Net Balance = Collected Exam Fees - Exam Expenses
  const computedNet = netBalance !== undefined ? netBalance : collected - expenses;
  const isPositive = computedNet >= 0;

  return (
    <Card className={`rounded-2xl border border-border/70 bg-card shadow-sm flex flex-col ${className}`}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-foreground">
              Exam Financial Summary
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Dedicated ledger: fees collected minus exam operating costs
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-xl"
              onClick={() => navigate('/exams/fees')}
            >
              Fees
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-xl"
              onClick={() => navigate('/exams/expenses')}
            >
              Expenses
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between gap-4">
        {/* Net Balance Highlight Box */}
        <div
          className={`rounded-2xl border p-4 flex items-center justify-between transition-colors ${
            isPositive
              ? 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10'
              : 'border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Net Exam Balance (Profit / Loss)
            </span>
            <p
              className={`mt-1 text-2xl font-bold tracking-tight ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(computedNet)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Collected Exam Fees ({formatCurrency(collected)}) − Exam Expenses ({formatCurrency(expenses)})
            </p>
          </div>

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
              isPositive
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            <TrendingUp className="h-6 w-6 stroke-[2]" />
          </div>
        </div>

        {/* 4 Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Receipt className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium">Expected Fees</span>
            </div>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(expected)}</p>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[11px] font-medium">Collected</span>
            </div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate">{formatCurrency(collected)}</p>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Receipt className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[11px] font-medium">Pending</span>
            </div>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 truncate">{formatCurrency(pending)}</p>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Banknote className="h-3.5 w-3.5 text-rose-600" />
              <span className="text-[11px] font-medium">Expenses</span>
            </div>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 truncate">{formatCurrency(expenses)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
