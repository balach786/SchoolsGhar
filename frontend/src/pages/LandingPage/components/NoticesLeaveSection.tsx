import { motion } from 'framer-motion';
import {
  Bell,
  Clock,
  Pin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileCheck,
  UserCheck,
  Sparkles,
  Receipt,
  FileText,
  CalendarCheck2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function NoticesLeaveSection() {
  const notifications = [
    {
      title: 'Final Examination Schedule Published',
      desc: 'Annual date-sheet dispatches to Class 9 and Class 10 candidates.',
      time: '2 min ago',
      type: 'Exam',
      icon: CalendarCheck2,
      color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    },
    {
      title: 'Fee Payment Received · Receipt #RCPT-2048',
      desc: 'Rs 18,500 settled by Muhammad Daniyal (Class 10-A).',
      time: '14 min ago',
      type: 'Finance',
      icon: Receipt,
      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
    {
      title: 'New Assignment · Computer Science',
      desc: 'Engr. Bilal Khan posted OOP Class Inheritance worksheet.',
      time: 'Due Friday',
      type: 'Academics',
      icon: FileText,
      color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    },
  ];

  const leaveRequests = [
    {
      name: 'Ms. Ayesha Siddiqa',
      role: 'Senior English Faculty',
      type: 'Medical Leave',
      duration: '2 Days (Sep 08 – 09)',
      status: 'Approved',
      badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    },
    {
      name: 'Zainab Fatima (Roll #08)',
      role: 'Class 10-A Student',
      type: 'Family Urgent Work',
      duration: '1 Day (Sep 07)',
      status: 'Pending',
      badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    },
    {
      name: 'Hamza Tariq (Roll #14)',
      role: 'Class 8-B Student',
      type: 'Casual Leave',
      duration: '3 Days (Sep 12 – 14)',
      status: 'Rejected',
      badge: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    },
  ];

  return (
    <section className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Left Column: Notices & Notifications */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
              <Bell className="h-3.5 w-3.5" />
              <span>Campus Dispatches</span>
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl font-display">
              Keep Everyone Informed
            </h2>
            <p className="mt-3 text-sm text-[#A7AEC1] leading-relaxed">
              Broadcast school-wide notices, targeted section alerts, and receive instant in-app notification pings across all active portal sessions.
            </p>

            {/* Floating Notification Cards (Prompt-specified examples) */}
            <div className="mt-8 space-y-3.5">
              {notifications.map((n, idx) => {
                const Icon = n.icon;
                return (
                  <motion.div
                    key={n.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-[#131722] p-4 transition-all hover:border-white/20 hover:bg-[#171B27]"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${n.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white truncate">{n.title}</h4>
                        <span className="text-[10px] text-[#77809A] font-mono shrink-0 ml-2">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-[#A7AEC1] mt-0.5">{n.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Leave Management Workflow */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/30 px-3.5 py-1 text-xs font-semibold text-purple-300">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Leave Administration</span>
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl font-display">
              Simple Leave Requests & Approvals
            </h2>
            <p className="mt-3 text-sm text-[#A7AEC1] leading-relaxed">
              Enable students and faculty to log formal absence requests digitally, complete with administrative reviews, approvals, and automated attendance log adjustments.
            </p>

            {/* Leave Request Queue Card */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-[#131722] p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <span className="text-xs font-bold text-white">Active Leave Queue</span>
                <span className="text-[11px] text-[#77809A]">Admin Single-Click Actions</span>
              </div>

              <div className="mt-4 space-y-3">
                {leaveRequests.map((req) => (
                  <div
                    key={req.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-white/5 bg-[#171B27] p-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{req.name}</span>
                        <Badge variant="outline" className="text-[10px] text-[#77809A] border-white/10">
                          {req.role}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[#A7AEC1] mt-0.5">
                        {req.type} · <span className="text-indigo-300">{req.duration}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${req.badge}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status explanation */}
              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-[#77809A]">
                <span>Statuses: Pending · Approved · Rejected</span>
                <span className="text-emerald-400 font-medium">Synced with Daily Roll-Call</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
