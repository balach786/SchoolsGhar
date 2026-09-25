import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Sparkles, ShieldAlert, ArrowRight, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface SubscriptionStatus {
  tenant: {
    _id: string;
    name: string;
    status: string;
    subscriptionStatus: string;
  };
  status: 'trial' | 'active' | 'expired' | 'suspended';
  daysRemaining: number;
  isExpired: boolean;
  isSuspended: boolean;
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
}

export function SubscriptionBanner() {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    // Only query for school users with a tenantId, not platform admins
    if (!user || user.isPlatformAdmin || user.role === 'platform_admin') return;

    let mounted = true;
    api
      .get<{ success: boolean; data: SubscriptionStatus }>('/subscription/me')
      .then((res) => {
        if (mounted && res.data?.success) {
          setSub(res.data.data);
        }
      })
      .catch(() => {
        // Silently ignore if not authorized or network error
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  if (!sub) return null;

  // 1. Account is Suspended
  if (sub.isSuspended || sub.status === 'suspended') {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-2.5 flex items-center justify-between shadow-sm text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Your school account is currently suspended. Please contact platform administration.</span>
        </div>
      </div>
    );
  }

  // 2. Account is Expired
  if (sub.isExpired || sub.status === 'expired') {
    return (
      <div className="bg-amber-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm text-sm">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Your school subscription / trial has expired. To restore unrestricted access, please renew your plan.</span>
        </div>
        <Link to="/billing">
          <Button size="sm" variant="secondary" className="h-7 text-xs bg-white text-amber-900 hover:bg-slate-100 font-semibold">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Renew Now
          </Button>
        </Link>
      </div>
    );
  }

  // 3. Trial Active with 3 days or fewer remaining
  if (sub.status === 'trial' && sub.daysRemaining <= 3) {
    const dayLabel = sub.daysRemaining <= 0 ? 'today' : `in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? '' : 's'}`;
    return (
      <div className="bg-gradient-to-r from-teal-900 to-teal-900 text-teal-100 px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-teal-700/50 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-teal-300 shrink-0" />
          <span>
            <strong className="font-semibold text-white">Free Trial Alert:</strong> Your 7-day trial ends{' '}
            <strong className="underline decoration-teal-400 font-semibold text-white">{dayLabel}</strong>. Upgrade to a permanent tier to avoid service interruption.
          </span>
        </div>
        <Link to="/billing">
          <Button size="sm" className="h-7 text-xs bg-teal-500 hover:bg-teal-400 text-white font-medium shadow">
            Upgrade Plan
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
    );
  }

  // 4. Regular active subscription expiring in <= 5 days
  if (sub.status === 'active' && sub.daysRemaining <= 5) {
    return (
      <div className="bg-slate-800 text-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            Your subscription renews in <strong>{sub.daysRemaining} days</strong>. You can renew early without losing any remaining days.
          </span>
        </div>
        <Link to="/billing">
          <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600 text-white hover:bg-slate-700">
            Extend Subscription
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
