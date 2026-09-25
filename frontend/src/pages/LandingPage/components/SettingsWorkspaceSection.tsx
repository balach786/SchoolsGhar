import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sliders,
  Sun,
  Moon,
  Monitor,
  Check,
  Building,
  Image,
  Receipt,
  FileCheck,
  DollarSign,
  Palette,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function SettingsWorkspaceSection() {
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

  const settingsItems = [
    { label: 'School Name & Branding', value: 'Al-Huda Academy & High School', icon: Building },
    { label: 'Official Crest & White Logo', value: 'SVG & PNG uploaded (Vector sharp)', icon: Image },
    { label: 'Registered Campus Address', value: 'Plot 42, Education Boulevard, Phase 2', icon: Building },
    { label: 'Designated Principal', value: 'Dr. Tariq Mahmood (Ph.D)', icon: FileCheck },
    { label: 'System Currency', value: 'PKR (Rs) · Pakistani Rupee', icon: DollarSign },
    { label: 'Receipt & Voucher Template', value: 'Dual-Copy Watermarked Standard', icon: Receipt },
  ];

  return (
    <section className="relative bg-[#10131D] py-24 sm:py-32 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: School Settings Mockup */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/30 px-3.5 py-1 text-xs font-semibold text-purple-300">
              <Sliders className="h-3.5 w-3.5" />
              <span>Full Customization</span>
            </div>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl font-display leading-tight">
              Make the Platform Truly Yours
            </h2>
            <p className="mt-4 text-base text-[#A7AEC1] sm:text-lg leading-relaxed">
              Tailor school identities, currency formats, fee receipt policies, grading scales, and academic session boundaries in minutes.
            </p>

            {/* Settings Parameter Items */}
            <div className="mt-8 space-y-3">
              {settingsItems.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-[#171B27] p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{s.label}</h4>
                        <p className="text-[11px] text-[#77809A]">{s.value}</p>
                      </div>
                    </div>
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Theme & Workspace Preview */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-white/10 bg-[#131722] p-6 sm:p-8 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Designed for Every Workspace</h3>
                  <p className="text-xs text-[#77809A]">Switch themes without sacrificing contrast</p>
                </div>

                {/* Theme Mode Toggle Pills */}
                <div className="flex rounded-lg border border-white/10 bg-[#10131D] p-1">
                  <button
                    onClick={() => setPreviewTheme('dark')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      previewTheme === 'dark'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-[#77809A] hover:text-white'
                    }`}
                  >
                    <Moon className="h-3 w-3" />
                    <span>Dark Mode</span>
                  </button>
                  <button
                    onClick={() => setPreviewTheme('light')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      previewTheme === 'light'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-[#77809A] hover:text-white'
                    }`}
                  >
                    <Sun className="h-3 w-3" />
                    <span>Light Mode</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Theme Preview Card */}
              <motion.div
                key={previewTheme}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className={`mt-6 rounded-xl border p-5 transition-all ${
                  previewTheme === 'dark'
                    ? 'bg-[#171B27] border-white/10 text-white'
                    : 'bg-[#F8FAFC] border-slate-200 text-slate-900 shadow-lg'
                }`}
              >
                {/* Mini Preview Header */}
                <div className="flex items-center justify-between border-b pb-3 mb-3 border-current/10">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold ${
                        previewTheme === 'dark' ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white'
                      }`}
                    >
                      S
                    </div>
                    <span className="text-xs font-bold">School Portal View</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      previewTheme === 'dark'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Active Sync
                  </span>
                </div>

                {/* Mini Preview Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div
                    className={`rounded-lg p-3 ${
                      previewTheme === 'dark' ? 'bg-[#10131D]' : 'bg-white border border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] opacity-60">Enrolled Students</span>
                    <div className="text-lg font-bold mt-0.5">1,420</div>
                  </div>
                  <div
                    className={`rounded-lg p-3 ${
                      previewTheme === 'dark' ? 'bg-[#10131D]' : 'bg-white border border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] opacity-60">Daily Attendance</span>
                    <div className="text-lg font-bold mt-0.5 text-emerald-500">96.4%</div>
                  </div>
                </div>

                <div
                  className={`mt-3 rounded-lg p-3 text-xs flex justify-between items-center ${
                    previewTheme === 'dark' ? 'bg-[#10131D]' : 'bg-white border border-slate-200'
                  }`}
                >
                  <span className="text-[11px]">Fee Inflow This Month</span>
                  <span className="font-mono font-bold">Rs 865,000</span>
                </div>
              </motion.div>

              <div className="mt-5 flex items-center justify-between text-xs text-[#77809A]">
                <span>Adaptive System Mode support</span>
                <span className="text-indigo-400">100% WCAG AAA Contrast</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
