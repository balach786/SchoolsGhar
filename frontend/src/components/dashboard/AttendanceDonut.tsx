import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

interface AttendanceDonutProps {
  attendance: AttendanceCounts;
  canTakeAttendance?: boolean;
  onTakeAttendance?: () => void;
  className?: string;
}

const COLORS = {
  present: '#0F7E75', // Primary Teal
  late: '#F59E0B',    // Amber
  leave: '#64748B',   // Slate
  absent: '#E11D48',  // Rose Red
};

export function AttendanceDonut({
  attendance,
  canTakeAttendance,
  onTakeAttendance,
  className,
}: AttendanceDonutProps) {
  const navigate = useNavigate();
  const { present = 0, absent = 0, late = 0, leave = 0, total = 0 } = attendance || {};

  const presentPercentage = total > 0 ? Math.round((present / total) * 100) : 0;
  const absentPercentage = total > 0 ? Math.round((absent / total) * 100) : 0;
  const latePercentage = total > 0 ? Math.round((late / total) * 100) : 0;
  const leavePercentage = total > 0 ? Math.round((leave / total) * 100) : 0;

  const chartData = [
    { name: 'Present', value: present, color: COLORS.present, percentage: presentPercentage },
    { name: 'Late', value: late, color: COLORS.late, percentage: latePercentage },
    { name: 'Leave', value: leave, color: COLORS.leave, percentage: leavePercentage },
    { name: 'Absent', value: absent, color: COLORS.absent, percentage: absentPercentage },
  ].filter((item) => item.value > 0);

  return (
    <Card className={cn(`rounded-2xl border border-[#C7D2FE] bg-gradient-to-br from-[#F5F3FF] to-[#E0E7FF] shadow-sm flex flex-col`, className)}>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-indigo-950">
              Attendance Overview
            </CardTitle>
            <CardDescription className="text-xs text-indigo-700/80 mt-0.5">
              Today's real-time student presence
            </CardDescription>
          </div>
          {total > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {presentPercentage}% Present
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
        {total === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
              <ClipboardCheck className="h-6 w-6 stroke-[1.8]" />
            </div>
            <p className="text-sm font-semibold text-foreground">No Attendance Recorded</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              Roll call has not been submitted for today yet.
            </p>
            {canTakeAttendance && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 rounded-xl text-xs"
                onClick={() => (onTakeAttendance ? onTakeAttendance() : navigate('/attendance'))}
              >
                Take Attendance
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col justify-between h-full gap-4">
            {/* Donut Chart with Center Metric */}
            <div className="relative h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      `${val} students (${total > 0 ? Math.round((val / total) * 100) : 0}%)`,
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Pie
                    data={chartData.length > 0 ? chartData : [{ name: 'None', value: 1, color: '#E2E8F0' }]}
                    innerRadius={52}
                    outerRadius={74}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold tracking-tight text-foreground">{total}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Today
                </span>
              </div>
            </div>

            {/* Legend Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-primary/5 p-2 px-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#0F7E75]" />
                  <span className="text-muted-foreground font-medium">Present</span>
                </div>
                <span className="font-bold text-foreground">
                  {present} <span className="text-[11px] text-muted-foreground font-normal">({presentPercentage}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-amber-500/5 p-2 px-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                  <span className="text-muted-foreground font-medium">Late</span>
                </div>
                <span className="font-bold text-foreground">
                  {late} <span className="text-[11px] text-muted-foreground font-normal">({latePercentage}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-500/5 p-2 px-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#64748B]" />
                  <span className="text-muted-foreground font-medium">Leave</span>
                </div>
                <span className="font-bold text-foreground">
                  {leave} <span className="text-[11px] text-muted-foreground font-normal">({leavePercentage}%)</span>
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-rose-500/5 p-2 px-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#E11D48]" />
                  <span className="text-muted-foreground font-medium">Absent</span>
                </div>
                <span className="font-bold text-foreground">
                  {absent} <span className="text-[11px] text-muted-foreground font-normal">({absentPercentage}%)</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
