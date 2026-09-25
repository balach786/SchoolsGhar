import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Settings2,
  CreditCard,
  Users,
  AlertCircle,
  History,
  Receipt,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FeesNavTab {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  to: string;
  icon: React.ElementType;
  badge?: string;
  isSpecial?: boolean;
}

export const FEES_NAV_TABS: FeesNavTab[] = [
  {
    id: 'overview',
    label: 'Fees Overview',
    shortLabel: 'Overview',
    description: 'Metrics & Trends',
    to: '/fees',
    icon: LayoutDashboard,
  },
  {
    id: 'setup',
    label: 'Fee Setup',
    shortLabel: 'Setup',
    description: 'Class Structures',
    to: '/fees/setup',
    icon: Layers,
  },
  {
    id: 'collect',
    label: 'Collect Fee',
    shortLabel: 'Collect',
    description: 'Quick Counter',
    to: '/fees/collect',
    icon: CreditCard,
    isSpecial: true,
  },
  {
    id: 'class-collection',
    label: 'Class-wise Collection',
    shortLabel: 'Class Roster',
    description: 'Roster & Summary',
    to: '/fees/class-collection',
    icon: Users,
  },
  {
    id: 'pending',
    label: 'Pending Fees',
    shortLabel: 'Pending',
    description: 'Overdue Defaulters',
    to: '/fees/pending',
    icon: AlertCircle,
  },
  {
    id: 'history',
    label: 'Fee History',
    shortLabel: 'Invoices',
    description: 'Audit Ledger',
    to: '/fees/history',
    icon: History,
  },
  {
    id: 'receipts',
    label: 'Receipts',
    shortLabel: 'Receipts',
    description: 'Payments & Reversals',
    to: '/fees/receipts',
    icon: Receipt,
  },
  {
    id: 'reports',
    label: 'Reports',
    shortLabel: 'Reports',
    description: 'Financial Analytics',
    to: '/fees/reports',
    icon: BarChart3,
  },
  {
    id: 'settings',
    label: 'Fee Settings',
    shortLabel: 'Settings',
    description: 'Rules & Discounts',
    to: '/fees/settings',
    icon: Settings2,
  },
];

interface FeesNavHeaderProps {
  activeTab?: string;
  actionButton?: React.ReactNode;
}

export function FeesNavHeader({ activeTab, actionButton }: FeesNavHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname;

  return (
    <div className="mb-6 space-y-3">
      {/* Sub-navigation pills */}
      <div className="relative overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max p-1 rounded-2xl bg-muted/50 border border-border/60 shadow-xs backdrop-blur-xs">
          {FEES_NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab
              ? activeTab === tab.id
              : tab.to === '/fees'
              ? currentPath === '/fees'
              : currentPath.startsWith(tab.to);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.to)}
                className={cn(
                  'relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 outline-none',
                  isActive
                    ? 'text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="feesNavActivePill"
                    className={cn(
                      'absolute inset-0 rounded-xl',
                      tab.isSpecial
                        ? 'bg-gradient-to-r from-[#1E3A8A] via-primary to-[#2563EB] shadow-md shadow-primary/25'
                        : 'bg-primary shadow-sm'
                    )}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                  <span>{tab.label}</span>
                  {tab.isSpecial && !isActive && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  {tab.badge && (
                    <span
                      className={cn(
                        'ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      )}
                    >
                      {tab.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
