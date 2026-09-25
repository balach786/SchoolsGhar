import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface FinalCtaSectionProps {
  onRequestDemo: () => void;
}

export function FinalCtaSection({ onRequestDemo }: FinalCtaSectionProps) {
  return (
    <section className="relative bg-[#0D1018] py-28 sm:py-36 overflow-hidden">
      {/* Dynamic Animated Ambient Purple Glow Backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[550px] w-[850px] rounded-full bg-gradient-to-r from-[#4F46E5]/25 via-[#6558F5]/30 to-[#7467FF]/20 blur-[140px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#171B27]/90 to-[#10131D]/90 p-8 sm:p-14 text-center shadow-2xl backdrop-blur-xl"
        >
          {/* Subtle Grid Accent */}
          <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Modernize Institutional Operations</span>
            </div>

            <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl font-display leading-tight">
              Transform the Way Your School Operates
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-base text-[#A7AEC1] sm:text-lg sm:leading-relaxed">
              Bring students, teachers, academics, attendance, exams, fees, reports and administration together inside one powerful school management platform.
            </p>

            {/* Buttons */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/register" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="h-12 w-full sm:w-auto rounded-full bg-gradient-to-r from-[#4F46E5] via-[#6558F5] to-[#7467FF] px-8 text-sm font-semibold text-white shadow-xl shadow-indigo-600/40 hover:shadow-indigo-600/60 hover:opacity-95 transition-all"
                >
                  <span>Start 7-Day Free Trial</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button
                onClick={onRequestDemo}
                variant="outline"
                size="lg"
                className="h-12 w-full sm:w-auto rounded-full border-white/15 bg-white/5 px-8 text-sm font-semibold text-white hover:bg-white/10"
              >
                <span>Request a Demo</span>
              </Button>
              <a href="#hero">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-full sm:w-auto rounded-full border-white/15 bg-white/5 px-8 text-sm font-semibold text-white hover:bg-white/10"
                >
                  <span>Explore Platform</span>
                  <ChevronRight className="ml-1 h-4 w-4 text-[#77809A]" />
                </Button>
              </a>
            </div>

            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-[#77809A]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                No setup fees for evaluation
              </span>
              <span>·</span>
              <span>Full data migration support</span>
              <span>·</span>
              <span>Dedicated training sessions</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
