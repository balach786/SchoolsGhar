import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Receipt, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface FeeOverviewCardProps {
  monthlyCollected: number;
  monthlyPending: number;
  examFeeCollected: number;
  examFeePending: number;
  examFeeThisMonth?: number;
  className?: string;
}

export function FeeOverviewCard({
  monthlyCollected,
  monthlyPending,
  examFeeCollected,
  examFeePending,
  examFeeThisMonth = 0,
  className,
}: FeeOverviewCardProps) {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<'month' | 'session'>('month');

  const currentMonthlyCollected = monthlyCollected;
  const currentExamCollected = timeframe === 'month' ? examFeeThisMonth : examFeeCollected;

  const totalMonthly = currentMonthlyCollected + monthlyPending;
  const monthlyRate = totalMonthly > 0 ? Math.round((currentMonthlyCollected / totalMonthly) * 100) : 0;

  const totalExam = currentExamCollected + examFeePending;
  const examRate = totalExam > 0 ? Math.round((currentExamCollected / totalExam) * 100) : 0;

  return (
    <Card className={cn('rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7] shadow-sm flex flex-col', className)}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-amber-950">
              Fee Collection
            </CardTitle>
            <CardDescription className="text-xs text-amber-700/80 mt-0.5">
              Monthly tuition vs separate exam fees
            </CardDescription>
          </div>

          <div className="inline-flex rounded-xl bg-amber-500/10 p-1 text-xs">
            <button
              onClick={() => setTimeframe('month')}
              className={cn('rounded-lg px-2.5 py-1 font-semibold transition-colors',
                timeframe === 'month'
                  ? 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-[0_10px_22px_-5px_rgba(245,158,11,0.5)]'
                  : 'text-amber-700 hover:text-amber-900'
              )}
            >
              This Month
            </button>
            <button
              onClick={() => setTimeframe('session')}
              className={cn('rounded-lg px-2.5 py-1 font-semibold transition-colors',
                timeframe === 'session'
                  ? 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-[0_10px_22px_-5px_rgba(245,158,11,0.5)]'
                  : 'text-amber-700 hover:text-amber-900'
              )}
            >
              This Session
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between gap-4">
        {/* Section 1: Monthly Tuition Fees */}
        <div className="rounded-2xl border border-amber-200/60 bg-white/40 p-4 transition-colors hover:border-amber-400">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-md shadow-amber-500/30">
                <Wallet className="h-4 w-4 stroke-[2]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
                Monthly School Fees
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-100 rounded-lg gap-1"
              onClick={() => navigate('/fees')}
            >
              Manage <ArrowUpRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[11px] font-medium text-amber-700/80">Collected</p>
              <p className="text-base font-bold text-amber-950 truncate">
                {formatCurrency(currentMonthlyCollected)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-amber-700/80">Pending</p>
              <p className="text-base font-bold text-amber-600 truncate">
                {formatCurrency(monthlyPending)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-amber-700/80 font-semibold mb-1">
              <span>Collection Progress</span>
              <span>{monthlyRate}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-amber-200/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                style={{ width: `${Math.min(100, monthlyRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Exam Fees (Clearly Distinguishable - Emerald) */}
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-4 transition-colors hover:border-emerald-400">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#10B981] to-[#047857] text-white shadow-md shadow-emerald-500/30">
                <Receipt className="h-4 w-4 stroke-[2]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                Exam Fees (Separate)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 rounded-lg gap-1"
              onClick={() => navigate('/exams/fees')}
            >
              Exams <ArrowUpRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[11px] font-medium text-emerald-700/80">Exam Collected</p>
              <p className="text-base font-bold text-emerald-950 truncate">
                {formatCurrency(currentExamCollected)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-emerald-700/80">Exam Pending</p>
              <p className="text-base font-bold text-amber-600 truncate">
                {formatCurrency(examFeePending)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-emerald-700/80 font-semibold mb-1">
              <span>Exam Fee Progress</span>
              <span>{examRate}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-emerald-200/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, examRate)}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
