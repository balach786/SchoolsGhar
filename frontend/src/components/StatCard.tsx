import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  description?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'gold' | 'navy';
  loading?: boolean;
  className?: string;
  valueClassName?: string;
  onClick?: () => void;
}

const toneStyles: Record<NonNullable<StatCardProps['tone']>, { card: string; iconBox: string; icon: string }> = {
  default: {
    card: 'bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] border-[#BFDBFE] hover:border-[#60A5FA] hover:shadow-[0_22px_45px_-12px_rgba(37,99,235,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] shadow-[0_10px_22px_-5px_rgba(37,99,235,0.5)] border-none',
    icon: 'text-white',
  },
  primary: {
    card: 'bg-gradient-to-br from-[#F5F3FF] to-[#E0E7FF] border-[#C7D2FE] hover:border-[#818CF8] hover:shadow-[0_22px_45px_-12px_rgba(79,70,229,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#6366F1] to-[#4338CA] shadow-[0_10px_22px_-5px_rgba(79,70,229,0.5)] border-none',
    icon: 'text-white',
  },
  navy: {
    card: 'bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] border-[#BFDBFE] hover:border-[#60A5FA] hover:shadow-[0_22px_45px_-12px_rgba(37,99,235,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] shadow-[0_10px_22px_-5px_rgba(37,99,235,0.5)] border-none',
    icon: 'text-white',
  },
  gold: {
    card: 'bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7] border-[#FDE68A] hover:border-[#FBBF24] hover:shadow-[0_22px_45px_-12px_rgba(245,158,11,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] shadow-[0_10px_22px_-5px_rgba(245,158,11,0.5)] border-none',
    icon: 'text-white',
  },
  success: {
    card: 'bg-gradient-to-br from-[#F0FDF4] to-[#D1FAE5] border-[#A7F3D0] hover:border-[#34D399] hover:shadow-[0_22px_45px_-12px_rgba(16,185,129,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#10B981] to-[#047857] shadow-[0_10px_22px_-5px_rgba(16,185,129,0.5)] border-none',
    icon: 'text-white',
  },
  warning: {
    card: 'bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7] border-[#FDE68A] hover:border-[#FBBF24] hover:shadow-[0_22px_45px_-12px_rgba(245,158,11,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] shadow-[0_10px_22px_-5px_rgba(245,158,11,0.5)] border-none',
    icon: 'text-white',
  },
  destructive: {
    card: 'bg-gradient-to-br from-[#FFF1F2] to-[#FFE4E6] border-[#FECDD3] hover:border-[#FB7185] hover:shadow-[0_22px_45px_-12px_rgba(244,63,94,0.25)]',
    iconBox: 'bg-gradient-to-br from-[#F43F5E] to-[#BE123C] shadow-[0_10px_22px_-5px_rgba(244,63,94,0.5)] border-none',
    icon: 'text-white',
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  tone = 'navy',
  loading,
  className,
  valueClassName,
  onClick,
}: StatCardProps) {
  const currentTone = toneStyles[tone] || toneStyles.navy;

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.012 }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 25 }}
      className="h-full"
    >
      <Card
        onClick={onClick}
        className={cn(
          'group relative h-full flex flex-col overflow-hidden rounded-2xl border p-0 transition-all duration-300',
          currentTone.card,
          onClick && 'cursor-pointer',
          className
        )}
      >
        <CardContent className="flex flex-col flex-1 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500/80 line-clamp-2 leading-snug">
              {title}
            </p>
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
                currentTone.iconBox
              )}
            >
              <Icon className={cn('h-5 w-5 stroke-[2.2]', currentTone.icon)} />
            </div>
          </div>

          <div className="mt-auto pt-4" style={{ containerType: 'inline-size' }}>
            {loading ? (
              <Skeleton className="h-8 w-24 rounded-lg" />
            ) : (
              <p 
                className={cn(
                  "font-extrabold tracking-tight text-slate-800 break-normal leading-tight",
                  typeof value === 'string' && /[a-zA-Z]{4,}/.test(value.replace(/(PKR|USD|EUR|GBP)/gi, '')) 
                    ? "text-2xl sm:text-3xl" 
                    : "whitespace-nowrap",
                  valueClassName
                )}
                style={
                  typeof value === 'string' && /[a-zA-Z]{4,}/.test(value.replace(/(PKR|USD|EUR|GBP)/gi, '')) 
                    ? {} 
                    : { fontSize: 'clamp(1.25rem, 18cqi, 2rem)' }
                }
              >
                {value}
              </p>
            )}
            {description && (
              <div className="mt-2 text-[10px] sm:text-[11px] font-medium text-slate-500 line-clamp-2 leading-snug">
                {description}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
