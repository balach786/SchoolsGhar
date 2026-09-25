import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, ArrowUpRight, Pin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface NoticeItem {
  _id: string;
  title: string;
  audienceType?: string;
  isImportant?: boolean;
  isPinned?: boolean;
  createdAt: string;
}

interface NoticeBoardProps {
  notices: NoticeItem[];
  canCreateNotice?: boolean;
  className?: string;
}

export function NoticeBoard({ notices, canCreateNotice, className }: NoticeBoardProps) {
  const navigate = useNavigate();

  const getNoticeCategoryBadge = (notice: NoticeItem) => {
    const titleLower = notice.title.toLowerCase();
    if (titleLower.includes('exam') || titleLower.includes('date sheet')) {
      return { label: 'Exam Notice', className: 'bg-primary/10 text-primary border-primary/20' };
    }
    if (titleLower.includes('fee') || titleLower.includes('dues')) {
      return { label: 'Fee Reminder', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
    }
    if (titleLower.includes('holiday') || titleLower.includes('vacation')) {
      return { label: 'Holiday', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
    }
    if (titleLower.includes('result')) {
      return { label: 'Result Published', className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' };
    }
    if (notice.isImportant) {
      return { label: 'Important', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' };
    }
    const audience = notice.audienceType ? notice.audienceType.toLowerCase() : '';
    let defaultLabel = 'School Notice';
    if (audience === 'all') defaultLabel = 'General Notice';
    else if (audience === 'staff' || audience === 'teacher') defaultLabel = 'Staff Announcement';
    else if (audience === 'parents' || audience === 'parent') defaultLabel = 'Parent Circular';
    else if (audience === 'students' || audience === 'student') defaultLabel = 'Student Circular';
    else if (notice.audienceType) defaultLabel = `${notice.audienceType} Notice`;

    return { label: defaultLabel, className: 'bg-muted text-muted-foreground border-border/50' };
  };

  return (
    <Card className={cn(`rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF5] to-[#FEF3C7] shadow-sm flex flex-col`, className)}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-md shadow-amber-500/30">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold tracking-tight text-amber-950">
                Notice Board
              </CardTitle>
              <CardDescription className="text-xs text-amber-700/80 mt-0.5">
                School circulars & formal announcements
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded-xl gap-1"
            onClick={() => navigate('/notices')}
          >
            All Notices <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
        {notices.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
              <Bell className="h-6 w-6 stroke-[1.8]" />
            </div>
            <p className="text-sm font-semibold text-foreground">No circulars posted yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
              School announcements, circulars and notices will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notices.slice(0, 5).map((notice) => {
              const badge = getNoticeCategoryBadge(notice);
              return (
                <div
                  key={notice._id}
                  onClick={() => navigate('/notices')}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5 transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                      {notice.isPinned && (
                        <span className="flex items-center gap-0.5 text-[9px] text-primary font-semibold">
                          <Pin className="h-2.5 w-2.5" /> Pinned
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {formatDate(notice.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {notice.title}
                    </p>
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
