import { useNavigate } from 'react-router-dom';
import { Users, GraduationCap, BriefcaseBusiness, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/AuthContext';

export function DailyAttendancePage() {
  const navigate = useNavigate();
  const { can } = useAuth();

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

      {/* Today's Overview Section */}
      {(canStudent || canTeacher || canNonTeaching) && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Today's Attendance Trends</h3>
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <div className="text-center text-slate-500">
                <TrendingUp className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>Attendance charts will appear here once data is recorded for the day.</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Recent Activity</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Class 10-A Attendance Marked</p>
                  <p className="text-xs text-slate-500 mt-1">45/45 Students Present • 10 mins ago</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Teacher Check-ins</p>
                  <p className="text-xs text-slate-500 mt-1">12/16 Teachers Arrived • 45 mins ago</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Missing Registers</p>
                  <p className="text-xs text-slate-500 mt-1">3 classes haven't marked attendance yet</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
