import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  Sun,
  Moon,
  HelpCircle,
  Sparkles,
  GraduationCap,
  School,
  CheckCircle2,
  ShieldCheck,
  User,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { LaptopDashboardMockup } from '@/components/dashboard/LaptopDashboardMockup';
import { visibleNavigation } from '@/config/navigation';
import { hasSchoolPermission } from '@/lib/permissions';

const loginSchema = z.object({
  schoolCode: z.string().trim().min(1, 'School code is required'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    schoolName: z.string().trim().min(3, 'School name must be at least 3 characters'),
    ownerName: z.string().trim().min(2, 'Administrator name is required'),
    email: z.string().trim().toLowerCase().email('Enter a valid work email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export function LoginPage() {
  const { login, applySession, isAuthenticated, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Mode toggling: false = Login, true = Register
  const [isRegisterActive, setIsRegisterActive] = useState(false);

  // Login form states
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  // Register form states
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Initialize mode from URL hash or query if provided
  useEffect(() => {
    if (location.pathname === '/register' || location.search.includes('mode=register')) {
      setIsRegisterActive(true);
    }
  }, [location]);

  // Login Form Hook
  const {
    register: registerLoginField,
    handleSubmit: handleLoginSubmit,
    setValue: setLoginValue,
    formState: { errors: loginErrors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      schoolCode: '',
      email: '',
      password: '',
    },
  });

  // Register Form Hook
  const {
    register: registerField,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      schoolName: '',
      ownerName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Already authenticated → redirect to default permitted route
  if (isAuthenticated && user) {
    let defaultRoute = '/dashboard';
    if (!hasSchoolPermission(user, 'dashboard', 'view')) {
      const sections = visibleNavigation(user);
      if (sections.length > 0 && sections[0].items.length > 0) {
        defaultRoute = sections[0].items[0].to;
      }
    }
    return <Navigate to={defaultRoute} replace />;
  }

  const onLoginSubmit = async (values: LoginForm) => {
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      const loggedInUser = await login(values.schoolCode, values.email, values.password);
      toast.success('Welcome back to Greenfield School System!');

      let defaultRoute = '/dashboard';
      if (!hasSchoolPermission(loggedInUser, 'dashboard', 'view')) {
        const sections = visibleNavigation(loggedInUser);
        if (sections.length > 0 && sections[0].items.length > 0) {
          defaultRoute = sections[0].items[0].to;
        }
      }

      const from = (location.state as { from?: string } | null)?.from ?? defaultRoute;
      navigate(from, { replace: true });
    } catch (err) {
      setLoginError(apiErrorMessage(err, 'Unable to sign in. Please verify your email and password.'));
    } finally {
      setLoginSubmitting(false);
    }
  };

  const onRegisterSubmit = async (values: RegisterForm) => {
    setRegisterSubmitting(true);
    setRegisterError(null);
    try {
      const res = await api.post<{
        success: boolean;
        data: {
          tenant: { _id: string; name: string; slug: string; trialEndsAt: string };
          user: any;
          accessToken: string;
          refreshToken?: string;
        };
      }>('/public/register', {
        ...values,
        phone: '0300-1234567',
        city: 'Islamabad',
        country: 'Pakistan',
      });

      if (res.data.success) {
        applySession({
          user: res.data.data.user,
          accessToken: res.data.data.accessToken,
          refreshToken: res.data.data.refreshToken,
        });

        toast.success('School Account Created!', {
          description: `Welcome! Your School Code for login is: ${res.data.data.tenant.slug}`,
          duration: 10000,
        });
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setRegisterError(apiErrorMessage(err, 'Registration failed. Please check your information.'));
    } finally {
      setRegisterSubmitting(false);
    }
  };


  return (
    <div
      className={cn(
        'auth-fullscreen-stage relative h-screen w-screen overflow-hidden bg-white dark:bg-[#070d1e] font-sans selection:bg-[#1E3A8A] selection:text-white',
        isRegisterActive && 'active'
      )}
    >
      {/* Top Floating Glass Controls (Theme Switcher only) */}
      <div className="absolute top-4 sm:top-5 right-4 sm:right-6 z-50 flex items-center gap-2">
        {/* Theme Pill */}
        <div className="flex items-center rounded-full border border-slate-200/80 bg-white/80 p-0.5 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md shadow-xs">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full transition-all',
              theme === 'light'
                ? 'bg-white shadow-xs text-amber-500'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            )}
            aria-label="Light mode"
          >
            <Sun className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full transition-all',
              theme === 'dark'
                ? 'bg-slate-800 shadow-xs text-blue-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            )}
            aria-label="Dark mode"
          >
            <Moon className="h-3 w-3" />
          </button>
        </div>
      </div>
      {/* =========================================================
          3-LAYER WAVY ORGANIC BACKGROUND (Royal Navy Wave Transition)
          ========================================================= */}
      <div
        className={cn(
          'auth-wave-bg absolute top-0 h-full w-[60%] pointer-events-none z-10 transition-all duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          isRegisterActive ? 'left-0 -scale-x-100' : 'right-0 scale-x-100'
        )}
      >
        <svg
          className="absolute right-0 top-0 h-full w-full object-cover"
          viewBox="0 0 800 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Layer 1: Soft Light Blue Accent Wave */}
          <path
            d="M180 0C320 180 200 420 480 620C680 760 520 900 800 900V0H180Z"
            fill="#93C5FD"
            className="animate-wave-1"
            style={{ opacity: 0.4 }}
            transform="translate(-40, 20)"
          />

          {/* Layer 2: Vibrant Royal Blue Wave */}
          <path
            d="M180 0C320 180 200 420 480 620C680 760 520 900 800 900V0H180Z"
            fill="#3B82F6"
            className="animate-wave-2"
            style={{ opacity: 0.6 }}
            transform="translate(-20, 10)"
          />

          {/* Layer 3: Main Deep Royal Navy Gradient Wave */}
          <path
            d="M180 0C320 180 200 420 480 620C680 760 520 900 800 900V0H180Z"
            fill="url(#royalNavyWaveGradient)"
            className="animate-wave-3"
          />

          <defs>
            <linearGradient id="royalNavyWaveGradient" x1="180" y1="0" x2="800" y2="900" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="45%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#070d1e" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* =======================================================
          PANEL 1: LOGIN FORM (Left Half by default)
          ======================================================= */}
      <div className="form-box login">
        <div className="w-full max-w-[420px] mx-auto my-auto py-2">
          {/* Form Title & Crest */}
          <div className="text-center mb-5">
            <div
              className="auth-anim mb-4 flex justify-center"
              style={{ '--i': 0, '--j': 20 } as React.CSSProperties}
            >
              <img src="/logo-blue.png" alt="SchoolsGhar" className="h-16 w-auto dark:hidden" />
              <img src="/logo-white.png" alt="SchoolsGhar" className="h-16 w-auto hidden dark:block" />
            </div>
            <h2
              className="auth-anim text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight"
              style={{ '--i': 1, '--j': 21 } as React.CSSProperties}
            >
              Welcome Back
            </h2>
            <p
              className="auth-anim text-xs text-slate-500 dark:text-slate-400 mt-0.5"
              style={{ '--i': 2, '--j': 22 } as React.CSSProperties}
            >
              Sign in to access your school dashboard & operations
            </p>
          </div>

          {/* Login Form Fields */}
          <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-3.5 text-left">
            {/* School Code Field */}
            <div
              className="auth-anim relative"
              style={{ '--i': 2, '--j': 22 } as React.CSSProperties}
            >
              <div className="relative">
                <School className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="login-schoolCode"
                  type="text"
                  placeholder="School Code"
                  autoComplete="off"
                  disabled={loginSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerLoginField('schoolCode')}
                />
              </div>
              {loginErrors.schoolCode && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {loginErrors.schoolCode.message}
                </p>
              )}
            </div>

            {/* Email Field */}
            <div
              className="auth-anim relative"
              style={{ '--i': 3, '--j': 23 } as React.CSSProperties}
            >
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="School Email / Username"
                  autoComplete="email"
                  disabled={loginSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerLoginField('email')}
                />
              </div>
              {loginErrors.email && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {loginErrors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div
              className="auth-anim relative"
              style={{ '--i': 4, '--j': 24 } as React.CSSProperties}
            >
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  disabled={loginSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerLoginField('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {loginErrors.password && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {loginErrors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              className="auth-anim flex items-center justify-between pt-0.5 px-0.5"
              style={{ '--i': 5, '--j': 25 } as React.CSSProperties}
            >
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20 dark:border-slate-700 dark:bg-slate-800"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotNotice((v) => !v)}
                className="text-xs font-semibold text-[#1E3A8A] hover:underline dark:text-blue-400"
              >
                Forgot Password?
              </button>
            </div>

            {/* Forgot Password Notice */}
            {showForgotNotice && (
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2.5 text-xs text-[#1E3A8A] dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                <div className="flex items-start gap-2">
                  <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Please contact your school administrator or ICT department to reset your portal password.
                  </p>
                </div>
              </div>
            )}

            {/* Login Server Error */}
            {loginError && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-medium text-destructive"
              >
                {loginError}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="auth-anim w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#1E3A8A]/95 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-950/20 transition-all flex items-center justify-center gap-2"
              style={{ '--i': 6, '--j': 26 } as React.CSSProperties}
            >
              {loginSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to School</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Switch to Register Link */}
            <div
              className="auth-anim text-center pt-1"
              style={{ '--i': 7, '--j': 27 } as React.CSSProperties}
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Don't have an institution account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegisterActive(true)}
                  className="font-bold text-[#1E3A8A] hover:underline dark:text-blue-400 ml-1 inline-flex items-center gap-1"
                >
                  Register Your School →
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* =======================================================
          PANEL 2: LOGIN INFORMATION & 16:9 LAPTOP DASHBOARD (Right Half)
          ======================================================= */}
      <div className="info-box login">
        <div className="w-full flex flex-col items-center text-center justify-center my-auto px-4">
          <div
            className="auth-anim mb-2"
            style={{ '--i': 0, '--j': 20 } as React.CSSProperties}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
              <Sparkles className="h-3 w-3 text-[#F59E0B]" />
              Live Operational Campus Canvas
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1.5 leading-tight">
              Welcome to Greenfield Academy
            </h2>
            <p className="text-xs text-blue-100/80 max-w-[460px] mx-auto mt-0.5">
              Experience real-time academic records, automated fee management, and daily campus analytics.
            </p>
          </div>

          {/* Recoded 16:9 Main Dashboard inside Apple MacBook Mockup */}
          <div
            className="auth-anim w-full my-1 flex justify-center"
            style={{ '--i': 1, '--j': 21 } as React.CSSProperties}
          >
            <LaptopDashboardMockup tilt="left" />
          </div>
        </div>
      </div>

      {/* =======================================================
          PANEL 3: REGISTER INFORMATION & 16:9 LAPTOP (Left Half on Active)
          ======================================================= */}
      <div className="info-box register">
        <div className="w-full flex flex-col items-center text-center justify-center my-auto px-4">
          <div
            className="auth-anim mb-2"
            style={{ '--i': 17, '--j': 0 } as React.CSSProperties}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
              <School className="h-3 w-3 text-[#F59E0B]" />
              Launch Your Digital School
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1.5 leading-tight">
              Modernize Your Campus
            </h2>
            <p className="text-xs text-blue-100/80 max-w-[460px] mx-auto mt-0.5">
              Start your 7-day full access trial. Manage admissions, examinations, and fee collections in minutes.
            </p>
          </div>

          {/* 16:9 Laptop Mockup */}
          <div
            className="auth-anim w-full my-1 flex justify-center"
            style={{ '--i': 18, '--j': 1 } as React.CSSProperties}
          >
            <LaptopDashboardMockup tilt="right" />
          </div>

          {/* Trust Badges */}
          <div
            className="auth-anim flex items-center justify-center gap-4 text-xs font-medium text-blue-100 mt-2"
            style={{ '--i': 19, '--j': 2 } as React.CSSProperties}
          >
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              No Credit Card Required
            </span>
            <span className="text-white/40">·</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
              Instant Activation
            </span>
          </div>
        </div>
      </div>

      {/* =======================================================
          PANEL 4: REGISTER FORM (Right Half on Active)
          ======================================================= */}
      <div className="form-box register">
        <div className="w-full max-w-[420px] mx-auto my-auto py-2">
          {/* Register Title */}
          <div className="text-center mb-4">
            <div
              className="auth-anim inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1E3A8A] to-[#172554] text-white shadow-md shadow-blue-950/20 mb-2 ring-4 ring-[#1E3A8A]/10"
              style={{ '--i': 17, '--j': 0 } as React.CSSProperties}
            >
              <School className="h-6 w-6 text-[#F59E0B]" />
            </div>
            <h2
              className="auth-anim text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight"
              style={{ '--i': 18, '--j': 1 } as React.CSSProperties}
            >
              Register School
            </h2>
            <p
              className="auth-anim text-xs text-slate-500 dark:text-slate-400 mt-0.5"
              style={{ '--i': 19, '--j': 2 } as React.CSSProperties}
            >
              Create your institutional account and get started
            </p>
          </div>

          {/* Register Form */}
          <form onSubmit={handleRegisterSubmit(onRegisterSubmit)} className="space-y-3 text-left">
            {/* School Name */}
            <div
              className="auth-anim relative"
              style={{ '--i': 20, '--j': 3 } as React.CSSProperties}
            >
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="register-schoolName"
                  type="text"
                  placeholder="School / Academy Name"
                  disabled={registerSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerField('schoolName')}
                />
              </div>
              {registerErrors.schoolName && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {registerErrors.schoolName.message}
                </p>
              )}
            </div>

            {/* Owner / Principal Name */}
            <div
              className="auth-anim relative"
              style={{ '--i': 21, '--j': 4 } as React.CSSProperties}
            >
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="register-ownerName"
                  type="text"
                  placeholder="Principal / Admin Full Name"
                  disabled={registerSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerField('ownerName')}
                />
              </div>
              {registerErrors.ownerName && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {registerErrors.ownerName.message}
                </p>
              )}
            </div>

            {/* Work Email */}
            <div
              className="auth-anim relative"
              style={{ '--i': 22, '--j': 5 } as React.CSSProperties}
            >
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  id="register-email"
                  type="email"
                  placeholder="Official Work Email"
                  autoComplete="email"
                  disabled={registerSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E3A8A] focus:bg-white focus:ring-4 focus:ring-[#1E3A8A]/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                  {...registerField('email')}
                />
              </div>
              {registerErrors.email && (
                <p className="text-xs font-medium text-destructive mt-1 pl-1">
                  {registerErrors.email.message}
                </p>
              )}
            </div>

            {/* Password & Confirm Password Grid */}
            <div
              className="auth-anim grid grid-cols-1 sm:grid-cols-2 gap-2"
              style={{ '--i': 23, '--j': 6 } as React.CSSProperties}
            >
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <Input
                  id="register-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="Password"
                  disabled={registerSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-white"
                  {...registerField('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showRegisterPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <Input
                  id="register-confirmPassword"
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="Confirm"
                  disabled={registerSubmitting}
                  className="h-11 rounded-xl border-slate-200/90 bg-[#F8FAFC] pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-white"
                  {...registerField('confirmPassword')}
                />
              </div>
            </div>
            {(registerErrors.password || registerErrors.confirmPassword) && (
              <p className="text-xs font-medium text-destructive pl-1">
                {registerErrors.password?.message || registerErrors.confirmPassword?.message}
              </p>
            )}

            {/* Server Error */}
            {registerError && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-medium text-destructive"
              >
                {registerError}
              </div>
            )}

            {/* Submit Register Button */}
            <button
              type="submit"
              disabled={registerSubmitting}
              className="auth-anim w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#1E3A8A]/95 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-950/20 transition-all flex items-center justify-center gap-2 mt-1"
              style={{ '--i': 24, '--j': 7 } as React.CSSProperties}
            >
              {registerSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Campus...</span>
                </>
              ) : (
                <>
                  <span>Start 7-Day Free Trial</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Switch back to Login */}
            <div
              className="auth-anim text-center pt-1"
              style={{ '--i': 25, '--j': 8 } as React.CSSProperties}
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Already have a school account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegisterActive(false)}
                  className="font-bold text-[#1E3A8A] hover:underline dark:text-blue-400 ml-1 inline-flex items-center gap-1"
                >
                  Sign In to Account →
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* =========================================================
          FULL-SCREEN SCOPED STYLES: EDGE-TO-EDGE WITH ZERO BOUNDARIES
          ========================================================= */}
      <style>{`
        /* Full Screen Stage */
        .auth-fullscreen-stage {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
        }

        /* Organic 3-Layer Wave Animations */
        @keyframes waveFloat1 {
          0%, 100% {
            transform: translate(-40px, 20px) scale(1);
          }
          50% {
            transform: translate(-48px, 25px) scale(1.008);
          }
        }

        @keyframes waveFloat2 {
          0%, 100% {
            transform: translate(-20px, 10px) scale(1);
          }
          50% {
            transform: translate(-26px, 14px) scale(1.004);
          }
        }

        @keyframes waveGlow {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(30, 58, 138, 0.25));
          }
          50% {
            filter: drop-shadow(0 0 24px rgba(37, 99, 235, 0.45));
          }
        }

        .animate-wave-1 {
          animation: waveFloat1 6s ease-in-out infinite;
        }

        .animate-wave-2 {
          animation: waveFloat2 5s ease-in-out infinite;
        }

        .animate-wave-3 {
          animation: waveGlow 7s ease-in-out infinite;
        }

        /* Form Box Common (Occupies exactly 50% width) */
        .auth-fullscreen-stage .form-box {
          position: absolute;
          top: 0;
          width: 50%;
          height: 100%;
          display: flex;
          justify-content: center;
          flex-direction: column;
          z-index: 20;
          padding: 20px 48px;
        }

        /* Login Form Position */
        .auth-fullscreen-stage .form-box.login {
          left: 0;
          pointer-events: auto;
        }

        .auth-fullscreen-stage.active .form-box.login {
          pointer-events: none;
        }

        .auth-fullscreen-stage .form-box.login .auth-anim {
          transform: translateX(0);
          opacity: 1;
          filter: blur(0);
          transition: 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(0.06s * var(--j));
        }

        .auth-fullscreen-stage.active .form-box.login .auth-anim {
          transform: translateX(-120%);
          opacity: 0;
          filter: blur(10px);
          transition-delay: calc(0.04s * var(--i));
        }

        /* Register Form Position */
        .auth-fullscreen-stage .form-box.register {
          right: 0;
          pointer-events: none;
        }

        .auth-fullscreen-stage.active .form-box.register {
          pointer-events: auto;
        }

        .auth-fullscreen-stage .form-box.register .auth-anim {
          transform: translateX(120%);
          opacity: 0;
          filter: blur(10px);
          transition: 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(0.04s * var(--j));
        }

        .auth-fullscreen-stage.active .form-box.register .auth-anim {
          transform: translateX(0);
          opacity: 1;
          filter: blur(0);
          transition-delay: calc(0.06s * var(--i));
        }

        /* Info Showcase Boxes (Occupies exactly 50% width) */
        .auth-fullscreen-stage .info-box {
          position: absolute;
          top: 0;
          width: 50%;
          height: 100%;
          display: flex;
          justify-content: center;
          flex-direction: column;
          z-index: 20;
          padding: 20px 32px;
        }

        /* Login Info Box (Right side) */
        .auth-fullscreen-stage .info-box.login {
          right: 0;
          pointer-events: auto;
        }

        .auth-fullscreen-stage.active .info-box.login {
          pointer-events: none;
        }

        .auth-fullscreen-stage .info-box.login .auth-anim {
          transform: translateX(0);
          opacity: 1;
          filter: blur(0);
          transition: 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(0.06s * var(--j));
        }

        .auth-fullscreen-stage.active .info-box.login .auth-anim {
          transform: translateX(120%);
          opacity: 0;
          filter: blur(10px);
          transition-delay: calc(0.04s * var(--i));
        }

        /* Register Info Box (Left side) */
        .auth-fullscreen-stage .info-box.register {
          left: 0;
          pointer-events: none;
        }

        .auth-fullscreen-stage.active .info-box.register {
          pointer-events: auto;
        }

        .auth-fullscreen-stage .info-box.register .auth-anim {
          transform: translateX(-120%);
          opacity: 0;
          filter: blur(10px);
          transition: 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(0.04s * var(--j));
        }

        .auth-fullscreen-stage.active .info-box.register .auth-anim {
          transform: translateX(0);
          opacity: 1;
          filter: blur(0);
          transition-delay: calc(0.06s * var(--i));
        }

        /* Responsive Breakpoints for Tablet and Mobile */
        @media (max-width: 1024px) {
          .auth-fullscreen-stage {
            height: 100vh;
            overflow-y: auto;
          }

          .auth-fullscreen-stage::before {
            display: none;
          }

          .auth-fullscreen-stage .info-box {
            display: none;
          }

          .auth-fullscreen-stage .form-box {
            position: relative;
            width: 100%;
            height: 100%;
            padding: 32px 24px;
          }

          .auth-fullscreen-stage .form-box.register {
            display: none;
          }

          .auth-fullscreen-stage.active .form-box.login {
            display: none;
          }

          .auth-fullscreen-stage.active .form-box.register {
            display: flex;
            pointer-events: auto;
          }

          .auth-fullscreen-stage .form-box.login .auth-anim,
          .auth-fullscreen-stage .form-box.register .auth-anim {
            transform: none !important;
            opacity: 1 !important;
            filter: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
