import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  GraduationCap,
  Calendar,
  Layers,
  Search,
  CheckCircle,
  FileSpreadsheet,
  Briefcase,
  History,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

export function PlatformOverviewSection() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'people' | 'academics' | 'records'>('all');

  const cards = [
    {
      id: 'students',
      category: 'people',
      title: 'Student Management',
      subtitle: 'Complete lifecycle administration from inquiry to alumni',
      icon: Users,
      badge: 'Core Directory',
      features: [
        'Admissions & Digital Enrollment',
        'Detailed Student Profiles & Photos',
        'Academic & Attendance History',
        'Class & Section Assignment',
        'Guardian Contact & Emergency Info',
        'Fast Global Search & Filter Engine',
      ],
      stat: '1,420 Active Enrollees',
      gradient: 'from-blue-500/10 to-indigo-500/10',
      borderAccent: 'group-hover:border-indigo-500/40',
      iconColor: 'text-indigo-400',
    },
    {
      id: 'teachers',
      category: 'people',
      title: 'Teacher & Staff Management',
      subtitle: 'Faculty allocation, workload management, and credentials',
      icon: GraduationCap,
      badge: 'Faculty Operations',
      features: [
        'Teacher Profiles & Subject Specialization',
        'Class & Section Teacher Allocation',
        'Subject Assignment & Period Tracking',
        'Daily Faculty Attendance Records',
        'Salary Structures & Payroll Logs',
        'Weekly Teaching Workload Overview',
      ],
      stat: '84 Faculty Members',
      gradient: 'from-purple-500/10 to-indigo-500/10',
      borderAccent: 'group-hover:border-purple-500/40',
      iconColor: 'text-purple-400',
    },
    {
      id: 'sessions',
      category: 'academics',
      title: 'Academic Sessions & Promotion',
      subtitle: 'Structured term management and batch progression',
      icon: Calendar,
      badge: 'Session Control',
      features: [
        'Active Academic Session Control (2025–2026)',
        'Historical Session Archival & Records',
        'Automated Batch Student Promotion',
        'Multi-Session Data Segregation',
        'Session-Wise Fee & Exam Ledgers',
        'Permanent Historical Audit Trail',
      ],
      stat: 'Active Session 2025–2026',
      gradient: 'from-teal-500/10 to-emerald-500/10',
      borderAccent: 'group-hover:border-emerald-500/40',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'classes',
      category: 'records',
      title: 'Classes, Sections & Subjects',
      subtitle: 'Granular institutional structure without clutter',
      icon: Layers,
      badge: 'Class Architecture',
      features: [
        'Nursery through Grade 12 Structure',
        'Multi-Section Capacity Balancing',
        'Class Teacher & Mentor Designations',
        'Subject Syllabi & Credit Assignment',
        'Real-Time Student Strength Counters',
        'One-Click Class Roster Exports',
      ],
      stat: '28 Class Divisions',
      gradient: 'from-amber-500/10 to-orange-500/10',
      borderAccent: 'group-hover:border-amber-500/40',
      iconColor: 'text-amber-400',
    },
  ];

  const filteredCards =
    activeFilter === 'all' ? cards : cards.filter((c) => c.category === activeFilter);

  return (
    <section id="features" className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      {/* Subtle Ambient Flare */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[900px] rounded-full bg-indigo-600/5 blur-[160px] -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Complete School Operations</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Everything Your School Needs in One Place
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Replace disconnected spreadsheets, paper records and multiple systems with one centralized school management platform.
          </p>

          {/* Reference-Style Pill Filters */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {[
              { id: 'all', label: 'All Modules' },
              { id: 'people', label: 'Students & Faculty' },
              { id: 'academics', label: 'Academic Sessions' },
              { id: 'records', label: 'Classes & Sections' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id as any)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                  activeFilter === f.id
                    ? 'bg-white text-black shadow-md shadow-white/10'
                    : 'border border-white/10 bg-[#171B27] text-[#A7AEC1] hover:bg-white/5 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feature Cards Grid (2x2 Reference SaaS Grid) */}
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {filteredCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-950/30 ${card.borderAccent}`}
              >
                {/* Subtle Gradient Glow inside card */}
                <div
                  className={`pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br ${card.gradient} blur-2xl transition-opacity group-hover:opacity-100 opacity-60`}
                />

                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    {/* Top Row: Icon and Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#171B27]">
                        <Icon className={`h-6 w-6 ${card.iconColor}`} />
                      </div>
                      <span className="rounded-full border border-white/10 bg-[#10131D] px-3 py-1 text-[11px] font-semibold text-[#A7AEC1]">
                        {card.badge}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <h3 className="mt-5 text-xl font-bold tracking-tight text-white sm:text-2xl">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#A7AEC1] leading-relaxed">
                      {card.subtitle}
                    </p>

                    {/* Checklist of Features */}
                    <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 border-t border-white/5 pt-5">
                      {card.features.map((feat) => (
                        <div key={feat} className="flex items-start gap-2 text-xs text-[#F7F8FC]">
                          <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Stat pill */}
                  <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
                    <span className="text-xs font-semibold text-[#77809A]">Live Scope</span>
                    <span className="text-xs font-bold text-white bg-[#171B27] px-3 py-1 rounded-md border border-white/5">
                      {card.stat}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
