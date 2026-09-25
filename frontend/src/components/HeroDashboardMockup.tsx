import { useState, useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, useSpring } from 'framer-motion';
import {
  Users,
  GraduationCap,
  ClipboardCheck,
  Wallet,
  LayoutDashboard,
  Search,
  Bell,
  Sun,
  School,
  Building2,
  CalendarRange,
  ChevronLeft,
  LogOut,
  FileSpreadsheet,
  CircleDollarSign,
  UserCheck,
  Clock,
  Megaphone,
  BookMarked,
  BarChart3,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function HeroDashboardMockup() {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const quickActionsRow1 = [
    {
      id: 'student',
      name: 'Add Student',
      sub: 'New enrollment',
      icon: Users,
      cardBg: 'bg-[#EFF6FF] hover:bg-[#DBEAFE] border-[#BFDBFE]/80',
      iconBg: 'bg-blue-100 text-blue-700',
      titleColor: 'text-blue-950',
      subColor: 'text-blue-700/80',
    },
    {
      id: 'teacher',
      name: 'Add Teacher',
      sub: 'Faculty onboarding',
      icon: GraduationCap,
      cardBg: 'bg-[#F0F9FF] hover:bg-[#E0F2FE] border-[#BAE6FD]/80',
      iconBg: 'bg-sky-100 text-sky-700',
      titleColor: 'text-sky-950',
      subColor: 'text-sky-700/80',
    },
    {
      id: 'attendance',
      name: 'Take Attendance',
      sub: 'Daily roll-call',
      icon: ClipboardCheck,
      cardBg: 'bg-[#F0FDF4] hover:bg-[#DCFCE7] border-[#BBF7D0]/80',
      iconBg: 'bg-emerald-100 text-emerald-700',
      titleColor: 'text-emerald-950',
      subColor: 'text-emerald-700/80',
    },
    {
      id: 'fee',
      name: 'Collect Monthly Fee',
      sub: 'Tuition receipts',
      icon: Wallet,
      cardBg: 'bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A]/80',
      iconBg: 'bg-amber-100 text-amber-700',
      titleColor: 'text-amber-950',
      subColor: 'text-amber-700/80',
    },
    {
      id: 'exam',
      name: 'Create Exam',
      sub: 'Tests & schedules',
      icon: FileSpreadsheet,
      cardBg: 'bg-[#F5F3FF] hover:bg-[#EDE9FE] border-[#DDD6FE]/80',
      iconBg: 'bg-indigo-100 text-indigo-700',
      titleColor: 'text-indigo-950',
      subColor: 'text-indigo-700/80',
    },
    {
      id: 'expense',
      name: 'Add Expense',
      sub: 'Campus spend',
      icon: CircleDollarSign,
      cardBg: 'bg-[#FFF7ED] hover:bg-[#FFEDD5] border-[#FED7AA]/80',
      iconBg: 'bg-orange-100 text-orange-700',
      titleColor: 'text-orange-950',
      subColor: 'text-orange-700/80',
    },
  ];

  const quickActionsRow2 = [
    {
      id: 'notice',
      name: 'Create Notice',
      sub: 'School circulars',
      icon: Megaphone,
      cardBg: 'bg-[#FEFCE8] hover:bg-[#FEF9C3] border-[#FEF08A]/80',
      iconBg: 'bg-yellow-100 text-yellow-700',
      titleColor: 'text-yellow-950',
      subColor: 'text-yellow-700/80',
    },
    {
      id: 'staff-att',
      name: 'Staff Attendance',
      sub: 'Faculty check-in',
      icon: UserCheck,
      cardBg: 'bg-[#F0FDF4] hover:bg-[#DCFCE7] border-[#BBF7D0]/80',
      iconBg: 'bg-teal-100 text-teal-700',
      titleColor: 'text-teal-950',
      subColor: 'text-teal-700/80',
    },
    {
      id: 'assignment',
      name: 'Add Assignment',
      sub: 'Homework syllabus',
      icon: BookMarked,
      cardBg: 'bg-[#EFF6FF] hover:bg-[#DBEAFE] border-[#BFDBFE]/80',
      iconBg: 'bg-blue-100 text-blue-700',
      titleColor: 'text-blue-950',
      subColor: 'text-blue-700/80',
    },
    {
      id: 'results',
      name: 'View Results',
      sub: 'Marks & rankings',
      icon: Award,
      cardBg: 'bg-[#FAF5FF] hover:bg-[#F3E8FF] border-[#E9D5FF]/80',
      iconBg: 'bg-purple-100 text-purple-700',
      titleColor: 'text-purple-950',
      subColor: 'text-purple-700/80',
    },
    {
      id: 'report',
      name: 'Generate Report',
      sub: 'Audit & analytics',
      icon: BarChart3,
      cardBg: 'bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A]/80',
      iconBg: 'bg-amber-100 text-amber-700',
      titleColor: 'text-amber-950',
      subColor: 'text-amber-700/80',
    },
  ];

  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 95%', 'start 20%'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  const rotateX = useTransform(smoothProgress, [0, 1], [10, 0]);
  const y = useTransform(smoothProgress, [0, 1], [40, 0]);
  const scale = useTransform(smoothProgress, [0, 1], [0.97, 1]);
  const opacity = useTransform(smoothProgress, [0, 1], [0.5, 1]);

  return (
    <div ref={containerRef} className="relative w-full max-w-[1440px] mx-auto select-none" style={{ perspective: '1200px' }}>
      <motion.div 
        className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-transparent shadow-[0_30px_80px_rgba(15,23,42,0.18)]"
        style={prefersReducedMotion ? {} : { rotateX, y, scale, opacity }}
        initial={prefersReducedMotion ? { opacity: 0, y: 20 } : {}}
        whileInView={prefersReducedMotion ? { opacity: 1, y: 0 } : {}}
        viewport={prefersReducedMotion ? { once: true, margin: "-100px" } : undefined}
        transition={prefersReducedMotion ? { duration: 1, ease: [0.22, 1, 0.36, 1] } : undefined}
      >
        <img 
          src="/new-dashboard.png" 
          alt="SchoolsGhar Dashboard Preview" 
          className="w-full h-auto block"
        />
      </motion.div>
    </div>
  );
}
