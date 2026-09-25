import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Users,
  GraduationCap,
  CalendarCheck,
  TrendingUp,
  Wallet,
  Activity,
  Layers,
  ChevronRight,
  BookOpen,
  Bell,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeroSectionProps {
  onRequestDemo: () => void;
}

export function HeroSection({ onRequestDemo }: HeroSectionProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'finance'>('overview');

  return (
    <section id="hero" className="relative min-h-screen overflow-hidden pt-32 pb-20 sm:pt-36 sm:pb-28">
      {/* Deep Atmospheric Lighting & Subtle Botanical/Cosmic Gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[#0D1018]">
        {/* Top Centered Purple Flare */}
        <div className="absolute top-0 left-1/2 h-[550px] w-[800px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gradient-to-b from-[#6558F5]/25 via-[#4F46E5]/15 to-transparent blur-[120px]" />

        {/* Side Accent Atmospheric Spots */}
        <div className="absolute top-1/3 -left-48 h-[400px] w-[400px] rounded-full bg-[#4F46E5]/10 blur-[130px]" />
        <div className="absolute top-1/2 -right-48 h-[450px] w-[450px] rounded-full bg-[#7467FF]/10 blur-[140px]" />

        {/* Low-opacity Grid Texture */}
        <div className="absolute inset-0 bg-grid-pattern opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Hero Content */}
        <div className="mx-auto max-w-4xl text-center">
          {/* Social Proof Pill Badge */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-4 py-1.5 backdrop-blur-md shadow-inner shadow-indigo-500/10"
          >
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium tracking-wide text-indigo-200">
              Next-Generation School ERP & Administration
            </span>
          </motion.div>

          {/* Master Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl font-display leading-[1.1]"
          >
            One Platform for Complete{' '}
            <span className="font-serif italic font-normal text-gradient-accent tracking-normal">
              School Management.
            </span>
          </motion.h1>

          {/* Subtitle with controlled width */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-base text-[#A7AEC1] sm:text-lg sm:leading-relaxed"
          >
            Manage students, teachers, attendance, academics, exams, results, fees, assignments, reports, and school operations from one secure and beautifully organized platform.
          </motion.p>

          {/* Hero Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link to="/register" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="h-12 w-full sm:w-auto rounded-full bg-gradient-to-r from-[#4F46E5] via-[#6558F5] to-[#7467FF] px-8 text-sm font-semibold text-white shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:opacity-95 transition-all"
              >
                <span>Start 7-Day Free Trial</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#mockup">
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full sm:w-auto rounded-full border-white/15 bg-white/5 px-8 text-sm font-semibold text-[#F7F8FC] hover:bg-white/10 hover:border-white/25 backdrop-blur-sm"
              >
                <span>Explore Platform</span>
                <ChevronRight className="ml-1 h-4 w-4 text-[#77809A]" />
              </Button>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-4 text-xs text-[#77809A]"
          >
            Built for modern schools, academies, and education teams
          </motion.p>
        </div>

        {/* HERO PRODUCT MOCKUP: Floating Browser & Actual Dashboard */}
        <motion.div
          id="mockup"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, type: 'spring', bounce: 0.15 }}
          className="relative mx-auto mt-16 max-w-6xl"
        >
          {/* Soft Purple Atmospheric Backdrop Glow */}
          <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-b from-indigo-500/20 via-purple-600/10 to-transparent blur-2xl -z-10" />

          {/* Browser / Application Frame */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#10131D] shadow-2xl shadow-black/80">
            {/* Window Topbar */}
            <div className="flex items-center justify-between border-b border-white/5 bg-[#0D1018]/90 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#EF4444]/80" />
                <div className="h-3 w-3 rounded-full bg-[#F59E0B]/80" />
                <div className="h-3 w-3 rounded-full bg-[#10B981]/80" />
                <span className="ml-2 hidden text-xs font-medium text-[#77809A] sm:inline-block">
                  school-management-system.internal · Dashboard
                </span>
              </div>

              {/* Status Indicators */}
              <div className="flex items-center gap-3 text-xs text-[#A7AEC1]">
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-medium">API Healthy</span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-indigo-300 border border-indigo-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span className="text-[11px] font-medium">MongoDB Connected</span>
                </div>
              </div>
            </div>

            {/* Dashboard Workspace Shell */}
            <div className="flex h-[300px] sm:h-[400px] md:h-[580px] w-full overflow-hidden relative bg-[#F8FAFC]">
              <img 
                src="/dashboard-preview-2026-v3.png" 
                alt="SchoolsGhar Dashboard Preview" 
                className="w-full h-full object-cover object-left-top"
              />
            </div>
          </div>

          {/* Floating High-End Decorative Badge Particles */}
          <div className="absolute -top-6 -left-6 hidden lg:flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#171B27]/90 px-4 py-2.5 backdrop-blur-md shadow-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Daily Roll-Call Sync</p>
              <p className="text-[10px] text-emerald-400">1,369 Students Verified</p>
            </div>
          </div>

          <div className="absolute -bottom-6 -right-6 hidden lg:flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#171B27]/90 px-4 py-2.5 backdrop-blur-md shadow-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Receipt #RCPT-2048</p>
              <p className="text-[10px] text-indigo-300">Rs 18,500 Paid via Bank Deposit</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
