import { motion } from 'framer-motion';
import { Check, Sparkles, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PricingSectionProps {
  onRequestDemo: () => void;
}

export function PricingSection({ onRequestDemo }: PricingSectionProps) {
  const plans = [
    {
      name: 'Starter Edition',
      tagline: 'Ideal for single-campus academies and primary schools getting organized.',
      price: 'Flexible Annual',
      scope: 'Up to 500 Students',
      popular: false,
      features: [
        'Student & Teacher Directory',
        'Daily Class-wise Attendance',
        'Academic Sessions & Promotion',
        'Basic Fee Challan Receipts',
        'Standard Term Exam Grading',
        '3 Core User Roles',
        'Email Technical Support',
      ],
      cta: 'Request Demo',
    },
    {
      name: 'Professional',
      tagline: 'The complete enterprise school ERP suite for high-performing secondary schools.',
      price: 'Custom Campus Quote',
      scope: 'Up to 2,500 Students',
      popular: true,
      features: [
        'Everything in Starter, plus:',
        'Conflict-Free Timetable Generator',
        'Multi-Tier Partial Fee Collections & Ledgers',
        'Printable Result Cards & Merit Rankings',
        'Digital Assignment Submissions & Feedback',
        'Leave Management & Approvals Workflow',
        'Campus Broadcast Notices & Alerts',
        'All 6 Scoped Portals & Permissions Matrix',
        'Custom Fee Receipt & Logo Watermarking',
        'Priority Technical Consultation',
      ],
      cta: 'Schedule Executive Walkthrough',
    },
    {
      name: 'Enterprise Network',
      tagline: 'Tailored for multi-branch school networks and educational trusts.',
      price: 'Institutional Partnership',
      scope: 'Unlimited Students & Branches',
      popular: false,
      features: [
        'Everything in Professional, plus:',
        'Multi-Campus Consolidated Reporting',
        'Dedicated On-Premise or Private Cloud MongoDB',
        'Custom Data Migration from Legacy Spreadsheets',
        'Direct Staff Onboarding & Admin Workshops',
        'Full Audit Trail Compliance Exports',
        '24/7 Dedicated Account Liaison',
      ],
      cta: 'Contact Education Sales',
    },
  ];

  return (
    <section id="pricing" className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pricing And Plan</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Choose the Right Plan for Your School
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Transparent institutional packages scaled to your student body size, faculty count, and administrative requirements.
          </p>
        </div>

        {/* 3 Pricing Packages */}
        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={`relative rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                plan.popular
                  ? 'border-2 border-indigo-500/60 bg-[#171B27] shadow-2xl shadow-indigo-950/50 -translate-y-2'
                  : 'border border-white/10 bg-[#131722] hover:border-white/20 hover:bg-[#171B27]'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-1 text-xs font-bold text-white shadow-lg">
                    Most Popular Choice
                  </Badge>
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <span className="rounded-md border border-white/10 bg-[#10131D] px-2.5 py-1 text-[11px] font-semibold text-indigo-300">
                    {plan.scope}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#A7AEC1] leading-relaxed min-h-[36px]">
                  {plan.tagline}
                </p>

                {/* Price block */}
                <div className="mt-6 border-y border-white/5 py-4">
                  <span className="text-2xl font-black text-white sm:text-3xl font-display">
                    {plan.price}
                  </span>
                  <span className="block text-xs text-[#77809A] mt-1">Billed annually per campus size</span>
                </div>

                {/* Features List */}
                <div className="mt-6 space-y-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#77809A]">
                    Included Capabilities
                  </span>
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-xs text-[#F7F8FC]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-4 border-t border-white/5">
                <Button
                  onClick={onRequestDemo}
                  className={`w-full h-11 text-xs font-semibold rounded-xl transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-[#4F46E5] via-[#6558F5] to-[#7467FF] text-white shadow-lg shadow-indigo-600/40 hover:opacity-95'
                      : 'border border-white/15 bg-[#171B27] text-white hover:bg-[#1B1F2C]'
                  }`}
                >
                  <span>{plan.cta}</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Pricing Guarantee Footer */}
        <div className="mt-12 rounded-xl border border-white/5 bg-[#131722] p-4 text-center text-xs text-[#A7AEC1]">
          <span>Need a customized proposal for your board or educational trust? </span>
          <button onClick={onRequestDemo} className="font-semibold text-indigo-400 underline underline-offset-4 hover:text-indigo-300 ml-1">
            Request an Institutional Consultation →
          </button>
        </div>
      </div>
    </section>
  );
}
