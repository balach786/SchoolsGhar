import {
  GraduationCap,
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  Wallet,
  Clock,
  BookOpen,
  Award,
  Search,
  Bell,
  Sparkles,
  CalendarRange,
  CheckCircle2,
  FileSpreadsheet,
  Megaphone,
} from 'lucide-react';

export function DashboardPreviewMockup() {
  return (
    <div
      className="product-frame relative select-none rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-blue-950/15 transition-transform duration-500 ease-out hover:rotate-0 dark:border-slate-800 dark:bg-slate-900"
      style={{
        transform: 'perspective(1200px) rotateY(-4deg) rotateX(2deg)',
      }}
      role="img"
      aria-label="Interactive preview of School Management System dashboard"
    >
      {/* Chrome header */}
      <div className="flex h-8 items-center gap-2 border-b border-slate-200/80 bg-slate-100/90 px-3.5 dark:border-slate-800 dark:bg-slate-800/80">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs dark:bg-slate-900/60 dark:text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>School Prime · Academic Portal v2.4</span>
        </div>
      </div>

      {/* Screen layout */}
      <div className="flex h-[420px] overflow-hidden">        <img
        src="/dashboard-preview-2026-v3.png"
        alt="SchoolsGhar Dashboard Preview"
        className="w-full h-full object-cover object-left-top"
      />      </div>
    </div>
  );
}
