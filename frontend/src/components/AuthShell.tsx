import { Link } from 'react-router-dom';
import { PageTransition } from './PageTransition';
import { DashboardPreviewMockup } from './DashboardPreviewMockup';
import { GraduationCap, ArrowRight, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function AuthShell({
  children,
  registration = false,
}: {
  children: React.ReactNode;
  registration?: boolean;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="auth-page flex flex-col min-h-screen">
      {/* Subtle ambient lighting derived from dashboard palette */}
      <div
        className="pointer-events-none absolute top-10 right-10 -z-10 h-[550px] w-[550px] rounded-full bg-blue-100/40 blur-[130px] dark:bg-blue-900/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-10 right-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-amber-100/30 blur-[120px] dark:bg-amber-950/10"
        aria-hidden="true"
      />

      {/* Floating Brand Header */}
      <header className="auth-nav">
        <Link
          to="/"
          className="group flex items-center gap-2.5 outline-none transition-transform hover:scale-[1.01]"
          aria-label="School Management System Home"
        >
          <div className="flex items-center justify-center transition-transform group-hover:scale-105">
            <img src="/logo-blue.png" alt="SchoolsGhar" className="h-8 w-auto dark:hidden" />
            <img src="/logo-white.png" alt="SchoolsGhar" className="h-8 w-auto hidden dark:block" />
          </div>
        </Link>

        <Link
          to={registration ? '/login' : '/register'}
          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/70 px-4 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-[#1E3A8A]/30 hover:bg-white hover:text-[#1E3A8A] hover:shadow-xs dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:text-blue-400"
        >
          <span>{registration ? 'Already registered? Sign in' : 'Start your free trial'}</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 text-[#1E3A8A] dark:text-blue-400" />
        </Link>
      </header>

      {/* Two-Column Main Layout */}
      <main className={`auth-layout flex-1 ${registration ? 'auth-register' : ''}`}>
        {/* Left: Login / Register Form */}
        <div className="auth-form">
          <PageTransition>{children}</PageTransition>
        </div>

        {/* Right: Dashboard Product Preview */}
        <aside className="auth-presentation hidden lg:flex">
          <div className="auth-visual">
            <div className="mb-4">
              <span className="eyebrow flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                ONE CONNECTED WORKSPACE
              </span>
              <h2>
                Everything your school needs.
                <span className="block text-[#1E3A8A] dark:text-blue-400">
                  In one unified dashboard.
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg">
                Students, teachers, attendance, fees, exams and reports — beautifully organized and
                accessible from anywhere.
              </p>
            </div>

            {/* Dashboard 3D Mockup */}
            <DashboardPreviewMockup />
          </div>
        </aside>
      </main>

      {/* Dashboard-Consistent Footer */}
      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} School Management System · Built for better school days.</span>
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>Light mode</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-slate-600" />
              <span>Dark mode</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
