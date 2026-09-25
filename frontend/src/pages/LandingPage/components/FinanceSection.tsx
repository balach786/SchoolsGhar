import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Receipt,
  Printer,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  CreditCard,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Building,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function FinanceSection() {
  const [receiptMode, setReceiptMode] = useState<'a4' | 'compact'>('a4');

  return (
    <section id="finance" className="relative bg-[#0D1018] py-24 sm:py-32 overflow-hidden">
      {/* Background radial highlight */}
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[150px] -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-1 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Fees & Finance</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display">
            Complete Financial Control for Your School
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#A7AEC1] sm:text-lg">
            Track fees, partial payments, outstanding balances, expenses, salaries and financial performance without relying on spreadsheets.
          </p>
        </div>

        {/* FINANCIAL DASHBOARD MOCKUP (4 Metrics Cards & Comparison) */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl">
          {/* Top Row: Metric Highlights */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Collection */}
            <div className="rounded-xl border border-emerald-500/30 bg-[#171B27] p-5 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A7AEC1]">Fee Collection This Month</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-white sm:text-3xl">Rs 865,000</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
                <span>+14.2%</span>
                <span className="text-[#77809A]">on-time collection</span>
              </div>
            </div>

            {/* Pending Fees */}
            <div className="rounded-xl border border-rose-500/20 bg-[#171B27] p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A7AEC1]">Pending Fees</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                  <TrendingDown className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-rose-400 sm:text-3xl">Rs 184,500</div>
              <div className="mt-1 text-xs text-[#77809A]">
                <span>128 outstanding challans</span>
              </div>
            </div>

            {/* Monthly Expenses */}
            <div className="rounded-xl border border-amber-500/20 bg-[#171B27] p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A7AEC1]">Monthly Expenses</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-amber-300 sm:text-3xl">Rs 215,000</div>
              <div className="mt-1 text-xs text-[#77809A]">
                <span>Salaries + Utilities</span>
              </div>
            </div>

            {/* Net Balance */}
            <div className="rounded-xl border border-indigo-500/30 bg-[#171B27] p-5 shadow-lg shadow-indigo-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A7AEC1]">Net Operating Surplus</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-400 sm:text-3xl">Rs 650,000</div>
              <div className="mt-1 text-xs text-indigo-300">
                <span>Healthy reserve ratio</span>
              </div>
            </div>
          </div>

          {/* Collected vs Pending Visual Bar */}
          <div className="mt-6 rounded-xl border border-white/5 bg-[#10131D] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs mb-3">
              <div>
                <span className="font-semibold text-white text-sm">Collection Target Velocity</span>
                <p className="text-[11px] text-[#77809A]">Rs 865,000 collected of Rs 1,049,500 total billable revenue</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Collected (82.4%)
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Outstanding (17.6%)
                </span>
              </div>
            </div>

            <div className="h-3.5 w-full overflow-hidden rounded-full bg-[#171B27] flex">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: '82.4%' }} />
              <div className="h-full bg-rose-500/80" style={{ width: '17.6%' }} />
            </div>
          </div>

          {/* Finance Feature Capability Matrix */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 border-t border-white/5 pt-6 text-center">
            {[
              { label: 'Fee Structures', sub: 'Monthly & Term' },
              { label: 'Discounts & Aid', sub: 'Merit Scholarships' },
              { label: 'Late Fines', sub: 'Configurable Rules' },
              { label: 'Partial Payments', sub: 'Real-Time Ledger' },
              { label: 'Teacher Salaries', sub: 'Payroll Slips' },
              { label: 'CSV Export', sub: 'Audit Ready' },
            ].map((f) => (
              <div key={f.label} className="rounded-lg bg-[#171B27] p-2.5 border border-white/5">
                <div className="text-xs font-bold text-white">{f.label}</div>
                <div className="text-[10px] text-[#77809A] mt-0.5">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* DEDICATED FEATURE: PROFESSIONAL FEE RECEIPTS */}
        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-1 text-xs font-semibold text-indigo-300">
              <Receipt className="h-3.5 w-3.5" />
              <span>Instant Challan Generation</span>
            </div>
            <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-4xl font-display">
              Professional Fee Receipts in Seconds
            </h3>
            <p className="mt-3 text-sm text-[#A7AEC1] leading-relaxed">
              Generate branded, tamper-evident payment receipts instantly upon fee submission. Keep parents informed and administration organized.
            </p>

            {/* Printing Format Badges */}
            <div className="mt-6 space-y-2.5">
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#131722] p-3">
                <Printer className="h-5 w-5 text-indigo-400" />
                <div>
                  <h5 className="text-xs font-bold text-white">A4 & Half-Letter Printing</h5>
                  <p className="text-[11px] text-[#77809A]">Formatted dual-copy (Parent Copy + School Copy) on standard paper</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#131722] p-3">
                <CreditCard className="h-5 w-5 text-purple-400" />
                <div>
                  <h5 className="text-xs font-bold text-white">Compact Slip Printing</h5>
                  <p className="text-[11px] text-[#77809A]">High-speed thermal POS receipt output for front-desk counters</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#131722] p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <div>
                  <h5 className="text-xs font-bold text-white">Native Browser Printing</h5>
                  <p className="text-[11px] text-[#77809A]">Clean CSS print-media stylesheets with zero formatting distortion</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Printable Receipt Mockup */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-[#171B27] p-6 sm:p-8 shadow-2xl"
            >
              {/* Receipt Header inside dark card */}
              <div className="rounded-xl border border-white/10 bg-[#10131D] p-6 font-sans">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="School Logo" className="h-6 w-auto object-contain" />
                  </div>
                  <div className="text-right">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                      Official Receipt
                    </Badge>
                    <p className="mt-1 font-mono text-xs font-bold text-white">#RCPT-2048</p>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="mt-4 grid grid-cols-2 gap-y-2 gap-x-4 text-xs border-b border-white/5 pb-4">
                  <div>
                    <span className="text-[#77809A]">Student Name:</span>
                    <p className="font-semibold text-white">Muhammad Daniyal</p>
                  </div>
                  <div>
                    <span className="text-[#77809A]">Admission Number:</span>
                    <p className="font-mono font-semibold text-white">SMS-2025-0842</p>
                  </div>
                  <div>
                    <span className="text-[#77809A]">Class & Section:</span>
                    <p className="font-semibold text-white">Class 10 — Section A</p>
                  </div>
                  <div>
                    <span className="text-[#77809A]">Date of Payment:</span>
                    <p className="font-semibold text-white">05 Sep 2026</p>
                  </div>
                  <div>
                    <span className="text-[#77809A]">Payment Method:</span>
                    <p className="font-semibold text-emerald-400">Cash / Front Desk</p>
                  </div>
                  <div>
                    <span className="text-[#77809A]">Fee Category:</span>
                    <p className="font-semibold text-white">Tuition Fee (Sep 2026)</p>
                  </div>
                </div>

                {/* Amount Ledger Breakdown */}
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-[#A7AEC1]">
                    <span>Monthly Tuition Fee</span>
                    <span className="font-mono text-white">Rs 15,000</span>
                  </div>
                  <div className="flex justify-between text-[#A7AEC1]">
                    <span>Computer Lab & Science Facility</span>
                    <span className="font-mono text-white">Rs 3,500</span>
                  </div>
                  <div className="flex justify-between text-[#A7AEC1]">
                    <span>Sibling Concession / Discount (10%)</span>
                    <span className="font-mono text-emerald-400">- Rs 1,500</span>
                  </div>

                  <div className="mt-2 border-t border-white/10 pt-2 flex justify-between text-sm font-bold text-white">
                    <span>Total Amount Paid</span>
                    <span className="font-mono text-emerald-400">Rs 17,000</span>
                  </div>

                  <div className="flex justify-between text-xs text-[#77809A] pt-1">
                    <span>Remaining Outstanding Balance</span>
                    <span className="font-mono font-bold text-white">Rs 0.00 (Fully Settled)</span>
                  </div>
                </div>

                {/* Receipt Stamp Block */}
                <div className="mt-5 flex items-center justify-between border-t border-dashed border-white/10 pt-3 text-[11px] text-[#77809A]">
                  <span>Authorized Cashier: M. Akram</span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    PAID & STAMPED
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
