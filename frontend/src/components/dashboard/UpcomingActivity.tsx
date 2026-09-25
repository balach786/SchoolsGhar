import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, FileSpreadsheet, BookOpen, Bell, ArrowUpRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ActivityItemData {
  id: string;
  type: 'exam' | 'assignment' | 'fee' | 'notice';
  title: string;
  subtitle?: string;
  date: Date | string;
  status?: string;
}

interface UpcomingActivityProps {
  activities: ActivityItemData[];
  className?: string;
}

const TYPE_CONFIG = {
  exam: {
    icon: FileSpreadsheet,
    bg: 'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white shadow-md shadow-blue-500/30 border-none',
    to: '/exams',
  },
  assignment: {
    icon: BookOpen,
    bg: 'bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-md shadow-amber-500/30 border-none',
    to: '/assignments',
  },
  fee: {
    icon: Calendar,
    bg: 'bg-gradient-to-br from-[#10B981] to-[#047857] text-white shadow-md shadow-emerald-500/30 border-none',
    to: '/fees',
  },
  notice: {
    icon: Bell,
    bg: 'bg-gradient-to-br from-[#6366F1] to-[#4338CA] text-white shadow-md shadow-indigo-500/30 border-none',
    to: '/notices',
  },
};

export function UpcomingActivity({ activities, className }: UpcomingActivityProps) {
  const navigate = useNavigate();

  return (
    <Card className={cn(`rounded-2xl border border-[#99F6E4] bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] shadow-sm flex flex-col`, className)}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-teal-950">
              Upcoming Activity
            </CardTitle>
            <CardDescription className="text-xs text-teal-700/80 mt-0.5">
              Scheduled milestones & deadlines
            </CardDescription>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-teal-700">
            <Clock className="h-3.5 w-3.5 text-teal-600" />
            Next 7–14 days
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
        {activities.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
              <Calendar className="h-6 w-6 stroke-[1.8]" />
            </div>
            <p className="text-sm font-semibold text-foreground">No Upcoming Deadlines</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              No exams or assignments scheduled for the coming days.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activities.slice(0, 5).map((item) => {
              const conf = TYPE_CONFIG[item.type] || TYPE_CONFIG.notice;
              const Icon = conf.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => navigate(conf.to)}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-xs cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${conf.bg}`}
                    >
                      <Icon className="h-4 w-4 stroke-[2]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.subtitle || formatDate(item.date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {item.status}
                      </span>
                    )}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
