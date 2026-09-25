import { AuthShell } from '@/components/AuthShell';
import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  School,
  Building2,
  Lock,
  Mail,
  User,
  Phone,
  MapPin,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useAuth, AuthResponseData } from '@/context/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';

const registerSchema = z
  .object({
    schoolName: z.string().trim().min(3, 'School name must be at least 3 characters').max(100),
    ownerName: z.string().trim().min(2, 'Administrator name is required').max(60),
    email: z.string().trim().toLowerCase().email('Enter a valid work email address'),
    phone: z.string().trim().min(7, 'Valid contact phone number is required'),
    city: z.string().trim().min(2, 'City is required'),
    country: z.string().trim().default('Pakistan'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { isAuthenticated, applySession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      country: 'Pakistan',
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (values: RegisterForm) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await api.post<{
        success: boolean;
        data: {
          tenant: { _id: string; name: string; slug: string; trialEndsAt: string };
          user: any;
          accessToken: string;
          refreshToken?: string;
        };
      }>('/public/register', values);

      if (res.data.success) {
        applySession({
          user: res.data.data.user,
          accessToken: res.data.data.accessToken,
          refreshToken: res.data.data.refreshToken,
        });

        toast.success('School Account Created!', {
          description: `Welcome to ${values.schoolName}. Your 7-day full-access trial is now active.`,
        });

        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Failed to register school. Please check your inputs.'));
    } finally {
      setSubmitting(false);
    }
  };

  return <AuthShell registration><span className="eyebrow">7 DAYS TO EXPLORE. ROOM TO GROW.</span><h1>Your next school chapter<br/>starts here.</h1><p className="auth-subtitle">Create your school workspace. No credit card required.</p>{serverError && <div role="alert" className="mb-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{serverError}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4"><p className="text-xs text-muted-foreground">Use 8+ characters with uppercase, lowercase and a number for your password.</p>
              {/* School Name */}
              <div className="space-y-1.5">
                <Label htmlFor="schoolName" className="text-foreground text-xs font-medium">
                  Official School / Institution Name
                </Label>
                <div className="relative">
                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="schoolName"
                    type="text"
                    placeholder="e.g. Crescent Model School"
                    className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                    disabled={submitting}
                    {...register('schoolName')}
                  />
                </div>
                {errors.schoolName && <p className="text-xs text-destructive">{errors.schoolName.message}</p>}
              </div>

              {/* Principal / Admin Name */}
              <div className="space-y-1.5">
                <Label htmlFor="ownerName" className="text-foreground text-xs font-medium">
                  Administrator / Principal Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="ownerName"
                    type="text"
                    placeholder="e.g. Dr. Muhammad Tariq"
                    className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                    disabled={submitting}
                    {...register('ownerName')}
                  />
                </div>
                {errors.ownerName && <p className="text-xs text-destructive">{errors.ownerName.message}</p>}
              </div>

              {/* Email & Phone Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-foreground text-xs font-medium">
                    Official Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@school.edu.pk"
                      className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-foreground text-xs font-medium">
                    Contact Phone / WhatsApp
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+92 300 1234567"
                      className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('phone')}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
              </div>

              {/* City & Country Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-foreground text-xs font-medium">
                    City / Campus Location
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="city"
                      type="text"
                      placeholder="e.g. Lahore, Karachi, Islamabad"
                      className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('city')}
                    />
                  </div>
                  {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="country" className="text-foreground text-xs font-medium">
                    Country
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="country"
                      type="text"
                      placeholder="Pakistan"
                      className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('country')}
                    />
                  </div>
                  {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
                </div>
              </div>

              {/* Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-foreground text-xs font-medium">
                    Account Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-foreground text-xs font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 bg-muted border-input text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:ring-teal-500/20"
                      disabled={submitting}
                      {...register('confirmPassword')}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 bg-primary hover:bg-brand-500 text-primary-foreground font-semibold shadow-lg shadow-teal-600/30 transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating your school workspace…
                    </>
                  ) : (
                    <>
                      Start 7-Day Free Trial
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground pt-2">
                By signing up, you agree to our Terms of Service & Privacy Policy. No credit card required.
              </p>
            </form>
<p className="mt-6 text-center text-xs text-muted-foreground">Already have an account? <Link to="/login" className="font-semibold text-primary">Sign In</Link></p></AuthShell>;
}
