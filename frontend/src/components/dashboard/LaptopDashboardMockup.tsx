import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function LaptopDashboardMockup({
  className,
  tilt = 'right',
}: {
  className?: string;
  tilt?: 'right' | 'left' | 'straight';
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const getTransform = () => {
    if (tilt === 'straight') return 'rotateX(0deg) rotateY(0deg)';
    if (tilt === 'left') return 'rotateX(6deg) rotateY(-8deg) rotateZ(0.5deg)';
    return 'rotateX(6deg) rotateY(8deg) rotateZ(-0.5deg)';
  };

  return (
    <div className={cn('relative w-full max-w-[580px] xl:max-w-[640px] mx-auto select-none', className)}>
      {/* 3D Perspective Stage with Tilt */}
      <div
        className={cn(
          'laptop-3d-stage transition-all duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu',
          mounted
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-8 scale-95'
        )}
        style={{
          perspective: '1100px',
        }}
      >
        <div
          className="laptop-float-wrapper relative flex flex-col items-center mx-auto"
          style={{
            transform: getTransform(),
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Ambient Diffused Desk Shadow */}
          <div
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-[92%] h-14 bg-gradient-to-r from-transparent via-black/45 to-transparent rounded-full blur-xl pointer-events-none z-0"
            aria-hidden="true"
          />

          {/* =========================================================
              LAPTOP DISPLAY LID (Realistic 3D Aluminum Screen)
              ========================================================= */}
          <div className="relative w-full rounded-t-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-2 sm:p-2.5 shadow-2xl border-t border-x border-slate-600/50 flex flex-col justify-between overflow-hidden z-10">
            {/* Top Inset Highlight Line */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none z-30" />

            {/* Subtle FaceTime HD Camera Lens at Top Center */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rounded-full flex items-center justify-center z-30 border border-slate-700/50">
              <span className="w-0.5 h-0.5 bg-emerald-400/80 rounded-full animate-pulse" />
            </div>

            {/* Screen Bezel Inset Border */}
            <div className="absolute inset-0 border-[3px] border-slate-950 rounded-t-2xl pointer-events-none z-20" />

            {/* Glass Sheen / Specular Light Reflection Sweep */}
            <div
              className="absolute inset-0 pointer-events-none z-20 rounded-t-xl overflow-hidden opacity-40"
              style={{
                background:
                  'linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 100%)',
              }}
            />

            {/* 16:9 Screen Content Canvas */}
            <div className="relative w-full aspect-[16/9] overflow-hidden rounded-md bg-[#F8FAFC] text-slate-800 flex shadow-inner font-sans z-10">
              <img 
                src="/dashboard-preview-2026-v3.png" 
                alt="New Dashboard" 
                className="w-full h-full object-cover object-left-top"
              />
            </div>
          </div>

          {/* =========================================================
              CENTRAL HINGE (Black Anodized Bar)
              ========================================================= */}
          <div className="w-[140px] sm:w-[160px] h-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-b-xs border-b border-slate-950 z-10" />

          {/* =========================================================
              REALISTIC ALUMINUM LOWER BASE / KEYBOARD CHASSIS
              ========================================================= */}
          <div className="relative w-[104%] h-3.5 sm:h-4 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-300 rounded-b-xl shadow-2xl border-x border-b border-slate-400/60 z-0">
            {/* Center Thumb Notch for Opening Lid */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-[2px] sm:h-[2.5px] bg-slate-500/40 rounded-b" />
          </div>
        </div>
      </div>
    </div>
  );
}
