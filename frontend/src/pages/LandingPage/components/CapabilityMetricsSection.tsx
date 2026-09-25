import { motion } from 'framer-motion';
import { ShieldCheck, Layers, Smartphone, Clock, Database, Sparkles } from 'lucide-react';

export function CapabilityMetricsSection() {
  const metrics = [
    { value: '6', label: 'User Roles', desc: 'Admin, Principal, Teacher, Student, Accountant, Receptionist', icon: ShieldCheck },
    { value: '20+', label: 'Core Modules', desc: 'Academics, attendance, exams, fees, timetable, reports', icon: Layers },
    { value: '100%', label: 'Responsive Interface', desc: 'Optimized for desktop, tablet, and mobile browsers', icon: Smartphone },
    { value: '24/7', label: 'System Access', desc: 'Continuous cloud or on-premise local availability', icon: Clock },
    { value: '1', label: 'Unified Platform', desc: 'Zero data silos or third-party spreadsheet dependencies', icon: Database },
  ];

  return (
    <section className="relative bg-[#10131D] py-20 sm:py-24 border-y border-white/5 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#77809A]">
            Architectural Scale & Capabilities
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl font-display">
            Engineered for Modern School Operations
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m, idx) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className="group rounded-2xl border border-white/5 bg-[#171B27] p-5 text-center transition-all hover:border-white/15 hover:bg-[#1B1F2C]"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-3 text-3xl font-black text-white sm:text-4xl font-display">
                  {m.value}
                </div>
                <div className="mt-1 text-xs font-bold text-indigo-300">{m.label}</div>
                <p className="mt-1 text-[11px] text-[#77809A] leading-tight">{m.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
