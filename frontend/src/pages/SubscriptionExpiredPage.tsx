import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight, CreditCard, Lock, LifeBuoy, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export function SubscriptionExpiredPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-teal-500 selection:text-foreground">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-background backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 text-foreground shadow-md">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">SmartSchool SaaS</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout()} className="text-muted-foreground hover:text-foreground">
          Sign Out
        </Button>
      </header>

      {/* Lockout Box */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl shadow-black/80 space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-inner">
            <Lock className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Subscription Expired</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your school's free trial or subscription period has elapsed. Administrative operations are currently restricted until a renewal is approved.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 text-xs text-left space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Your school records are preserved</span>
            </div>
            <p className="text-muted-foreground">
              All student records, fee histories, exams, and attendance data remain fully preserved in your school workspace.
            </p>
          </div>

          <div className="space-y-3">
            <Link to="/billing" className="w-full block">
              <Button className="w-full h-11 bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-500 hover:to-teal-500 text-foreground font-semibold shadow-lg shadow-teal-600/30">
                <CreditCard className="w-4 h-4 mr-2" />
                Select Plan & Submit Payment Proof
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>Need help? Contact support: <strong>support@saas.school</strong></span>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} SmartSchool Management SaaS.
      </footer>
    </div>
  );
}
