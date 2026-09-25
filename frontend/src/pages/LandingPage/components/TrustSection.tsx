import { motion } from 'framer-motion';
import { School, Building2, BookOpen, GraduationCap, Award, Shield } from 'lucide-react';

export function TrustSection() {
  const institutions = [
    { name: 'Beaconhouse Academy', icon: School },
    { name: 'City Grammar School', icon: GraduationCap },
    { name: 'Apex International College', icon: Building2 },
    { name: 'Horizon Scholars School', icon: BookOpen },
    { name: 'Crescent Model Academy', icon: Award },
    { name: 'Oakridge Educational Complex', icon: Shield },
  ];

  return (
    <section className="relative border-y border-white/5 bg-[#10131D] py-14 sm:py-16 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#77809A]">
            Trusted by schools, academies and education teams
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            Built for Modern Schools and Education Teams
          </h2>
          <p className="mt-1 text-sm text-[#A7AEC1]">
            One connected platform for administration, academics, finance, teachers, and students.
          </p>
        </div>

        {/* Grayscale Educational Marks Grid */}
        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 items-center justify-center">
          {institutions.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className="group flex flex-col items-center justify-center rounded-xl border border-white/5 bg-[#171B27]/40 px-4 py-4 text-center transition-all hover:border-white/15 hover:bg-[#171B27]"
              >
                <Icon className="h-6 w-6 text-[#77809A] transition-colors group-hover:text-indigo-400" />
                <span className="mt-2 text-xs font-semibold text-[#77809A] transition-colors group-hover:text-white">
                  {item.name}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
