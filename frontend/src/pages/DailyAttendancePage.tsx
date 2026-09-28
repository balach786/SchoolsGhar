import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Users, GraduationCap, BriefcaseBusiness, CheckCircle2, Clock, AlertCircle, TrendingUp, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface DailyOverviewData {
  dayByDay: {
    date: string;
    student: { present: number; total: number };
    teacher: { present: number; total: number };
    staff: { present: number; total: number };
  }[];
  classStatusSummary: {
    totalClasses: number;
    completedClasses: number;
    pendingClasses: number;
    classes: { id: string; name: string; status: 'Completed' | 'Pending' }[];
  };
}

export function DailyAttendancePage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [overview, setOverview] = useState<DailyOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ success: boolean; data: DailyOverviewData }>('/attendance/overview/daily-overview')
      .then(res => {
        if (res.data?.success) setOverview(res.data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const canStudent = can('studentAttendance', 'view');
  const canTeacher = can('teacherAttendance', 'view');
  const canNonTeaching = can('nonTeachingAttendance', 'view');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Attendance"
        description="Manage daily attendance for students and teachers."
        crumbs={[
          { label: 'Attendance' },
          { label: 'Daily Attendance' },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
        {canStudent && (
          <div
            onClick={() => navigate('/attendance')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-indigo-100 bg-[#EEF2FF] p-8 min-h-[200px] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="pr-4">
                <h3 className="text-xl font-bold text-slate-800">Student Attendance</h3>
                <p className="text-base leading-relaxed text-slate-500 mt-2">
                  Record and manage daily attendance for enrolled students.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#4F46E5] text-white shadow-lg shadow-indigo-600/30 transition-transform group-hover:scale-110">
                <Users className="h-8 w-8" />
              </div>
            </div>
          </div>
        )}

        {canTeacher && (
          <div
            onClick={() => navigate('/teacher-attendance')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-emerald-100 bg-[#ECFDF5] p-8 min-h-[200px] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="pr-4">
                <h3 className="text-xl font-bold text-slate-800">Teacher Attendance</h3>
                <p className="text-base leading-relaxed text-slate-500 mt-2">
                  Track and review daily check-ins for the teaching faculty.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#059669] text-white shadow-lg shadow-emerald-600/30 transition-transform group-hover:scale-110">
                <GraduationCap className="h-8 w-8" />
              </div>
            </div>
          </div>
        )}

        {canNonTeaching && (
          <div
            onClick={() => navigate('/non-teaching-attendance')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-purple-100 bg-[#FAF5FF] p-8 min-h-[200px] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="pr-4">
                <h3 className="text-xl font-bold text-slate-800">Non-Teaching Staff</h3>
                <p className="text-base leading-relaxed text-slate-500 mt-2">
                  Manage attendance for office, support, and administrative staff.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#9333EA] text-white shadow-lg shadow-purple-600/30 transition-transform group-hover:scale-110">
                <BriefcaseBusiness className="h-8 w-8" />
              </div>
            </div>
          </div>
        )}

        {!canStudent && !canTeacher && !canNonTeaching && (
          <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            You do not have permission to view attendance records.
          </div>
        )}
      </div>

      {/* Day-by-Day and Today's Class Status Sections */}
      {(canStudent || canTeacher || canNonTeaching) && !loading && overview && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
          {/* Day-by-Day Attendance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col max-h-[600px]">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />
              Day-by-Day Attendance
            </h3>
            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
              {overview.dayByDay.map((day) => (
                <div key={day.date} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                  <h4 className="font-semibold text-slate-800 mb-3">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-indigo-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-indigo-600 font-medium mb-1">Students</p>
                      <p className="text-sm font-bold text-indigo-900">{day.student.present} / {day.student.total}</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-emerald-600 font-medium mb-1">Teachers</p>
                      <p className="text-sm font-bold text-emerald-900">{day.teacher.present} / {day.teacher.total}</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-purple-600 font-medium mb-1">Staff</p>
                      <p className="text-sm font-bold text-purple-900">{day.staff.present} / {day.staff.total}</p>
                    </div>
                  </div>
                </div>
              ))}
              {overview.dayByDay.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  No attendance records found for the past week.
                </div>
              )}
            </div>
          </div>

          {/* Today's Class Attendance Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col max-h-[600px]">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Today's Class Attendance Status
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                <p className="text-sm text-emerald-600 font-medium mb-1">Completed</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {overview.classStatusSummary.completedClasses} <span className="text-sm text-emerald-600/70 font-medium">/ {overview.classStatusSummary.totalClasses}</span>
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center">
                <p className="text-sm text-amber-600 font-medium mb-1">Pending</p>
                <p className="text-2xl font-bold text-amber-700">
                  {overview.classStatusSummary.pendingClasses}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-2">
              <div className="space-y-3">
                {overview.classStatusSummary.classes.map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                    <span className="font-semibold text-slate-700">{cls.name}</span>
                    {cls.status === 'Completed' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        <Clock className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
}
