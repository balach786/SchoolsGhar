import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  FileSpreadsheet,
  Download,
  Printer,
  Search,
  Filter,
  TrendingUp,
  PieChart,
  Calendar,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ReportsAnalyticsSection() {
  const reportCategories = [
    { title: 'Student Roster Reports', count: '1,420 records', type: 'Directory' },
    { title: 'Faculty & Workload Reports', count: '84 faculty', type: 'Staff' },
    { title: 'Attendance Audit Sheets', count: '96.4% avg', type: 'Daily / Monthly' },
    { title: 'Fee Inflow & Defaulter Ledgers', count: 'Rs 865k collected', type: 'Financial' },
    { title: 'Institutional Expenses & Payroll', count: 'Rs 215k spent', type: 'Ledger' },
    { title: 'Exam Transcripts & Result Gazettes', count: '37 classes', type: 'Academic' },
  ];

  return (
    <section id="reports" className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Executive Intelligence</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Reports That Turn School Data Into Decisions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Generate audit-ready reports across academics, attendance, fees, expenses, and staff performance with one-click export.
          </p>
        </div>

        {/* Analytics Showcase Grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 Cols: Multi-Metric Visual Charts */}
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Enrollment & Institutional Revenue Trend</h3>
                <p className="text-xs text-[#77809A]">Continuous 6-month historical trajectory</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 text-xs">
                  Academic Year 2025–2026
                </Badge>
              </div>
            </div>

            {/* Custom Interactive SVG Chart Representation */}
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-[#A7AEC1] mb-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Fee Collection (Rs)
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Attendance (%)
                </span>
              </div>

              {/* Monthly Bars simulation */}
              <div className="grid grid-cols-6 gap-2 sm:gap-4 pt-6 pb-2 items-end h-48 border-b border-white/10">
                {[
                  { month: 'Apr', fee: '65%', rate: '92%' },
                  { month: 'May', fee: '72%', rate: '94%' },
                  { month: 'Jun', fee: '58%', rate: '89%' },
                  { month: 'Jul', fee: '78%', rate: '95%' },
                  { month: 'Aug', fee: '84%', rate: '96%' },
                  { month: 'Sep', fee: '92%', rate: '96.4%' },
                ].map((item) => (
                  <div key={item.month} className="flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      <div
                        className="w-1/2 rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400"
                        style={{ height: item.fee }}
                      />
                      <div
                        className="w-1/2 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400"
                        style={{ height: item.rate }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-[#77809A]">{item.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Export Toolbar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#77809A]">Formats supported: CSV · Printable PDF · Board Tabulation</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/10 bg-[#171B27] text-white hover:bg-white/5 text-xs"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/10 bg-[#171B27] text-white hover:bg-white/5 text-xs"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
                  Print Report
                </Button>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Available Report Modules Suite */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h3 className="text-base font-bold text-white">Consolidated Report Modules</h3>
                <span className="text-xs text-[#77809A]">12+ Core Reports</span>
              </div>

              <div className="mt-4 space-y-2.5">
                {reportCategories.map((rep) => (
                  <div
                    key={rep.title}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-[#171B27] p-3 transition-colors hover:border-white/15"
                  >
                    <div>
                      <h4 className="text-xs font-semibold text-white">{rep.title}</h4>
                      <span className="text-[10px] text-[#77809A]">{rep.count}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-indigo-300 border-indigo-500/20 bg-indigo-500/10">
                      {rep.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-indigo-500/10 p-3.5 border border-indigo-500/20 text-xs text-[#A7AEC1]">
              <span className="font-semibold text-white">Parametric Filters:</span> Filter any report by Date Range, Academic Session, Class & Section, Gender, or Payment Status.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
