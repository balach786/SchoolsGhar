import { motion } from 'framer-motion';
import { Quote, Star, Sparkles, GraduationCap, School, Wallet, UserCheck } from 'lucide-react';

export function TestimonialsSection() {
  const testimonials = [
    {
      quote:
        'Managing 1,400+ students across 28 sections used to require six disconnected spreadsheets. Having attendance, fee collection, and exam result cards unified in this software has eliminated hours of manual clerical work every week.',
      author: 'Academic Principal',
      role: 'Private Secondary Institution',
      icon: School,
      rating: 5,
    },
    {
      quote:
        'The printable fee receipts with student fee ledgers and partial payment tracking completely resolved discrepancies at our billing counter. Our monthly reconciliations now balance effortlessly.',
      author: 'Lead School Accountant',
      role: 'Educational Complex',
      icon: Wallet,
      rating: 5,
    },
    {
      quote:
        'Entering subject marks and producing merit ranking lists without formatting headaches has been transformative. Plus, the conflict-free timetable ensures no overlapping faculty periods.',
      author: 'Senior Faculty Teacher',
      role: 'Science & Computer Department',
      icon: GraduationCap,
      rating: 5,
    },
    {
      quote:
        'The role-based permissions give our receptionists, teachers, and admins exactly the tools they need while keeping confidential payroll and database settings strictly protected.',
      author: 'System Administrator',
      role: 'Multi-Campus Academy',
      icon: UserCheck,
      rating: 5,
    },
  ];

  return (
    <section className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Institutional Impact</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Built for the People Who Run Schools
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Designed alongside school leaders, finance teams, and teachers to deliver clarity and operational speed.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {testimonials.map((t, idx) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.author}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 transition-all hover:border-white/20 hover:bg-[#171B27] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 text-amber-400">
                      {[...Array(t.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <Quote className="h-6 w-6 text-[#77809A]/40" />
                  </div>
                  <p className="mt-4 text-sm text-[#F7F8FC] leading-relaxed italic">
                    "{t.quote}"
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{t.author}</h4>
                    <p className="text-[11px] text-[#77809A]">{t.role}</p>
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
