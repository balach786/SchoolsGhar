import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet,
  HandCoins,
  CircleDollarSign,
  BarChart3,
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Building2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface HubCard {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: React.ElementType;
  color: 'navy' | 'amber' | 'teal' | 'violet';
  perm: string;
}

const HUB_CARDS: HubCard[] = [
  {
    id: 'fees',
    label: 'Fees & Billing',
    description: 'Fee structures, collection, pending dues, receipts, and reports',
    to: '/fees',
    icon: Wallet,
    color: 'navy',
    perm: 'fees',
  },
  {
    id: 'payroll',
    label: 'Payroll & Salaries',
    description: 'Staff salaries, attendance deductions, bonuses, and payroll generation',
    to: '/salaries',
    icon: HandCoins,
    color: 'amber',
    perm: 'salaries',
  },
  {
    id: 'expenses',
    label: 'Expenses & Income',
    description: 'School operational expenses, income entries, and financial records',
    to: '/expenses',
    icon: CircleDollarSign,
    color: 'teal',
    perm: 'expenses',
  },
  {
    id: 'reports',
    label: 'Finance Reports',
    description: 'Financial summaries, audit statements, and income/expense analytics',
    to: '/finance-reports',
    icon: BarChart3,
    color: 'violet',
    perm: 'reports',
  },
];

const colorMap: Record<string, { card: string; icon: string; title: string; arrow: string }> = {
  navy: {
    card: 'border-blue-200/60 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] hover:border-blue-400/50 hover:shadow-blue-100',
    icon: 'bg-[#1E3A8A] text-white',
    title: 'text-[#1E3A8A]',
    arrow: 'text-[#1E3A8A]/60 group-hover:text-[#1E3A8A]',
  },
  amber: {
    card: 'border-amber-200/60 bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7] hover:border-amber-400/50 hover:shadow-amber-100',
    icon: 'bg-amber-500 text-white',
    title: 'text-amber-800',
    arrow: 'text-amber-500/60 group-hover:text-amber-600',
  },
  teal: {
    card: 'border-teal-200/60 bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] hover:border-teal-400/50 hover:shadow-teal-100',
    icon: 'bg-teal-600 text-white',
    title: 'text-teal-800',
    arrow: 'text-teal-500/60 group-hover:text-teal-600',
  },
  violet: {
    card: 'border-violet-200/60 bg-gradient-to-br from-[#F5F3FF] to-[#EDE9FE] hover:border-violet-400/50 hover:shadow-violet-100',
    icon: 'bg-violet-600 text-white',
    title: 'text-violet-800',
    arrow: 'text-violet-500/60 group-hover:text-violet-600',
  },
};

export function FinanceHubPage() {
  const navigate = useNavigate();
  const { can } = useAuth();

  const visibleCards = HUB_CARDS.filter((c) => can(c.perm, 'view'));

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Finance Hub"
        description="Centralized financial management — fees, payroll, expenses, and reports"
        crumbs={[{ label: 'Finance' }, { label: 'Hub' }]}
      />

      {/* Main Hub Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {visibleCards.map((card, idx) => {
          const Icon = card.icon;
          const colors = colorMap[card.color];
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.35 }}
              onClick={() => navigate(card.to)}
              className={cn(
                'group relative flex items-start gap-5 p-8 min-h-[160px] rounded-2xl border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-md',
                colors.card
              )}
            >
              <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform duration-200 group-hover:scale-105', colors.icon)}>
                <Icon className="h-8 w-8" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-1.5">
                  <p className={cn('font-bold text-xl', colors.title)}>{card.label}</p>
                  <ArrowUpRight className={cn('h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0', colors.arrow)} />
                </div>
                <p className="text-base text-muted-foreground mt-2 leading-relaxed">{card.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
