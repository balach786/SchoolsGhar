import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  Printer,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AcademicsTimetableSection() {
  const [selectedDay, setSelectedDay] = useState<
    'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
  >('Monday');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

  const timetableData: Record<
    string,
    Array<{ period: number; time: string; subject: string; teacher: string; category: string }>
  > = {
    Monday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'English', teacher: 'Ms. Ayesha Siddiqa', category: 'Language' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
      { period: 5, time: '11:15 – 12:00 PM', subject: 'Urdu', teacher: 'Sir Munir Ahmed', category: 'Language' },
      { period: 6, time: '12:00 – 12:45 PM', subject: 'Chemistry', teacher: 'Dr. Shaheen Parveen', category: 'Science' },
    ],
    Tuesday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'English', teacher: 'Ms. Ayesha Siddiqa', category: 'Language' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'Chemistry', teacher: 'Dr. Shaheen Parveen', category: 'Science' },
      { period: 5, time: '11:15 – 12:00 PM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
      { period: 6, time: '12:00 – 12:45 PM', subject: 'Urdu', teacher: 'Sir Munir Ahmed', category: 'Language' },
    ],
    Wednesday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'English', teacher: 'Ms. Ayesha Siddiqa', category: 'Language' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'Urdu', teacher: 'Sir Munir Ahmed', category: 'Language' },
      { period: 5, time: '11:15 – 12:00 PM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
      { period: 6, time: '12:00 – 12:45 PM', subject: 'Chemistry', teacher: 'Dr. Shaheen Parveen', category: 'Science' },
    ],
    Thursday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'Chemistry', teacher: 'Dr. Shaheen Parveen', category: 'Science' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
      { period: 5, time: '11:15 – 12:00 PM', subject: 'English', teacher: 'Ms. Ayesha Siddiqa', category: 'Language' },
      { period: 6, time: '12:00 – 12:45 PM', subject: 'Urdu', teacher: 'Sir Munir Ahmed', category: 'Language' },
    ],
    Friday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'Urdu', teacher: 'Sir Munir Ahmed', category: 'Language' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'English', teacher: 'Ms. Ayesha Siddiqa', category: 'Language' },
      { period: 5, time: '11:15 – 12:00 PM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
    ],
    Saturday: [
      { period: 1, time: '08:00 – 08:45 AM', subject: 'Mathematics', teacher: 'Sir Tariq Mahmood', category: 'Math' },
      { period: 2, time: '08:45 – 09:30 AM', subject: 'Physics', teacher: 'Dr. Zulfiqar Ali', category: 'Science' },
      { period: 3, time: '09:30 – 10:15 AM', subject: 'Chemistry', teacher: 'Dr. Shaheen Parveen', category: 'Science' },
      { period: 4, time: '10:30 – 11:15 AM', subject: 'Computer Science', teacher: 'Engr. Bilal Khan', category: 'Tech' },
    ],
  };

  const currentPeriods = timetableData[selectedDay] || timetableData['Monday'];

  return (
    <section id="academics" className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/30 px-3.5 py-1 text-xs font-semibold text-purple-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Academic Infrastructure</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Academics, Organized From One Dashboard
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Effortlessly coordinate sessions, classes, sections, subjects, teacher assignments, and collision-free schedules.
          </p>
        </div>

        {/* 3 Core Academic Pillars */}
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#131722] p-6 transition-all hover:border-white/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Hierarchical Structure</h3>
            <p className="mt-1.5 text-xs text-[#A7AEC1] leading-relaxed">
              Classes seamlessly connect to Sections, Subjects, and designated Class Teachers with student capacity caps.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#131722] p-6 transition-all hover:border-white/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Promotion & Sessions</h3>
            <p className="mt-1.5 text-xs text-[#A7AEC1] leading-relaxed">
              One-click batch promotion advances students between academic sessions while preserving historical grades.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#131722] p-6 transition-all hover:border-white/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">Conflict-Free Schedules</h3>
            <p className="mt-1.5 text-xs text-[#A7AEC1] leading-relaxed">
              Algorithmic collision checks prevent double-booking faculty or overlapping class periods across Monday to Saturday.
            </p>
          </div>
        </div>

        {/* TIMETABLE FEATURE COMPONENT (Prompt strictly highlighted) */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl">
          {/* Top Control Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl font-bold text-white">Interactive Class Timetable</h3>
                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                  Class 10 — Section A
                </Badge>
              </div>
              <p className="text-xs text-[#77809A] mt-1">
                Automated period sequencing with conflict validation for all core subjects
              </p>
            </div>

            {/* Print & Conflict Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="font-medium">No Teacher / Class Conflicts</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-white/10 bg-[#171B27] text-xs text-[#F7F8FC] hover:bg-white/10"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
                <span>Printable Timetable</span>
              </Button>
            </div>
          </div>

          {/* Day Navigation Tabs (Monday through Saturday) */}
          <div className="mt-6 flex flex-wrap gap-2 border-b border-white/5 pb-4">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  selectedDay === day
                    ? 'bg-gradient-to-r from-[#4F46E5] to-[#7467FF] text-white shadow-lg shadow-indigo-600/30'
                    : 'border border-white/5 bg-[#171B27] text-[#A7AEC1] hover:bg-[#1B1F2C] hover:text-white'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Periods Table / Cards */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currentPeriods.map((slot) => {
              const categoryColors = {
                Math: 'border-blue-500/30 bg-blue-950/20 text-blue-300',
                Language: 'border-amber-500/30 bg-amber-950/20 text-amber-300',
                Science: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
                Tech: 'border-purple-500/30 bg-purple-950/20 text-purple-300',
              }[slot.category] || 'border-indigo-500/30 bg-indigo-950/20 text-indigo-300';

              return (
                <motion.div
                  key={slot.period}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-white/5 bg-[#171B27] p-4 transition-all hover:border-white/15"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-[#10131D] px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-400 border border-white/5">
                      Period 0{slot.period}
                    </span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${categoryColors}`}>
                      {slot.subject}
                    </span>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-base font-bold text-white">{slot.subject}</h4>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[#A7AEC1]">
                      <BookOpen className="h-3.5 w-3.5 text-[#77809A]" />
                      <span>{slot.teacher}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#77809A] border-t border-white/5 pt-2.5">
                    <Clock className="h-3 w-3" />
                    <span>{slot.time}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Timetable Highlights Footer */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#10131D] p-4 text-xs text-[#A7AEC1]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Verified Conflict-Free: Faculty schedules synced across 84 staff members.
              </span>
            </div>
            <span className="text-[11px] text-[#77809A]">
              Subjects: English · Mathematics · Physics · Computer Science · Urdu · Chemistry
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
