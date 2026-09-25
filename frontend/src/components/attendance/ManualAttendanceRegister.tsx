import React from 'react';
import { Calendar, Download, Sparkles, AlertTriangle, CheckCircle2, Info, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export interface CalendarDayItem {
  day: number;
  dateString: string;
  dayOfWeek: string;
  isSunday: boolean;
  isWeekend: boolean;
  closure: {
    id?: string;
    type: 'official_leave' | 'school_closed';
    reason: string;
    reasonCategory?: string;
    notes?: string;
  } | null;
  isWorkingDay: boolean;
}

export interface RegisterDailyMark {
  status: string;
  code: string;
  label: string;
  reason?: string;
}

export interface RegisterRowItem {
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  subLabel?: string;
  avatarUrl?: string | null;
  present: number;
  absent: number;
  late: number;
  leave: number;
  officialLeave?: number;
  schoolClosed?: number;
  workingDays: number;
  attendanceRate: number;
  dailyMarks: Record<number, RegisterDailyMark>;
  // Staff financial fields
  baseSalary?: number;
  dailyRate?: number;
  absentDeduction?: number;
  projectedNet?: number;
}

interface ManualAttendanceRegisterProps {
  title: string;
  month: string;
  calendarDays: CalendarDayItem[];
  rows: RegisterRowItem[];
  dailyTotals?: Record<number, { present: number; absent: number; late: number; leave: number }>;
  summaryTotals?: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    officialLeaves: number;
    schoolClosed: number;
    netWorkingDays: number;
  };
  isStaff?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  onOpenClosureDialog: (dateString?: string, closure?: any) => void;
  onExportCsv: () => void;
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'ID';
}

export function ManualAttendanceRegister({
  title,
  month,
  calendarDays,
  rows,
  dailyTotals,
  summaryTotals,
  isStaff = false,
  loading = false,
  emptyMessage,
  onOpenClosureDialog,
  onExportCsv,
}: ManualAttendanceRegisterProps) {
  const [formatMonthYear] = React.useMemo(() => {
    if (!month) return [''];
    const [y, m] = month.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return [date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })];
  }, [month]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
        {/* Top Control Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E3A8A] text-white flex items-center justify-center shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {formatMonthYear}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic school ledger format • Click any day column to mark an official leave or closure reason
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenClosureDialog()}
              className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 gap-1.5 text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Mark Holiday / Closed Day
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportCsv}
              disabled={loading || rows.length === 0}
              className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 gap-1.5 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Export Register (CSV)
            </Button>
          </div>
        </div>

        {/* Legend Ribbon */}
        <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center font-bold text-[10px]">
                P
              </span>
              <span className="text-slate-600 text-[11px]">Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 flex items-center justify-center font-bold text-[10px]">
                A
              </span>
              <span className="text-slate-600 text-[11px]">Absent (Deducted for Staff)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center font-bold text-[10px]">
                L
              </span>
              <span className="text-slate-600 text-[11px]">Late</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-sky-100 text-sky-800 border border-sky-300 flex items-center justify-center font-bold text-[10px]">
                LV
              </span>
              <span className="text-slate-600 text-[11px]">Leave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-800 border border-purple-300 flex items-center justify-center font-bold text-[10px]">
                H
              </span>
              <span className="text-slate-600 text-[11px]">Official Holiday (No Deduction)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-800 border border-orange-300 flex items-center justify-center font-bold text-[10px]">
                C
              </span>
              <span className="text-slate-600 text-[11px]">School Closed (No Deduction)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-500 border border-slate-300 flex items-center justify-center font-bold text-[10px]">
                OFF
              </span>
              <span className="text-slate-600 text-[11px]">Sunday</span>
            </div>
          </div>

          {summaryTotals && (
            <div className="flex items-center gap-3 text-slate-600 text-[11px]">
              <span>
                Net Working Days: <strong className="text-slate-900">{summaryTotals.netWorkingDays}</strong>
              </span>
              <span>
                Official Holidays: <strong className="text-purple-700">{summaryTotals.officialLeaves}</strong>
              </span>
              <span>
                Closed Days: <strong className="text-orange-700">{summaryTotals.schoolClosed}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Register Grid */}
        <div className="relative overflow-x-auto max-h-[700px]">
          <table className="w-full text-left border-collapse select-none">
            {/* Header Row */}
            <thead className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-sm text-slate-700 text-xs shadow-sm">
              <tr>
                {/* Fixed Person Info Column */}
                <th className="sticky left-0 z-30 bg-slate-100 py-3 px-3 min-w-[200px] border-r border-b border-slate-200 font-bold">
                  {isStaff ? 'Faculty Member' : 'Student'}
                </th>

                {/* Day Columns */}
                {calendarDays.map((cal) => {
                  const hasClosure = Boolean(cal.closure);
                  const isOfficial = cal.closure?.type === 'official_leave';

                  return (
                    <th
                      key={cal.day}
                      onClick={() => onOpenClosureDialog(cal.dateString, cal.closure)}
                      className={`py-1.5 px-0.5 text-center min-w-[32px] w-[32px] border-r border-b border-slate-200 font-medium cursor-pointer transition-colors group ${
                        hasClosure
                          ? isOfficial
                            ? 'bg-purple-100/80 hover:bg-purple-200 text-purple-900'
                            : 'bg-orange-100/80 hover:bg-orange-200 text-orange-900'
                          : cal.isSunday
                          ? 'bg-slate-200/70 text-slate-400'
                          : 'hover:bg-indigo-50/70'
                      }`}
                      title={
                        hasClosure
                          ? `${isOfficial ? 'Official Leave' : 'School Closed'}: ${cal.closure?.reason} (Click to edit)`
                          : `Day ${cal.day} (${cal.dayOfWeek}) - Click to declare holiday/closure`
                      }
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-[11px] font-bold leading-none">{cal.day}</span>
                        <span className="text-[9px] uppercase text-slate-500 font-medium leading-tight mt-0.5">
                          {cal.dayOfWeek[0]}
                        </span>
                        {hasClosure && (
                          <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-current" />
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Sticky Summary Columns */}
                <th className="py-2 px-2 text-center min-w-[36px] bg-emerald-50 text-emerald-900 border-r border-b border-slate-200 font-bold text-xs" title="Total Present">
                  P
                </th>
                <th className="py-2 px-2 text-center min-w-[36px] bg-rose-50 text-rose-900 border-r border-b border-slate-200 font-bold text-xs" title="Total Absent">
                  A
                </th>
                <th className="py-2 px-2 text-center min-w-[36px] bg-amber-50 text-amber-900 border-r border-b border-slate-200 font-bold text-xs" title="Total Late">
                  L
                </th>
                <th className="py-2 px-2 text-center min-w-[36px] bg-sky-50 text-sky-900 border-r border-b border-slate-200 font-bold text-xs" title="Total Leave">
                  LV
                </th>
                <th className="py-2 px-2 text-center min-w-[38px] bg-purple-50 text-purple-900 border-r border-b border-slate-200 font-bold text-xs" title="Total Holidays & Closed Days">
                  OFF
                </th>
                <th className="py-2 px-2 text-center min-w-[42px] bg-slate-100 text-slate-800 border-r border-b border-slate-200 font-bold text-xs" title="Net Working Days">
                  WD
                </th>
                <th className="py-2 px-3 text-center min-w-[64px] bg-slate-100 text-slate-900 border-r border-b border-slate-200 font-bold text-xs" title="Attendance Percentage">
                  Rate %
                </th>

                {/* Additional staff pay columns */}
                {isStaff && (
                  <>
                    <th className="py-2 px-3 text-right min-w-[90px] bg-slate-50 border-r border-b border-slate-200 font-bold text-xs">
                      Daily Rate
                    </th>
                    <th className="py-2 px-3 text-right min-w-[100px] bg-rose-50 text-rose-900 border-r border-b border-slate-200 font-bold text-xs">
                      Absent Ded.
                    </th>
                    <th className="py-2 px-3 text-right min-w-[100px] bg-emerald-50 text-emerald-900 border-b border-slate-200 font-bold text-xs">
                      Projected Net
                    </th>
                  </>
                )}
              </tr>
            </thead>

            {/* Body Rows */}
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={calendarDays.length + (isStaff ? 11 : 8)}
                    className="py-12 text-center text-slate-400 font-medium"
                  >
                    {emptyMessage || 'No attendance records found for this month and selection.'}
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Fixed Person Info Column */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 py-2 px-3 border-r border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-7 h-7 rounded-lg border border-slate-200">
                          <AvatarFallback className="text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {initials(row.primaryLabel)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate max-w-[130px] leading-snug">
                            {row.primaryLabel}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span>{row.secondaryLabel}</span>
                            {row.subLabel && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[80px]">{row.subLabel}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Day Cells */}
                    {calendarDays.map((cal) => {
                      const mark = row.dailyMarks[cal.day];
                      const code = mark?.code || '—';
                      const status = mark?.status || 'unmarked';

                      let badgeClass = 'text-slate-300';
                      if (code === 'P') badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold';
                      else if (code === 'A') badgeClass = 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
                      else if (code === 'L') badgeClass = 'bg-amber-100 text-amber-800 border-amber-200 font-bold';
                      else if (code === 'LV') badgeClass = 'bg-sky-100 text-sky-800 border-sky-200 font-bold';
                      else if (code === 'H') badgeClass = 'bg-purple-100 text-purple-800 border-purple-200 font-bold';
                      else if (code === 'C') badgeClass = 'bg-orange-100 text-orange-800 border-orange-200 font-bold';
                      else if (code === 'OFF') badgeClass = 'bg-slate-100 text-slate-400';

                      return (
                        <td
                          key={cal.day}
                          className={`p-0 text-center border-r border-slate-100 ${
                            cal.closure
                              ? cal.closure.type === 'official_leave'
                                ? 'bg-purple-50/40'
                                : 'bg-orange-50/40'
                              : cal.isSunday
                              ? 'bg-slate-50/60'
                              : ''
                          }`}
                        >
                          <div
                            className="w-full h-8 flex items-center justify-center cursor-default"
                            title={`${row.primaryLabel} · ${cal.dateString} (${cal.dayOfWeek})\nStatus: ${mark?.label || status}${mark?.reason ? `\nReason: ${mark.reason}` : ''}`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] border transition-transform ${badgeClass}`}
                            >
                              {code}
                            </span>
                          </div>
                        </td>
                      );
                    })}

                    {/* Summary Columns */}
                    <td className="py-2 px-2 text-center font-bold text-emerald-700 bg-emerald-50/40 border-r border-slate-100">
                      {row.present}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-rose-700 bg-rose-50/40 border-r border-slate-100">
                      {row.absent}
                    </td>
                    <td className="py-2 px-2 text-center font-medium text-amber-700 bg-amber-50/40 border-r border-slate-100">
                      {row.late}
                    </td>
                    <td className="py-2 px-2 text-center font-medium text-sky-700 bg-sky-50/40 border-r border-slate-100">
                      {row.leave}
                    </td>
                    <td className="py-2 px-2 text-center font-medium text-purple-700 bg-purple-50/40 border-r border-slate-100">
                      {(row.officialLeave || 0) + (row.schoolClosed || 0)}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-slate-800 bg-slate-50/50 border-r border-slate-100">
                      {row.workingDays}
                    </td>
                    <td className="py-2 px-3 text-center border-r border-slate-100">
                      <div className="flex items-center gap-1.5 justify-center">
                        <span
                          className={`font-bold ${
                            row.attendanceRate >= 85
                              ? 'text-emerald-700'
                              : row.attendanceRate >= 70
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {row.attendanceRate}%
                        </span>
                      </div>
                    </td>

                    {/* Staff Financials */}
                    {isStaff && (
                      <>
                        <td className="py-2 px-3 text-right font-medium text-slate-600 border-r border-slate-100">
                          ₨ {((row.dailyRate || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-rose-600 bg-rose-50/30 border-r border-slate-100">
                          ₨ {((row.absentDeduction || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700 bg-emerald-50/30">
                          ₨ {((row.projectedNet || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>

            {/* Bottom Totals Row */}
            {dailyTotals && rows.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-100/95 font-bold text-slate-800 text-[11px] border-t-2 border-slate-300">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-100 py-2.5 px-3 border-r border-slate-200">
                    Daily Present Count
                  </td>
                  {calendarDays.map((cal) => {
                    const count = dailyTotals[cal.day]?.present ?? 0;
                    return (
                      <td
                        key={cal.day}
                        className={`text-center border-r border-slate-200 py-2 px-0.5 ${
                          cal.closure || cal.isSunday ? 'text-slate-400 font-normal' : 'text-emerald-700 font-bold'
                        }`}
                      >
                        {cal.closure ? '—' : cal.isSunday ? 'OFF' : count}
                      </td>
                    );
                  })}
                  <td className="text-center bg-emerald-100/80 text-emerald-900 border-r border-slate-200 py-2">
                    {summaryTotals?.present ?? rows.reduce((acc, r) => acc + r.present, 0)}
                  </td>
                  <td className="text-center bg-rose-100/80 text-rose-900 border-r border-slate-200 py-2">
                    {summaryTotals?.absent ?? rows.reduce((acc, r) => acc + r.absent, 0)}
                  </td>
                  <td className="text-center bg-amber-100/80 text-amber-900 border-r border-slate-200 py-2">
                    {summaryTotals?.late ?? rows.reduce((acc, r) => acc + r.late, 0)}
                  </td>
                  <td className="text-center bg-sky-100/80 text-sky-900 border-r border-slate-200 py-2">
                    {summaryTotals?.leave ?? rows.reduce((acc, r) => acc + r.leave, 0)}
                  </td>
                  <td className="text-center bg-purple-100/80 text-purple-900 border-r border-slate-200 py-2">
                    {(summaryTotals?.officialLeaves || 0) + (summaryTotals?.schoolClosed || 0)}
                  </td>
                  <td className="text-center bg-slate-200 text-slate-900 border-r border-slate-200 py-2">
                    {summaryTotals?.netWorkingDays ?? (calendarDays.filter(c => c.isWorkingDay).length)}
                  </td>
                  <td className="text-center bg-slate-200 text-slate-900 border-r border-slate-200 py-2">
                    —
                  </td>
                  {isStaff && (
                    <>
                      <td className="border-r border-slate-200 py-2" />
                      <td className="text-right px-3 text-rose-700 bg-rose-100/80 border-r border-slate-200 py-2">
                        ₨ {(rows.reduce((acc, r) => acc + (r.absentDeduction || 0), 0) / 100).toLocaleString()}
                      </td>
                      <td className="text-right px-3 text-emerald-700 bg-emerald-100/80 py-2">
                        ₨ {(rows.reduce((acc, r) => acc + (r.projectedNet || 0), 0) / 100).toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
  );
}
