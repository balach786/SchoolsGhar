import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileSpreadsheet, BookOpen, Bell, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

export interface CalendarEventItem {
  id: string;
  title: string;
  date: Date | string;
  type: 'exam' | 'assignment' | 'fee' | 'notice';
}

interface DashboardCalendarProps {
  events?: CalendarEventItem[];
  className?: string;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function DashboardCalendar({ events = [], className }: DashboardCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const setMonthIndex = (idx: number) => {
    setCurrentDate(new Date(year, idx, 1));
  };

  const prevYear = () => setCurrentDate(new Date(year - 1, month, 1));
  const nextYear = () => setCurrentDate(new Date(year + 1, month, 1));

  // Map events to date string "YYYY-MM-DD"
  const eventsByDate = new Map<string, CalendarEventItem[]>();
  for (const ev of events) {
    if (!ev.date) continue;
    const d = new Date(ev.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const list = eventsByDate.get(key) ?? [];
    list.push(ev);
    eventsByDate.set(key, list);
  }

  const selectedKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const selectedEvents = eventsByDate.get(selectedKey) ?? [];

  return (
    <Card className={cn('rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#F8F5FF] to-[#EDE9FE] shadow-sm flex flex-col p-5', className)}>
      {/* Header: Title & Year Navigator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white shadow-md shadow-purple-500/30">
            <CalendarIcon className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-purple-950 tracking-tight">Academic Calendar</h3>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2 bg-purple-200/50 px-3 py-1 rounded-xl text-xs font-bold text-purple-900">
          <button onClick={prevYear} className="hover:text-purple-700 transition-colors" aria-label="Previous Year">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span>{year}</span>
          <button onClick={nextYear} className="hover:text-purple-700 transition-colors" aria-label="Next Year">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Month Selector Pills (Matching reference) */}
      <div className="grid grid-cols-6 gap-1 mb-4 text-[11px] font-semibold text-center">
        {MONTH_NAMES.map((mName, idx) => {
          const isActiveMonth = month === idx;
          return (
            <button
              key={mName}
              onClick={() => setMonthIndex(idx)}
              className={cn(
                'py-1 rounded-lg transition-all duration-150',
                isActiveMonth
                  ? 'bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white shadow-[0_4px_10px_-2px_rgba(124,58,237,0.4)]'
                  : 'text-purple-700/80 hover:bg-purple-200/50 hover:text-purple-900'
              )}
            >
              {mName}
            </button>
          );
        })}
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 text-center text-[10.5px] font-bold text-slate-400 mb-1.5 border-b border-slate-100 pb-1">
        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Calendar Day Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-700">
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <span key={`empty-${i}`} className="py-2 text-slate-300">
            •
          </span>
        ))}

        {Array.from({ length: totalDays }).map((_, i) => {
          const dayNum = i + 1;
          const thisDate = new Date(year, month, dayNum);
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayEvents = eventsByDate.get(dateKey) || [];
          const hasExam = dayEvents.some((e) => e.type === 'exam');
          const hasEvent = dayEvents.some((e) => e.type === 'notice' || e.type === 'assignment');
          const isSelected = selectedDate.toDateString() === thisDate.toDateString();

          // Highlight styling matching real calendar records:
          // Amber rounded badge for events / circulars / assignments
          // Royal navy rounded badge for exams / tests
          const isGoldDay = hasEvent;
          const isNavyDay = hasExam;

          return (
            <button
              key={`day-${dayNum}`}
              onClick={() => setSelectedDate(thisDate)}
              className={cn(
                'py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 relative flex items-center justify-center',
                isSelected
                  ? 'ring-2 ring-[#1E3A8A] ring-offset-1 font-bold'
                  : 'hover:bg-slate-100',
                isNavyDay
                  ? 'bg-[#1E3A8A] text-white font-bold shadow-xs'
                  : isGoldDay
                  ? 'bg-[#F59E0B] text-white font-bold shadow-xs'
                  : 'text-slate-700'
              )}
            >
              <span>{dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Color Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <span className="font-medium text-slate-600 text-[11px]">Events & Notices</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A]" />
          <span className="font-medium text-slate-600 text-[11px]">Exams & Tests</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="font-medium text-slate-400 text-[11px]">Normal Schedule</span>
        </div>
      </div>

      {/* Selected Date Summary */}
      {selectedEvents.length > 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 text-xs">
          <div className="flex items-center justify-between pb-1 font-bold text-slate-800">
            <span>{formatDate(selectedDate)}</span>
            <span className="text-[10px] text-[#1E3A8A] font-semibold">
              {selectedEvents.length} event{selectedEvents.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1 mt-1">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A]" />
                <span className="truncate">{ev.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-2.5 text-center text-xs text-slate-400">
          <p className="font-medium text-[11px]">No events scheduled for this day</p>
        </div>
      )}
    </Card>
  );
}
