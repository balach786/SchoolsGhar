import { useNavigate, useLocation } from 'react-router-dom';
import { Wallet, Receipt, CircleDollarSign, HandCoins, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FinanceTabItem {
  id: string;
  label: string;
  subtitle: string;
  to: string;
  icon: React.ElementType;
  color: 'navy' | 'amber';
}

const FINANCE_TABS: FinanceTabItem[] = [
  { id: 'fees', label: 'Fee Structures', subtitle: 'Tuition & rules', to: '/fees', icon: Wallet, color: 'navy' },
  { id: 'payments', label: 'Payments & Receipts', subtitle: 'Collection counter', to: '/payments', icon: Receipt, color: 'amber' },
  { id: 'expenses', label: 'School Expenses', subtitle: 'Operational costs', to: '/expenses', icon: CircleDollarSign, color: 'navy' },
  { id: 'salaries', label: 'Staff Salaries', subtitle: 'Payroll & payouts', to: '/salaries', icon: HandCoins, color: 'amber' },
  { id: 'reports', label: 'Finance Reports', subtitle: 'Audit & statements', to: '/reports', icon: BarChart3, color: 'navy' },
];

export function FinanceNavHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-2 mb-6">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Finance Management Hub
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {FINANCE_TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.to;
          const isGold = tab.color === 'amber';

          return (
            <motion.button
              key={tab.id}
              onClick={() => navigate(tab.to)}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={cn(
                'group relative flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all duration-200',
                isActive
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                  : 'border-border/70 bg-card shadow-xs hover:border-primary/30 hover:shadow-md'
              )}
            >
              <div
                className={cn(
                  'mb-2 flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200 group-hover:scale-105',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : isGold
                    ? 'bg-amber-50 text-[#F59E0B] border-amber-200/70 group-hover:bg-amber-100/70'
                    : 'bg-blue-50 text-[#1E3A8A] border-blue-200/70 group-hover:bg-blue-100/70'
                )}
              >
                <Icon className="h-4.5 w-4.5 stroke-[2.2]" />
              </div>
              <span
                className={cn(
                  'w-full text-xs font-bold truncate',
                  isActive ? 'text-primary' : 'text-foreground group-hover:text-primary transition-colors'
                )}
              >
                {tab.label}
              </span>
              <span className="w-full text-[10px] text-muted-foreground truncate mt-0.5">
                {tab.subtitle}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
