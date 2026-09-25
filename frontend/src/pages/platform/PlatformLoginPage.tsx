import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldAlert, Loader2, Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { apiErrorMessage } from '@/lib/api';

const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter platform admin email address'),
  password: z.string().min(1, 'Password is required'),
});

type PlatformLoginForm = z.infer<typeof platformLoginSchema>;

export function PlatformLoginPage() {
  const { loginPlatform, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlatformLoginForm>({
    resolver: zodResolver(platformLoginSchema),
    defaultValues: {
      email: 'platformadmin@saas.school',
    },
  });

  if (isAuthenticated && (user?.isPlatformAdmin || user?.role === 'platform_admin')) {
    return <Navigate to="/platform-admin/dashboard" replace />;
  }

  const onSubmit = async (values: PlatformLoginForm) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const success = await loginPlatform(values.email, values.password);
      if (success) {
        toast.success('Welcome to your platform');
        navigate('/platform-admin/dashboard', { replace: true });
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Invalid credentials or platform admin access denied.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 selection:bg-teal-500 selection:text-foreground">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-teal-600/15 rounded-full blur-3xl" />
      </div>

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600/20 border border-teal-500/30 text-primary shadow-lg shadow-teal-600/20">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Owner Access</h1>
          <p className="text-xs text-muted-foreground">
            Manage schools, subscriptions and payment reviews.
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-none space-y-5">
          {serverError && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-foreground">
                Platform Admin Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  disabled={submitting}
                  className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-teal-500"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  disabled={submitting}
                  className="pl-9 pr-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-teal-500"
                  {...register('password')}
                />
                <button
                  type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-primary hover:bg-brand-500 text-primary-foreground font-semibold shadow-lg shadow-teal-600/30"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  Access Platform Control
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Looking for a school portal? <Link to="/login" className="text-primary hover:underline">Sign into your school</Link>
        </p>
      </div>
    </div>
  );
}
