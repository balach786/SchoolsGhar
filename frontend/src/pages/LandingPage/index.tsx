import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollReveal as Reveal, StaggerContainer, StaggerItem, FloatingHeader } from '@/components/motion';
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Users,
  GraduationCap,
  CalendarCheck,
  BookOpen,
  ClipboardCheck,
  Wallet,
  BookMarked,
  BarChart3,
  Megaphone,
  LockKeyhole,
  Layers,
  Plus,
  Menu,
  Building2,
  Calendar,
  FileDown,
} from 'lucide-react';
import { Brand } from '@/components/Brand';
import { HeroDashboardMockup } from '@/components/HeroDashboardMockup';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const links = [
  ['Home', '#home'],
  ['Features', '#features'],
  ['Solutions', '#solutions'],
  ['Pricing', '#pricing'],
  ['FAQs', '#faqs'],
];

/**
 * Multi-layer organic wave divider connecting Section A (from) and Section B (to).
 * Built with deep sinusoidal curves, wide overhang (-100 to 1540), and zero subpixel line gaps.
 */
export function CurvedSectionDivider({
  className = '',
  from = 'transparent',
  to = '#ffffff',
  accentColor1 = '#93C5FD',
  accentColor2 = '#2563EB',
  height = 100,
}: {
  className?: string;
  from?: string;
  to?: string;
  accentColor1?: string;
  accentColor2?: string;
  height?: number;
}) {
  return (
    <div
      className={cn('w-full block overflow-hidden pointer-events-none relative z-10 select-none', className)}
      style={{ backgroundColor: from, marginTop: '-1px', marginBottom: '-1px' }}
      aria-hidden="true"
    >
      <svg
        className="w-full block"
        style={{ height: `${height}px`, display: 'block', verticalAlign: 'bottom' }}
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Layer 1: Soft Ice Blue Accent Wave */}
        <path
          d="M -100 20 C 220 90, 440 10, 720 50 C 1000 90, 1220 15, 1540 40 V 125 H -100 Z"
          fill={accentColor1}
          className="animate-wave-layer-1"
          style={{ opacity: 0.4 }}
        />
        {/* Layer 2: Vibrant Royal Blue Wave (Deep, richly merged) */}
        <path
          d="M -100 38 C 240 105, 480 25, 740 70 C 1000 110, 1240 30, 1540 55 V 125 H -100 Z"
          fill={accentColor2}
          className="animate-wave-layer-2"
          style={{ opacity: 0.7 }}
        />
        {/* Layer 3: Solid Destination Section Base Wave */}
        <path
          d="M -100 62 C 260 118, 510 45, 760 85 C 1020 118, 1260 48, 1540 75 V 125 H -100 Z"
          fill={to}
        />
      </svg>
    </div>
  );
}

function FloatingNavbar() {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('#home');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);

      // Dynamic scroll spy for section highlight
      const sectionIds = ['home', 'features', 'solutions', 'pricing', 'faqs'];
      const scrollPos = window.scrollY + 160;

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const top = el.offsetTop;
          if (scrollPos >= top) {
            setActiveSection(`#${sectionIds[i]}`);
            return;
          }
        }
      }
      setActiveSection('#home');
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setActiveSection(href);
    if (href.startsWith('#')) {
      const el = document.getElementById(href.slice(1));
      if (el) {
        e.preventDefault();
        const navOffset = 90;
        const targetPos = el.getBoundingClientRect().top + window.scrollY - navOffset;
        window.scrollTo({
          top: targetPos,
          behavior: 'smooth',
        });
        window.history.pushState(null, '', href);
      }
    }
  };

  return (
    <>
      <FloatingHeader className={`floating-nav ${scrolled ? 'scrolled' : ''}`}>
        <Brand />
        <nav aria-label="Main navigation">
          {links.map(([label, href]) => {
            const isActive = activeSection === href;
            return (
              <a
                key={label}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                className={isActive ? 'nav-item-active' : ''}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <div className="nav-actions">
          <Link className="nav-signin" to="/login">
            Sign In
          </Link>
          <Button asChild className="btn-nav-trial">
            <Link to="/register">
              Start Free Trial <ArrowRight size={18} className="ml-1" />
            </Link>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          ref={menuTrigger}
          className="mobile-menu-trigger"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
      </FloatingHeader>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="mobile-nav-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTrigger.current?.focus();
          }}
        >
          <DialogTitle>Explore your school workspace</DialogTitle>
          <DialogDescription>Everything you need for a better school day.</DialogDescription>
          <nav aria-label="Mobile navigation">
            {links.map(([label, href]) => {
              const isActive = activeSection === href;
              return (
                <a
                  key={label}
                  href={href}
                  onClick={(e) => {
                    handleNavClick(e, href);
                    setOpen(false);
                  }}
                  className={isActive ? 'text-blue-600 font-bold bg-blue-50 px-3 py-2 rounded-xl' : ''}
                >
                  {label}
                  <ArrowRight size={18} />
                </a>
              );
            })}
          </nav>
          <Button variant="outline" asChild>
            <Link to="/login">Sign In</Link>
          </Button>
          <Button asChild className="btn-nav-trial">
            <Link to="/register">Start Free Trial</Link>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}


const features = [
  {
    icon: Users,
    title: 'Student Management',
    text: 'Comprehensive student records, admissions, rosters, and academic tracking.',
    tag: 'Admissions · Directory · Records',
    cardBg: 'bg-[#FAFCFF] hover:bg-[#F0F7FF]/80 border-[#E0F2FE]/90',
    iconBg: 'bg-blue-600 text-white shadow-sm',
    numColor: 'text-blue-500/80',
    titleColor: 'text-blue-950',
    textColor: 'text-blue-900/75',
    tagBg: 'bg-white/80 text-blue-800 border-blue-200/90 shadow-2xs',
    footerBorder: 'border-blue-100',
    images: ['/student-management-preview-1.png', '/student-management-preview-2.png'],
  },
  {
    icon: GraduationCap,
    title: 'Teacher Management',
    text: 'Manage faculty profiles, academic qualifications, and teaching assignments.',
    tag: 'Faculty · Staff · Roster',
    cardBg: 'bg-[#FCFDFF] hover:bg-[#F5F7FF]/80 border-[#E0E7FF]/90',
    iconBg: 'bg-indigo-600 text-white shadow-sm',
    numColor: 'text-indigo-500/80',
    titleColor: 'text-indigo-950',
    textColor: 'text-indigo-900/75',
    tagBg: 'bg-white/80 text-indigo-800 border-indigo-200/90 shadow-2xs',
    footerBorder: 'border-indigo-100',
    images: ['/teacher-management-preview-1.png', '/teacher-management-preview-2.png'],
  },
  {
    icon: CalendarCheck,
    title: 'Attendance Management',
    text: 'Record daily attendance quickly and review automated monthly registers.',
    tag: 'Roll-Call · Leaves · Reports',
    cardBg: 'bg-[#FAFEFC] hover:bg-[#ECFDF5]/80 border-[#D1FAE5]/90',
    iconBg: 'bg-emerald-600 text-white shadow-sm',
    numColor: 'text-emerald-500/80',
    titleColor: 'text-emerald-950',
    textColor: 'text-emerald-900/75',
    tagBg: 'bg-white/80 text-emerald-800 border-emerald-200/90 shadow-2xs',
    footerBorder: 'border-emerald-100',
    images: ['/daily-attendance-preview-1.png', '/daily-attendance-preview-2.png'],
  },
  {
    icon: BookOpen,
    title: 'Academic Management',
    text: 'Plan academic sessions, manage classes, and organize subject rosters.',
    tag: 'Sessions · Classes · Subjects',
    cardBg: 'bg-[#FFFCFF] hover:bg-[#FAF5FF]/80 border-[#FAE8FF]/90',
    iconBg: 'bg-fuchsia-600 text-white shadow-sm',
    numColor: 'text-fuchsia-500/80',
    titleColor: 'text-fuchsia-950',
    textColor: 'text-fuchsia-900/75',
    tagBg: 'bg-white/80 text-fuchsia-800 border-fuchsia-200/90 shadow-2xs',
    footerBorder: 'border-fuchsia-100',
    images: ['/academic-management-preview-1.png', '/academic-management-preview-2.png'],
  },
  {
    icon: ClipboardCheck,
    title: 'Exam Management',
    text: 'Schedule exams, configure grading scales, and automatically generate seating plans.',
    tag: 'Schedules · Grading · Seating',
    cardBg: 'bg-[#FCFBFF] hover:bg-[#F5F3FF]/80 border-[#EDE9FE]/90',
    iconBg: 'bg-violet-600 text-white shadow-sm',
    numColor: 'text-violet-500/80',
    titleColor: 'text-violet-950',
    textColor: 'text-violet-900/75',
    tagBg: 'bg-white/80 text-violet-800 border-violet-200/90 shadow-2xs',
    footerBorder: 'border-violet-100',
    images: ['/exam-management-preview-1.png', '/exam-management-preview-2.png'],
  },
  {
    icon: Wallet,
    title: 'Financial Management',
    text: 'Track fee collections, manage expenses, and keep a real-time view of your financial health.',
    tag: 'Payments · Receipts · Ledgers',
    cardBg: 'bg-[#FFFEFA] hover:bg-[#FFFBEB]/80 border-[#FEF3C7]/90',
    iconBg: 'bg-amber-600 text-white shadow-sm',
    numColor: 'text-amber-600/80',
    titleColor: 'text-amber-950',
    textColor: 'text-amber-900/75',
    tagBg: 'bg-white/80 text-amber-900 border-amber-200/90 shadow-2xs',
    footerBorder: 'border-amber-100',
    images: ['/finance-management-preview-1.png', '/finance-management-preview-2.png'],
  },
  {
    icon: FileDown,
    title: 'Data Exports',
    text: 'Export verified student lists, attendance records, and financial statements directly into standard CSV or Excel formats.',
    tag: 'Excel · CSV · Verified Data',
    cardBg: 'bg-[#FFFCFA] hover:bg-[#FFF7ED]/80 border-[#FFEDD5]/90',
    iconBg: 'bg-orange-600 text-white shadow-sm',
    numColor: 'text-orange-500/80',
    titleColor: 'text-orange-950',
    textColor: 'text-orange-900/75',
    tagBg: 'bg-white/80 text-orange-800 border-orange-200/90 shadow-2xs',
    footerBorder: 'border-orange-100',
    images: ['/data-exports-preview-1.png', '/data-exports-preview-2.png'],
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    text: 'Turn your everyday school records into a clearer view of school performance.',
    tag: 'Attendance · Exams · Workload',
    cardBg: 'bg-[#FAFEFD] hover:bg-[#F0FDFA]/80 border-[#CCFBF1]/90',
    iconBg: 'bg-teal-600 text-white shadow-sm',
    numColor: 'text-teal-500/80',
    titleColor: 'text-teal-950',
    textColor: 'text-teal-900/75',
    tagBg: 'bg-white/80 text-teal-800 border-teal-200/90 shadow-2xs',
    footerBorder: 'border-teal-100',
    images: ['/reports-preview-1.png', '/reports-preview-2.png'],
  },
];
interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationDays: number;
  features?: string[];
  isRecommended?: boolean;
}

function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => {
    setStatus('loading');
    api
      .get<{ data: Plan[] }>('/public/plans')
      .then((r) => {
        setPlans(r.data.data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  };
  useEffect(load, []);

  return (
    <section id="pricing" className="marketing-section">
      <Reveal className="section-heading">
        <span className="eyebrow">ROOM TO GROW</span>
        <h2>
          A smarter school starts
          <br />
          with a simple first step.
        </h2>
        <p>Explore your workspace with a 7-day free trial. Choose the right plan for your school when you’re ready.</p>
      </Reveal>
      <div className="pricing-grid">
        <Reveal className="trial-card">
          <span className="eyebrow">YOUR FIRST WEEK, ON US</span>
          <h3>7-day free trial</h3>
          <p>Get to know your new school workspace.</p>
          <strong>
            Free <small>for 7 days</small>
          </strong>
          <ul>
            {[
              'Students and teaching faculty',
              'Attendance, academics and results',
              'School fees and financial records',
              'Dedicated portals for your team',
            ].map((x) => (
              <li key={x}>
                <Check size={20} />
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="btn-trial">
            <Link to="/register">
              Start your free trial <ArrowRight />
            </Link>
          </Button>
          <small>No credit card required to get started.</small>
        </Reveal>
        {status === 'loading' ? (
          <div className="plan-card animate-pulse" role="status">
            Loading school plans…
          </div>
        ) : status === 'error' ? (
          <div className="plan-card">
            <h3>Explore school plans</h3>
            <p>We couldn’t load the current plans. Please try again.</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : plans.length ? (
          plans.map((plan) => (
            <Reveal key={plan._id} className={`plan-card ${plan.isRecommended ? 'popular' : ''}`}>
              {plan.isRecommended && (
                <div className="popular-badge-wrap">
                  <span className="eyebrow">POPULAR CHOICE</span>
                </div>
              )}
              <h3>{plan.name}</h3>
              <p>{plan.description || 'A connected workspace for your school.'}</p>
              <strong>
                {new Intl.NumberFormat('en-PK', {
                  style: 'currency',
                  currency: plan.currency || 'PKR',
                  maximumFractionDigits: 0,
                }).format(plan.price)}
                <small> / {plan.durationDays} days</small>
              </strong>
              <ul>
                {plan.features?.map((f) => (
                  <li key={f}>
                    <Check size={20} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.isRecommended ? 'default' : 'outline'}
                className={plan.isRecommended ? 'btn-popular' : 'btn-plan-outline'}
                asChild
              >
                <Link to="/register">
                  Get started <ArrowRight />
                </Link>
              </Button>
            </Reveal>
          ))
        ) : (
          <div className="plan-card">
            <h3>Your school, your next chapter.</h3>
            <p>Start with a free trial. Available subscription options will appear here when published.</p>
            <ShieldCheck size={42} />
          </div>
        )}
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="marketing">
      <FloatingNavbar />
      <main>
        {/* =========================================================
            HERO SECTION (Navy #070d1e) WITH WAVY BOTTOM TO WHITE
            ========================================================= */}
        <section id="home" className="marketing-hero relative overflow-hidden">
          <div className="hero-lines" aria-hidden="true" />
          <div
            className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-600/25 via-blue-800/10 to-transparent blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute top-1/2 -left-32 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-blue-500/20 via-indigo-950/20 to-transparent blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <StaggerContainer entrance className="hero-copy">
            <StaggerItem>
              <span className="eyebrow">
                <span className="status-dot" /> COMPLETE SCHOOL OPERATIONS
              </span>
            </StaggerItem>
            <StaggerItem>
              <h1>
                Run your entire school.
                <br />
                <span>From one smart platform.</span>
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p>
                More clarity for your team. More time for your students.
                <br className="hidden sm:block" /> Bring academics, attendance and finance into one beautifully organized workspace.
              </p>
            </StaggerItem>
            <StaggerItem className="hero-actions">
              <Button size="lg" asChild>
                <Link to="/register">
                  Start Your 7-Day Free Trial <ArrowRight />
                </Link>
              </Button>
              <a href="#features">
                Explore features <ArrowRight size={18} />
              </a>
            </StaggerItem>
            <div className="hero-assurance">
              <span>
                <Check size={14} /> No credit card required
              </span>
              <span>
                <Check size={14} /> Your school. Your workspace.
              </span>
            </div>
          </StaggerContainer>

          {/* Live School Management Dashboard Showcase */}
          <div className="hero-product -mb-2 sm:-mb-3 relative z-20">
            <HeroDashboardMockup />
          </div>

          {/* 1. Seamless Wavy Transition from Hero into Value Strip (White) */}
          <CurvedSectionDivider from="transparent" to="#ffffff" height={90} />
        </section>

        {/* Value Strip (Vibrant, Colorful Feature Badges) */}
        {/* Value Strip (Headline Placed Above 4 Full-Width Cards) */}
        <div className="bg-white pt-10 pb-6">
          <Reveal className="value-strip">
            <div className="value-strip-brand">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent font-extrabold tracking-[0.22em] text-xs sm:text-sm uppercase mb-2">
                ONE WORKSPACE.
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Every part of your school.
              </h2>
            </div>
            <div className="value-strip-cards">
              {[
                {
                  icon: GraduationCap,
                  label: 'Academics',
                  badge: 'Curriculum & Marks',
                  cardClass: 'val-card-academics',
                  iconBoxClass: 'val-icon-academics',
                },
                {
                  icon: CalendarCheck,
                  label: 'Attendance',
                  badge: 'Daily Roll-Call',
                  cardClass: 'val-card-attendance',
                  iconBoxClass: 'val-icon-attendance',
                },
                {
                  icon: Wallet,
                  label: 'Finance',
                  badge: 'Fees & Salaries',
                  cardClass: 'val-card-finance',
                  iconBoxClass: 'val-icon-finance',
                },
                {
                  icon: Users,
                  label: 'Your people',
                  badge: 'Students & Staff',
                  cardClass: 'val-card-people',
                  iconBoxClass: 'val-icon-people',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={cn('value-item-badge', item.cardClass)}>
                    <div className={cn('value-item-icon', item.iconBoxClass)}>
                      <Icon />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="val-title">{item.label}</span>
                      <small className="val-badge">{item.badge}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>

        {/* Features Section (White Background) */}
{/* Features Section (White Background) */}
        <section id="features" className="w-full bg-white">
          <div className="marketing-section pb-16">
            <Reveal className="section-heading">
              <span className="eyebrow">LESS FRICTION. MORE FOCUS.</span>
              <h2>
                Everything your school needs.
                <br />
                Finally, in one place.
              </h2>
              <p>Thoughtful tools for the people who keep your school moving.</p>
            </Reveal>
            <StaggerContainer className="feature-grid">
              {features.map((item, i) => {
                const Icon = item.icon;
                const tagChips = item.tag.split(' · ');
                return (
                  <StaggerItem
                    key={item.title}
                    className={cn(
                      'feature-card group flex flex-col justify-between p-6 sm:p-8 rounded-3xl border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl cursor-pointer min-h-[360px] sm:min-h-[440px]',
                      item.cardBg
                    )}
                  >
                    <div className="flex flex-col h-full">
                      <div className="feature-card-top flex items-center justify-between mb-8">
                        <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-105', item.iconBg)}>
                          <Icon className="h-6 w-6" />
                        </span>
                        <small className={cn('text-xs font-black tracking-widest', item.numColor)}>
                          0{i + 1}
                        </small>
                      </div>
                      <h3 className={cn('text-lg sm:text-xl font-extrabold tracking-tight', item.titleColor)}>
                        {item.title}
                      </h3>
                      <p className={cn('text-xs sm:text-sm leading-relaxed mt-4 mb-6', item.textColor)}>
                        {item.text}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-6">
                        {tagChips.map((chip) => (
                          <span
                            key={chip}
                            className={cn(
                              'inline-flex items-center px-3 py-1 rounded text-xs font-semibold border shadow-sm',
                              item.tagBg
                            )}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>

                      {'images' in item && item.images && (
                        <div className="relative h-48 sm:h-56 w-full mt-2 mb-4 group-hover:scale-[1.03] transition-transform duration-500">
                          <img 
                            src={(item.images as string[])[0]} 
                            className="absolute top-0 left-0 w-[90%] rounded-lg shadow-md border border-gray-200/60 object-cover z-10 hover:z-30 transition-transform hover:-translate-y-1 hover:shadow-lg duration-300" 
                            alt={`${item.title} Preview 1`}
                          />
                          <img 
                            src={(item.images as string[])[1]} 
                            className="absolute top-8 right-0 w-[90%] rounded-lg shadow-xl border border-gray-200/60 object-cover z-20 hover:z-30 transition-transform hover:-translate-y-1 hover:shadow-2xl duration-300" 
                            alt={`${item.title} Preview 2`}
                          />
                        </div>
                      )}
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>

          {/* 2. Seamless Wavy Transition from Features (White) into Solutions (Soft Blue #F0F7FF) */}
          <CurvedSectionDivider from="#ffffff" to="#F0F7FF" height={100} />
        </section>

        {/* Solutions Section (Soft Ice Blue Background #F0F7FF) */}
        <section id="solutions" className="solutions-section pb-0 bg-[#F0F7FF]">
          <div className="marketing-section pt-12 pb-16">
            <Reveal className="solution-row">
              <div>
                <span className="eyebrow">A CALMER START TO EVERY DAY</span>
                <h2>
                  Every student accounted for.
                  <br />
                  Every day in focus.
                </h2>
                <p>
                  Take attendance in a few clicks. Plan classes and timetables with confidence. Give teachers and administrators the same clear view of the school day.
                </p>
                <ul className="check-list">
                  <li>
                    <Check /> Bulk attendance and class rosters
                  </li>
                  <li>
                    <Check /> Sessions, sections and subject schedules
                  </li>
                  <li>
                    <Check /> Exams, marks and printable results
                  </li>
                </ul>
                <Link to="/register" className="text-link">
                  Bring your school together <ArrowRight size={17} />
                </Link>
              </div>
              <div className="mini-roster">
                <div className="mini-title">
                  <span>
                    <CalendarCheck /> Class attendance
                  </span>
                  <small>Illustrative preview</small>
                </div>
                <div className="roster-summary">
                  <strong>
                    Class 8 <small>Section A</small>
                  </strong>
                  <span>Today’s roster</span>
                </div>
                {[
                  ['AH', 'Ayesha Hassan', 'Present'],
                  ['OA', 'Omar Ahmed', 'Present'],
                  ['FK', 'Fatima Khan', 'Leave'],
                  ['ZA', 'Zain Ali', 'Present'],
                ].map(([initials, name, status]) => (
                  <div className="roster-row" key={name}>
                    <b>{initials}</b>
                    <span>{name}</span>
                    <em className={status === 'Leave' ? 'leave' : ''}>{status}</em>
                  </div>
                ))}
                <div className="roster-footer">
                  <ShieldCheck size={17} /> A simple routine. A complete record.
                </div>
              </div>
            </Reveal>

            <Reveal className="solution-row finance-story mt-20">
              <div className="finance-preview">
                <span className="eyebrow">FINANCIAL CLARITY</span>
                <h3>A clear view of every rupee.</h3>
                <div>
                  <Wallet />
                  <span>
                    Collected fees<strong>Payments & receipts</strong>
                  </span>
                  <Check />
                </div>
                <div>
                  <ClipboardCheck />
                  <span>
                    Outstanding balances<strong>Pending & partial fees</strong>
                  </span>
                  <Check />
                </div>
                <div>
                  <BarChart3 />
                  <span>
                    School expenses<strong>Income, expenses & payroll</strong>
                  </span>
                  <Check />
                </div>
              </div>
              <div>
                <span className="eyebrow">CONFIDENCE IN EVERY NUMBER</span>
                <h2>
                  Less chasing payments.
                  <br />
                  More financial clarity.
                </h2>
                <p>
                  Track collected, pending and partial fees. Record payments, print receipts and manage salaries from a single, organized finance workspace.
                </p>
                <ul className="check-list">
                  <li>
                    <Check /> Clear payment statuses and balances
                  </li>
                  <li>
                    <Check /> Professional, printable receipts
                  </li>
                  <li>
                    <Check /> Reports that connect the details
                  </li>
                </ul>
              </div>
            </Reveal>
          </div>

          {/* 3. Seamless Wavy Transition from Solutions (Soft Blue) into Roles (White) */}
          <CurvedSectionDivider from="#F0F7FF" to="#ffffff" height={100} />
        </section>

        {/* Roles Grid Section (White Background) */}
        <section className="w-full bg-white">
          <div className="marketing-section pb-16">
            <Reveal className="section-heading">
              <span className="eyebrow">THE RIGHT TOOLS. THE RIGHT PEOPLE.</span>
              <h2>One school. A workspace for everyone.</h2>
              <p>Purposeful portals help each person focus on their part of the school day.</p>
            </Reveal>
            <StaggerContainer className="roles-grid">
              {[
                {
                  icon: Building2,
                  title: 'School owners',
                  text: 'School-wide oversight and workspace settings.',
                  cls: 'role-owners',
                  badge: 'Executive Oversight',
                },
                {
                  icon: ShieldCheck,
                  title: 'Principals & admins',
                  text: 'Coordinate academics, people and daily operations.',
                  cls: 'role-admins',
                  badge: 'Campus Operations',
                },
                {
                  icon: GraduationCap,
                  title: 'Teachers',
                  text: 'Manage classes, attendance and assignments.',
                  cls: 'role-teachers',
                  badge: 'Faculty & Classes',
                },
                {
                  icon: Users,
                  title: 'Students',
                  text: 'Keep track of assignments, results and fees.',
                  cls: 'role-students',
                  badge: 'Student Portal',
                },
                {
                  icon: Wallet,
                  title: 'Accountants',
                  text: 'Stay on top of payments, expenses and salaries.',
                  cls: 'role-accountants',
                  badge: 'Finance & Accounts',
                },
                {
                  icon: ClipboardCheck,
                  title: 'Receptionists',
                  text: 'Keep student records and front-desk work organized.',
                  cls: 'role-receptionists',
                  badge: 'Front-Desk Portal',
                },
              ].map(({ icon: Icon, title, text, cls, badge }) => (
                <StaggerItem key={title} className={`role-card ${cls}`}>
                  <div className="role-card-header">
                    <div className="role-icon-box">
                      <Icon />
                    </div>
                    <span className="role-badge">{badge}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
            <Reveal className="communication-card my-12">
              <Megaphone size={36} />
              <div>
                <h3>Keep your school in the loop.</h3>
                <p>Notices, notifications, leave requests and assignment feedback connect the everyday conversations.</p>
              </div>
              <Link to="/register" className="text-link">
                Get connected <ArrowRight size={17} />
              </Link>
            </Reveal>
          </div>

          {/* 4. Seamless Wavy Transition from Roles (White) into Security (Navy #070d1e) */}
          <CurvedSectionDivider from="#ffffff" to="#070d1e" height={100} />
        </section>

        {/* Security Section (Dark Royal Navy #070d1e) */}
        <section className="security-section pb-0 bg-[#070d1e]">
          <div className="marketing-section pt-12 pb-16">
            <Reveal className="security-content">
              <div>
                <span className="eyebrow">BUILT ON TRUST</span>
                <h2>
                  Your school’s information.
                  <br />
                  Thoughtfully protected.
                </h2>
                <p>
                  Keep school records organized with separate school workspaces, role-based access and an activity history for important actions.
                </p>
              </div>
              <div className="security-items">
                {[
                  [LockKeyhole, 'Access with purpose', 'Control what each role can view and manage.'],
                  [Layers, 'A workspace of your own', 'School records remain separate from other schools.'],
                  [ShieldCheck, 'Accountability built in', 'Review important actions through your audit history.'],
                ].map(([Icon, title, text]) => {
                  const I = Icon as typeof Users;
                  return (
                    <div key={String(title)}>
                      <I />
                      <span>
                        <strong>{String(title)}</strong>
                        <p>{String(text)}</p>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </div>

          {/* 5. Seamless Wavy Transition from Security (Navy) into Pricing (White) */}
          <CurvedSectionDivider from="#070d1e" to="#ffffff" height={100} />
        </section>

        {/* Pricing & FAQ Section (White Background) */}
        <div className="w-full bg-white">
          <Pricing />

          <section id="faqs" className="marketing-section faq-section pb-16">
            <Reveal>
              <span className="eyebrow">A FEW THINGS TO KNOW</span>
              <h2>
                Good questions.
                <br />
                Clear answers.
              </h2>
              <p>A little clarity before your first school day with us.</p>
            </Reveal>
            <Reveal>
              {[
                [
                  'How does the 7-day trial work?',
                  'Register your school to activate a 7-day trial and explore the school workspace. Your billing page shows the remaining time and available plans.',
                ],
                [
                  'Can different members of staff have their own access?',
                  'Yes. School administrators, teachers, students, accountants and receptionists have role-based access, with permissions managed by your school.',
                ],
                [
                  'Can I manage fees and print receipts?',
                  'Yes. Record payments, track outstanding and partial fees, and print receipts. Expenses and salaries have their own dedicated tools.',
                ],
                [
                  'How do subscription payments work?',
                  'Choose an available plan in Billing, follow the payment method instructions and upload your payment proof. You can track its review status and subscription history there.',
                ],
                [
                  'Can I use it on my phone?',
                  'Yes. The workspace adapts to phones and tablets, with mobile navigation, responsive forms and scrollable data tables.',
                ],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={22} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </Reveal>
          </section>

          {/* 6. Seamless Wavy Transition from FAQ (White) into Final CTA (Navy #070d1e) */}
          <CurvedSectionDivider from="#ffffff" to="#070d1e" height={100} />
        </div>

        {/* Final CTA Section (Dark Royal Navy #070d1e) */}
        <section className="final-cta bg-[#070d1e]">
          <Reveal>
            <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
            <h2>
              Make room for what matters.
              <br />
              We’ll help with the school day.
            </h2>
            <p>One connected workspace. A more organized school.</p>
            <Button size="lg" className="btn-cta-large" asChild>
              <Link to="/register">
                Start Your 7-Day Free Trial <ArrowRight />
              </Link>
            </Button>
            <small>No credit card required.</small>
          </Reveal>
        </section>
      </main>

      {/* Footer (Dark Royal Navy #070d1e) */}
      <footer className="w-full bg-[#070d1e]">
        <Reveal className="marketing-footer">
          <div>
            <Brand />
            <p>A clearer way to run your school.</p>
          </div>
          <nav aria-label="Footer navigation">
            {links.slice(1).map(([label, href]) => (
              <a key={label} href={href}>
                {label}
              </a>
            ))}
            <Link to="/login">Sign In</Link>
          </nav>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} School Management System</span>
            <span>Built for better school days.</span>
          </div>
        </Reveal>
      </footer>
    </div>
  );
}

export default LandingPage;
