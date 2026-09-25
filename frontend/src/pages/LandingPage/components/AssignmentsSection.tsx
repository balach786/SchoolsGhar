import { motion } from 'framer-motion';
import {
  FileText,
  Calendar,
  Paperclip,
  CheckCircle2,
  Clock,
  MessageSquare,
  Sparkles,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function AssignmentsSection() {
  const assignments = [
    {
      id: 1,
      title: 'Thermodynamics & Heat Capacity Lab Report',
      subject: 'Physics',
      className: 'Class 10 — Section A',
      teacher: 'Dr. Zulfiqar Ali',
      dueDate: 'Sep 08, 2026',
      status: 'Active',
      submissions: { submitted: 34, pending: 3 },
      badgeColor: 'border-blue-500/30 bg-blue-950/20 text-blue-300',
    },
    {
      id: 2,
      title: 'Quadratic Equations & Parabolic Curves',
      subject: 'Mathematics',
      className: 'Class 9 — Section B',
      teacher: 'Sir Tariq Mahmood',
      dueDate: 'Sep 10, 2026',
      status: 'Graded',
      submissions: { submitted: 36, pending: 0 },
      badgeColor: 'border-purple-500/30 bg-purple-950/20 text-purple-300',
    },
    {
      id: 3,
      title: 'Object-Oriented Programming: Class Inheritance',
      subject: 'Computer Science',
      className: 'Class 10 — Section B',
      teacher: 'Engr. Bilal Khan',
      dueDate: 'Sep 12, 2026',
      status: 'Active',
      submissions: { submitted: 28, pending: 6 },
      badgeColor: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
    },
  ];

  return (
    <section className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Digital Homework & Submissions</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Keep Teachers and Students Connected
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Empower educators to dispatch coursework with attachments, track digital submissions in real time, and return structured qualitative feedback.
          </p>
        </div>

        {/* Assignments Cards Showcase */}
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {assignments.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="rounded-2xl border border-white/10 bg-[#171B27] p-6 transition-all hover:border-white/20 hover:shadow-xl hover:shadow-indigo-950/20 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold ${item.badgeColor}`}>
                    {item.subject}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#77809A]">
                    <Clock className="h-3 w-3" />
                    Due {item.dueDate}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-bold text-white line-clamp-2">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-[#A7AEC1]">
                  {item.className} · {item.teacher}
                </p>

                {/* Submission Progress bar */}
                <div className="mt-5 rounded-xl border border-white/5 bg-[#10131D] p-3.5">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#A7AEC1]">Turn-in Progress</span>
                    <span className="font-semibold text-emerald-400">
                      {item.submissions.submitted} of {item.submissions.submitted + item.submissions.pending}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#171B27]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                      style={{
                        width: `${
                          (item.submissions.submitted /
                            (item.submissions.submitted + item.submissions.pending)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-[#77809A]">
                    <span>{item.submissions.submitted} Submitted</span>
                    <span>{item.submissions.pending} Pending</span>
                  </div>
                </div>
              </div>

              {/* Footer capabilities */}
              <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-3.5 text-xs text-[#A7AEC1]">
                <div className="flex items-center gap-1.5 text-indigo-300">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>PDF / DOCX Attached</span>
                </div>
                <div className="flex items-center gap-1 text-[#77809A]">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Teacher Notes</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Capabilities Checklist */}
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            'Class & Section Targeted',
            'Multiple File Attachments',
            'Late Turn-in Flagging',
            'Qualitative Teacher Feedback',
          ].map((cap) => (
            <div key={cap} className="rounded-xl border border-white/5 bg-[#131722] p-3 text-xs font-semibold text-[#A7AEC1]">
              ✓ {cap}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
