import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Database,
  KeyRound,
  FileCheck2,
  Server,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function SecurityMongoSection() {
  const securityFeatures = [
    {
      title: 'JWT Authentication',
      desc: 'Stateless, cryptographically signed token sessions with automated expiry.',
      icon: KeyRound,
    },
    {
      title: 'Bcrypt Password Hashing',
      desc: 'Multi-round salted password derivation preventing plaintext exposure.',
      icon: Lock,
    },
    {
      title: 'Granular Role-Based Access',
      desc: 'Strict module and action-level authorization enforced on every API route.',
      icon: ShieldCheck,
    },
    {
      title: 'Comprehensive Audit Logs',
      desc: 'Immutable logs recording user ID, IP address, timestamp, and modification type.',
      icon: FileCheck2,
    },
    {
      title: 'Protected REST Endpoints',
      desc: 'CORS protection, strict rate-limiting, and sanitized input validation schemas.',
      icon: Server,
    },
    {
      title: 'Session Integrity',
      desc: 'Single-session enforcement preventing concurrent unauthorized account hijacking.',
      icon: Layers,
    },
  ];

  return (
    <section className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Secure by Design</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Your School Data, Properly Protected
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Institutional records, student identities, and financial transactions require rigorous technical safeguards and resilient backend storage.
          </p>
        </div>

        {/* Security Grid */}
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {securityFeatures.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-2xl border border-white/10 bg-[#131722] p-6 transition-all hover:border-white/20 hover:bg-[#171B27]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{feat.title}</h3>
                <p className="mt-1.5 text-xs text-[#A7AEC1] leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>

        {/* MONGODB SECTION */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-gradient-to-r from-[#131722] via-[#171B27] to-[#131722] p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <Database className="h-4 w-4" />
                <span>Modern Document Architecture</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl font-display">
                Built Around Efficient School Data
              </h3>
              <p className="mt-3 text-sm text-[#A7AEC1] leading-relaxed">
                Structured school records are securely managed through a MongoDB-powered backend architecture with efficient search, multi-field filtering, fast indexed pagination, and historical academic records isolation.
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                {[
                  'Indexed Compound Queries',
                  'Aggregated Financial Pipelines',
                  'Academic Session Sharding',
                  'Sub-millisecond Search Response',
                ].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg border border-white/5 bg-[#10131D] px-3 py-1 text-[#A7AEC1]"
                  >
                    ✓ {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 rounded-xl border border-white/10 bg-[#10131D] p-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <span className="text-xs font-bold text-white">Database Metrics</span>
                <span className="text-[10px] text-emerald-400 font-mono">Cluster Active</span>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between text-[#A7AEC1]">
                  <span>Database Engine:</span>
                  <span className="text-white font-mono font-medium">MongoDB 8.0</span>
                </div>
                <div className="flex justify-between text-[#A7AEC1]">
                  <span>Connection Pooling:</span>
                  <span className="text-emerald-400 font-mono font-medium">Auto-scaling</span>
                </div>
                <div className="flex justify-between text-[#A7AEC1]">
                  <span>Audit Trail Index:</span>
                  <span className="text-white font-mono font-medium">TTL Synced</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
