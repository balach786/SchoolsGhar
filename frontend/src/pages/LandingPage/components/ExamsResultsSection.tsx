import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Award,
  CheckCircle2,
  Printer,
  Sparkles,
  Download,
  Calendar,
  FileCheck2,
  Medal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ExamsResultsSection() {
  const topStudents = [
    { rank: '1st', name: 'Zainab Fatima', score: '96.4%', grade: 'A+', result: 'Pass' },
    { rank: '2nd', name: 'Hamza Tariq', score: '94.8%', grade: 'A+', result: 'Pass' },
    { rank: '3rd', name: 'Bilal Ahmed', score: '92.0%', grade: 'A', result: 'Pass' },
    { rank: '4th', name: 'Maryam Noor', score: '89.5%', grade: 'A', result: 'Pass' },
  ];

  return (
    <section id="exams" className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Result Analytics Mockup Card */}
          <div className="lg:col-span-6 order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-white/10 bg-[#171B27] p-6 sm:p-7 shadow-2xl shadow-black/60"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">Grade 10A</h3>
                    <span className="text-xs text-[#77809A]">·</span>
                    <span className="text-sm font-semibold text-indigo-300">Final Examination</span>
                  </div>
                  <p className="text-xs text-[#77809A] mt-0.5">Session 2025–2026 · Cumulative Grading</p>
                </div>
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                  Published
                </Badge>
              </div>

              {/* 4 Core Metrics: Class Avg 82%, Pass Rate 94%, Highest 96%, Students 37 */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-white/5 bg-[#10131D] p-3 text-center">
                  <span className="text-[11px] font-medium text-[#77809A]">Class Average</span>
                  <div className="mt-1 text-2xl font-black text-white">82%</div>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-center">
                  <span className="text-[11px] font-medium text-emerald-300">Pass Rate</span>
                  <div className="mt-1 text-2xl font-black text-emerald-400">94%</div>
                </div>
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 text-center">
                  <span className="text-[11px] font-medium text-indigo-300">Highest Score</span>
                  <div className="mt-1 text-2xl font-black text-indigo-400">96%</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-[#10131D] p-3 text-center">
                  <span className="text-[11px] font-medium text-[#77809A]">Enrolled</span>
                  <div className="mt-1 text-2xl font-black text-white">37</div>
                </div>
              </div>

              {/* Grade Distribution Bar Chart Simulation */}
              <div className="mt-5 rounded-xl border border-white/5 bg-[#10131D] p-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-white">Grade Tier Breakdown</span>
                  <span className="text-[11px] text-[#77809A]">35 Passed · 2 Re-takes</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-[#A7AEC1] mb-1">
                      <span>Grade A+ (85%–100%)</span>
                      <span className="font-semibold text-white">16 Students (43%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#171B27]">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: '43%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#A7AEC1] mb-1">
                      <span>Grade A (75%–84%)</span>
                      <span className="font-semibold text-white">12 Students (32%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#171B27]">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: '32%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#A7AEC1] mb-1">
                      <span>Grade B (60%–74%)</span>
                      <span className="font-semibold text-white">7 Students (19%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#171B27]">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: '19%' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Class Merit Ranking List */}
              <div className="mt-5 rounded-xl border border-white/5 bg-[#10131D] p-3">
                <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-semibold text-[#77809A] uppercase tracking-wider">
                  <span>Class Merit Ranking</span>
                  <span>Percentage & Grade</span>
                </div>
                <div className="space-y-1.5">
                  {topStudents.map((st) => (
                    <div
                      key={st.name}
                      className="flex items-center justify-between rounded-lg bg-[#171B27] px-3 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-7 items-center justify-center rounded bg-indigo-600/20 font-mono text-[10px] font-bold text-indigo-300">
                          {st.rank}
                        </span>
                        <span className="font-medium text-white">{st.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400">{st.score}</span>
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]">
                          Grade {st.grade}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Print Result Card Action */}
              <div className="mt-4 flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[11px] text-[#77809A]">Printable Watermarked Result Cards ready</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/10 bg-[#10131D] text-xs text-white hover:bg-white/10"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
                  Print Result Cards
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Workflow Narrative */}
          <div className="lg:col-span-6 order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Exams & Results</span>
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display leading-tight">
              From Exam Scheduling to Final Results
            </h2>
            <p className="mt-4 text-base text-[#A7AEC1] sm:text-lg leading-relaxed">
              Create exams, schedule subjects, enter marks, calculate grades, publish results and generate professional result cards from a single workflow.
            </p>

            {/* Feature Checklist */}
            <div className="mt-8 space-y-3">
              {[
                { title: 'Multiple Exam Formats', desc: 'Monthly Tests, Midterms, Final Examinations, and Custom Term Assessments' },
                { title: 'Intuitive Marks Entry', desc: 'Subject teacher marks spreadsheets with automated validation and max score ceilings' },
                { title: 'Automatic Percentage & Grading', desc: 'Instant calculation of overall percentages, school letter grades, and Pass / Fail status' },
                { title: 'Class Merit Ranking', desc: 'Automatic calculation of class positions, highest scorers, and section medians' },
                { title: 'Printable Result Cards & Transcripts', desc: 'Official formatted report cards with school logo, principal signature block, and student ledger' },
                { title: 'CSV & Analytical Exports', desc: 'One-click consolidated tabulation sheets ready for education board compliance' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-xl border border-white/5 bg-[#171B27] p-3.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-bold text-white">{item.title}</h4>
                    <p className="text-[11px] text-[#A7AEC1] mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
