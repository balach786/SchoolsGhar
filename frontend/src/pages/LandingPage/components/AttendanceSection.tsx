import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarCheck,
  CheckCircle2,
  XCircle,
  Clock,
  FileSpreadsheet,
  Users,
  Download,
  Check,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function AttendanceSection() {
  const [selectedClass, setSelectedClass] = useState<'8A' | '9B' | '10A'>('8A');

  const classData = {
    '8A': {
      title: 'Class 8 — Section A',
      present: 31,
      absent: 3,
      late: 2,
      leave: 1,
      rate: '91.2%',
      roster: [
        { roll: '01', name: 'Ayaan Ali', status: 'Present', time: '07:54 AM' },
        { roll: '02', name: 'Fatima Zahra', status: 'Present', time: '07:49 AM' },
        { roll: '03', name: 'Hamza Tariq', status: 'Late', time: '08:12 AM' },
        { roll: '04', name: 'Maryam Noor', status: 'Leave', time: 'Medical' },
        { roll: '05', name: 'Zainab Bibi', status: 'Present', time: '07:58 AM' },
        { roll: '06', name: 'Bilal Khan', status: 'Absent', time: 'Unexcused' },
      ],
    },
    '9B': {
      title: 'Class 9 — Section B',
      present: 34,
      absent: 1,
      late: 1,
      leave: 2,
      rate: '94.4%',
      roster: [
        { roll: '01', name: 'Daniyal Qureshi', status: 'Present', time: '07:48 AM' },
        { roll: '02', name: 'Sara Kamran', status: 'Present', time: '07:50 AM' },
        { roll: '03', name: 'Umar Farooq', status: 'Present', time: '07:55 AM' },
        { roll: '04', name: 'Areeba Malik', status: 'Late', time: '08:08 AM' },
        { roll: '05', name: 'Mustafa Raza', status: 'Leave', time: 'Family' },
        { roll: '06', name: 'Hira Siddiqui', status: 'Present', time: '07:59 AM' },
      ],
    },
    '10A': {
      title: 'Class 10 — Section A',
      present: 36,
      absent: 1,
      late: 0,
      leave: 0,
      rate: '97.3%',
      roster: [
        { roll: '01', name: 'Saad Ahmed', status: 'Present', time: '07:42 AM' },
        { roll: '02', name: 'Noor ul Huda', status: 'Present', time: '07:45 AM' },
        { roll: '03', name: 'Hassan Raza', status: 'Present', time: '07:50 AM' },
        { roll: '04', name: 'Zoya Rehan', status: 'Present', time: '07:52 AM' },
        { roll: '05', name: 'Usman Ghani', status: 'Present', time: '07:56 AM' },
        { roll: '06', name: 'Eman Arshad', status: 'Absent', time: 'Sick' },
      ],
    },
  };

  const current = classData[selectedClass];

  return (
    <section id="attendance" className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Feature Narrative */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-1 text-xs font-semibold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Smart Attendance</span>
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display leading-tight">
              Attendance Made Simple
            </h2>
            <p className="mt-4 text-base text-[#A7AEC1] sm:text-lg leading-relaxed">
              Record, review and analyze student and teacher attendance with class-wise, section-wise and monthly insights.
            </p>

            {/* Attendance Feature Highlights Grid */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-2">
              {[
                { title: 'Status Tracking', desc: 'Present, Absent, Late & Leave flags' },
                { title: 'Bulk Attendance', desc: 'Single-click Mark All Present' },
                { title: 'Teacher Attendance', desc: 'Faculty morning check-in ledger' },
                { title: 'Monthly Percentage', desc: 'Automated term threshold warnings' },
                { title: 'CSV & PDF Export', desc: 'Direct regulatory report generation' },
                { title: 'Class Analytics', desc: 'Daily and weekly attendance trends' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/5 bg-[#171B27] p-3.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white">{item.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#77809A]">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Class Switcher Selector */}
            <div className="mt-8 flex items-center gap-2">
              <span className="text-xs font-medium text-[#77809A]">Switch Live Class:</span>
              <div className="flex gap-1.5 rounded-lg border border-white/10 bg-[#171B27] p-1">
                {(['8A', '9B', '10A'] as const).map((cls) => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      selectedClass === cls
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-[#A7AEC1] hover:text-white'
                    }`}
                  >
                    Class {cls}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Attendance Mockup Card */}
          <div className="lg:col-span-6">
            <motion.div
              key={selectedClass}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="relative rounded-2xl border border-white/10 bg-[#171B27] p-6 sm:p-7 shadow-2xl shadow-black/50"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{current.title}</h3>
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                      Today's Register
                    </Badge>
                  </div>
                  <p className="text-xs text-[#77809A] mt-0.5">Session 2025–2026 · Class Teacher: Sir Naeem Khan</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#10131D] px-2.5 py-1 text-xs text-[#A7AEC1]">
                  <Download className="h-3.5 w-3.5 text-indigo-400" />
                  <span>CSV Export</span>
                </div>
              </div>

              {/* Attendance Rate Metric Card */}
              <div className="mt-5 rounded-xl border border-white/5 bg-[#10131D] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-[#77809A]">Attendance Rate</span>
                    <div className="mt-0.5 text-3xl font-extrabold text-white">{current.rate}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-400">High Attendance Tier</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#171B27]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                    style={{ width: current.rate }}
                  />
                </div>
              </div>

              {/* 4 Stat Boxes (Present 31, Absent 3, Late 2, Leave 1) */}
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2.5">
                  <span className="text-[11px] font-medium text-emerald-300">Present</span>
                  <div className="mt-1 text-2xl font-black text-emerald-400">{current.present}</div>
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-2.5">
                  <span className="text-[11px] font-medium text-rose-300">Absent</span>
                  <div className="mt-1 text-2xl font-black text-rose-400">{current.absent}</div>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-2.5">
                  <span className="text-[11px] font-medium text-amber-300">Late</span>
                  <div className="mt-1 text-2xl font-black text-amber-400">{current.late}</div>
                </div>
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-2.5">
                  <span className="text-[11px] font-medium text-indigo-300">Leave</span>
                  <div className="mt-1 text-2xl font-black text-indigo-400">{current.leave}</div>
                </div>
              </div>

              {/* Roster Live Snippet */}
              <div className="mt-5 rounded-xl border border-white/5 bg-[#10131D] p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#77809A] uppercase tracking-wider px-2">
                  <span>Student</span>
                  <span>Status & Log</span>
                </div>
                <div className="space-y-1.5">
                  {current.roster.map((student) => {
                    const statusColors = {
                      Present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      Absent: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                      Late: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      Leave: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    }[student.status];

                    return (
                      <div
                        key={student.roll}
                        className="flex items-center justify-between rounded-lg bg-[#171B27] px-3 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[#77809A] font-mono text-[11px]">#{student.roll}</span>
                          <span className="font-medium text-white">{student.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#77809A] hidden sm:inline">{student.time}</span>
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusColors}`}>
                            {student.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
