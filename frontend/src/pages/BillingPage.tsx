import { RevealCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { useEffect, useState, useRef } from 'react';
import {
  CreditCard,
  Check,
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Building2,
  Calendar,
  FileText,
  HelpCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  History,
  Users,
  GraduationCap,
  Copy,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, getAssetUrl } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface Plan {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  currency: string;
  durationDays: number;
  maxStudents?: number;
  maxTeachers?: number;
  features?: string[];
  isRecommended?: boolean;
}

interface PaymentMethod {
  _id: string;
  name: string;
  type: string;
  accountTitle: string;
  accountNumber: string;
  bankName?: string;
  branchCode?: string;
  iban?: string;
  instructions?: string;
}

interface CustomerPayment {
  _id: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
  status: 'pending' | 'approved' | 'rejected';
  proofUrl: string;
  adminReviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface SubscriptionHistoryEvent {
  _id: string;
  tenantId: string;
  planId?: string | null;
  action: string;
  previousStatus?: string | null;
  newStatus: string;
  previousEndsAt?: string | null;
  newEndsAt?: string | null;
  source: string;
  reason?: string | null;
  createdAt: string;
}

interface SubscriptionSummary {
  tenant: {
    _id: string;
    name: string;
    slug: string;
    status: string;
    subscriptionStatus: string;
  };
  status: 'trial' | 'active' | 'expired' | 'suspended';
  daysRemaining: number;
  isExpired: boolean;
  isSuspended: boolean;
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  currentPlan?: Plan | null;
  pendingPayment?: CustomerPayment | null;
}

export function BillingPage() {
  return (
    <ErrorBoundary
      fallbackTitle="Billing & Subscription Encountered an Issue"
      fallbackDescription="We could not render the billing dashboard. Please click Try Again or reload the page."
    >
      <BillingContent />
    </ErrorBoundary>
  );
}

function BillingContent() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [historyEvents, setHistoryEvents] = useState<SubscriptionHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState('');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const [sumRes, plansRes, methodsRes, paymentsRes, historyRes] = await Promise.allSettled([
        api.get<{ success: boolean; data: SubscriptionSummary }>('/subscription/me'),
        api.get<{ success: boolean; data: Plan[] }>('/subscription/plans'),
        api.get<{ success: boolean; data: PaymentMethod[] }>('/subscription/payment-methods'),
        api.get<{ success: boolean; data: CustomerPayment[] }>('/subscription/payments'),
        api.get<{ success: boolean; data: SubscriptionHistoryEvent[] }>('/subscription/history'),
      ]);

      let criticalFailed = false;

      // Handle Subscription Summary
      if (sumRes.status === 'fulfilled' && sumRes.value.data?.success) {
        setSummary(sumRes.value.data.data);
      } else {
        criticalFailed = true;
        console.warn('Subscription status fetch failed', sumRes);
      }

      // Handle Plans
      if (plansRes.status === 'fulfilled' && plansRes.value.data?.success) {
        setPlans(plansRes.value.data.data || []);
      } else if (plansRes.status === 'fulfilled' && Array.isArray(plansRes.value.data)) {
        setPlans(plansRes.value.data);
      } else {
        console.warn('Plans fetch failed', plansRes);
      }

      // Handle Payment Methods
      if (methodsRes.status === 'fulfilled' && methodsRes.value.data?.success) {
        const fetchedMethods = methodsRes.value.data.data || [];
        setMethods(fetchedMethods);
        if (fetchedMethods.length > 0) {
          setSelectedMethodId(fetchedMethods[0]._id);
        }
      }

      // Handle Customer Payments
      if (paymentsRes.status === 'fulfilled' && paymentsRes.value.data?.success) {
        setPayments(paymentsRes.value.data.data || []);
      }

      // Handle Subscription History
      if (historyRes.status === 'fulfilled' && historyRes.value.data?.success) {
        setHistoryEvents(historyRes.value.data.data || []);
      }

      if (criticalFailed && !summary) {
        setLoadError('Unable to retrieve your current school subscription details. Please verify your connection.');
      }
    } catch (err) {
      console.error('Fatal fetch error in BillingPage:', err);
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openPaymentModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setAmountPaid(plan.price);
    setTransactionRef('');
    setNotes('');
    setProofFile(null);
    setProofPreview(null);
    if (methods.length > 0) setSelectedMethodId(methods[0]._id);
    setModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', { description: 'Receipt screenshot must be under 5 MB' });
      return;
    }

    setProofFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setProofPreview(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!proofFile) {
      toast.error('Screenshot required', { description: 'Please attach the transfer receipt or bank payment slip' });
      return;
    }
    if (!transactionRef.trim()) {
      toast.error('Reference number required', { description: 'Please enter the transaction reference / deposit ID' });
      return;
    }

    const chosenMethod = methods.find((m) => m._id === selectedMethodId);

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('planId', selectedPlan._id);
      formData.append('paymentMethod', chosenMethod ? `${chosenMethod.name} (${chosenMethod.accountTitle})` : 'Manual Bank Transfer');
      formData.append('paymentMethodId', selectedMethodId);
      formData.append('transactionReference', transactionRef.trim());
      formData.append('amount', String(amountPaid || selectedPlan.price));
      formData.append('notes', notes.trim());
      formData.append('proof', proofFile);

      const res = await api.post('/subscription/payments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        toast.success('Payment Proof Submitted!', {
          description: 'Our verification team has received your payment slip. Your plan will be activated shortly.',
        });
        setModalOpen(false);
        fetchAll();
      }
    } catch (err) {
      toast.error('Submission failed', { description: apiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[450px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Loading subscription details & billing plans...
        </p>
      </div>
    );
  }

  const activeMethod = methods.find((m) => m._id === selectedMethodId);

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Subscription & Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your school’s subscription tier, review plan limits, and submit payment renewals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary?.status === 'trial' && (
            <Badge className="bg-primary/10 text-primary border-primary/25 px-3 py-1 text-sm font-semibold">
              <Sparkles className="w-4 h-4 mr-1.5" /> 7-Day Free Trial
            </Badge>
          )}
          {summary?.status === 'active' && (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-3 py-1 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Active Commercial Plan
            </Badge>
          )}
          {summary?.isExpired && (
            <Badge variant="destructive" className="px-3 py-1 text-sm font-semibold">
              <AlertCircle className="w-4 h-4 mr-1.5" /> Expired
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5 ml-2">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert Banner if summary failed */}
      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to sync subscription</p>
              <p className="text-xs opacity-90">{loadError}</p>
            </div>
          </div>
          <Button size="sm" variant="destructive" onClick={fetchAll} className="gap-1.5 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
          </Button>
        </div>
      )}

      {/* Current Status Overview Card */}
      {summary ? (
        <RevealCard className="border-border/80 shadow-sm bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm/60 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                {summary.tenant?.name || 'Your School'} — Subscription Status
              </span>
              <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                Workspace ID: {summary.tenant?.slug || 'school'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-3.5 rounded-xl bg-muted/50 border border-border/50">
              <span className="text-muted-foreground text-xs font-medium block">Subscription Tier</span>
              <p className="font-semibold text-base mt-1 text-foreground">
                {summary.currentPlan?.name || (summary.status === 'trial' ? '7-Day Free Trial' : 'School subscription')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Plan features are listed below.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/50 border border-border/50">
              <span className="text-muted-foreground text-xs font-medium block">Account Access</span>
              <div className="flex items-center gap-1.5 mt-1">
                {summary.status === 'active' && (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Full Commercial Access
                  </span>
                )}
                {summary.status === 'trial' && (
                  <span className="font-semibold text-primary flex items-center gap-1">
                    <Sparkles className="w-4 h-4" /> Full Trial Access
                  </span>
                )}
                {summary.isExpired && (
                  <span className="font-semibold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Expired (Read-Only)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {summary.status === 'trial' ? 'Full features unlocked for evaluation' : 'All standard features available'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/50 border border-border/50">
              <span className="text-muted-foreground text-xs font-medium block">Time Remaining</span>
              <p className="font-semibold text-base mt-1">
                {summary.isExpired ? (
                  <span className="text-rose-600 font-bold">0 Days (Lapsed)</span>
                ) : (
                  <span className="text-primary font-bold">{summary.daysRemaining ?? 0} Days</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {(summary.daysRemaining ?? 0) <= 3 && !summary.isExpired
                  ? 'Expiring soon — renew below'
                  : 'Active subscription period'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/50 border border-border/50">
              <span className="text-muted-foreground text-xs font-medium block">Renewal / Expiry Date</span>
              <p className="font-semibold text-base mt-1 text-foreground">
                {summary.subscriptionEndsAt
                  ? new Date(summary.subscriptionEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                  : summary.trialEndsAt
                  ? new Date(summary.trialEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                  : 'Active'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Renewals extend seamlessly from expiry date
              </p>
            </div>
          </CardContent>

          {summary.pendingPayment && (
            <CardFooter className="pt-0">
              <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />
                  <span>
                    You have a pending renewal verification of{' '}
                    <strong>PKR {(summary.pendingPayment.amount ?? 0).toLocaleString()}</strong> for plan{' '}
                    <strong>{summary.pendingPayment.planName || 'Commercial Plan'}</strong> (Ref:{' '}
                    <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">{summary.pendingPayment.transactionReference || '—'}</code>).
                  </span>
                </div>
                <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10 shrink-0">
                  Verification In Progress
                </Badge>
              </div>
            </CardFooter>
          )}
        </RevealCard>
      ) : (
        <RevealCard className="border-dashed p-6 text-center text-muted-foreground">
          <p className="text-sm">No subscription summary available.</p>
          <Button variant="outline" size="sm" onClick={fetchAll} className="mt-3">
            Retry Loading
          </Button>
        </RevealCard>
      )}

      {/* Available Plans Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Available Subscription Plans</h2>
          <p className="text-muted-foreground text-sm">
            Choose the package suited for your school. Renewals add directly to your current balance with zero lost days.
          </p>
        </div>

        {plans.length === 0 ? (
          <RevealCard className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No plans currently published. Please check back shortly or contact support.</p>
          </RevealCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = summary?.currentPlan?._id === plan._id;
              return (
                <RevealCard
                  key={plan._id}
                  className={`relative flex flex-col justify-between border-2 transition-all duration-200 hover:shadow-lg rounded-3xl ${
                    plan.isRecommended
                      ? 'border-primary shadow-primary/10 bg-gradient-to-b from-primary/5 to-transparent'
                      : 'border-border'
                  }`}
                >
                  {plan.isRecommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-[11px] font-bold uppercase tracking-wider px-3.5 py-0.5 rounded-full shadow-sm">
                      Most Popular
                    </div>
                  )}
                  <div>
                    <CardHeader>
                      <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                      <CardDescription className="text-xs min-h-[32px]">{plan.description || ''}</CardDescription>
                      <div className="pt-3">
                        <span className="text-3xl font-extrabold tracking-tight">
                          {plan.currency || 'PKR'} {(plan.price ?? 0).toLocaleString()}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">
                          / {plan.durationDays || 30} days (~{Math.round((plan.durationDays || 30) / 30)} month)
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <p className="border-b pb-2 text-xs font-medium text-muted-foreground">Included in your plan</p>
                      <ul className="space-y-2 pt-1">
                        {(plan.features || []).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </div>
                  <CardFooter className="pt-4 border-t">
                    <Button
                      onClick={() => openPaymentModal(plan)}
                      className="w-full"
                      variant={plan.isRecommended ? 'default' : 'outline'}
                    >
                      {isCurrent ? 'Extend This Plan' : 'Select Plan & Pay'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardFooter>
                </RevealCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History Table */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Payment Verification History</h2>
          <p className="text-muted-foreground text-sm">
            All submitted bank slips and payment proofs along with their platform review status.
          </p>
        </div>

        <RevealCard>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm space-y-2">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground">No payment requests submitted yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  When you submit a bank slip or transfer proof to renew your school's subscription, your requests and
                  verification status will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted/50 border-b text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Reference / Txn ID</th>
                      <th className="px-4 py-3">Receipt Proof</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Admin Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((pay) => (
                      <tr key={pay._id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {pay.createdAt ? new Date(pay.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{pay.planName}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {pay.currency || 'PKR'} {(pay.amount ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">
                          {pay.paymentMethod}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{pay.transactionReference}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a
                            href={getAssetUrl(pay.proofUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                          >
                            <ExternalLink className="w-3 h-3" /> View Slip
                          </a>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {pay.status === 'pending' && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10">
                              <Clock className="w-3 h-3 mr-1" /> Pending Review
                            </Badge>
                          )}
                          {pay.status === 'approved' && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                            </Badge>
                          )}
                          {pay.status === 'rejected' && (
                            <Badge variant="outline" className="text-rose-600 border-rose-500/30 bg-rose-500/10">
                              <XCircle className="w-3 h-3 mr-1" /> Rejected
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                          {pay.adminReviewNotes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </RevealCard>
      </div>

      {/* Subscription Timeline / History */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Subscription Lifecycle Timeline
          </h2>
          <p className="text-muted-foreground text-sm">
            Audited history of your school's workspace activations, renewals, and plan adjustments.
          </p>
        </div>

        <RevealCard>
          <CardContent className="p-6">
            {historyEvents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm space-y-2">
                <History className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground">Initial Trial Workspace</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Your school account was registered with 7 days of complimentary access. Lifecycle events will record
                  automatically as you renew or adjust plans.
                </p>
              </div>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-6">
                {historyEvents.map((evt, idx) => {
                  let icon = <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
                  const actionStr = String(evt.action || '').toLowerCase();
                  if (actionStr.includes('trial')) {
                    icon = <Sparkles className="w-4 h-4 text-teal-500" />;
                  } else if (actionStr.includes('payment')) {
                    icon = <CreditCard className="w-4 h-4 text-emerald-500" />;
                  } else if (actionStr.includes('expired')) {
                    icon = <AlertCircle className="w-4 h-4 text-rose-500" />;
                  }

                  return (
                    <li key={evt._id || idx} className="ml-6">
                      <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-background rounded-full ring-4 ring-background border border-border">
                        {icon}
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h3 className="text-sm font-semibold text-foreground capitalize">
                          {String(evt.action || 'Event').replace(/_/g, ' ')}
                        </h3>
                        <time className="text-xs font-normal text-muted-foreground">
                          {evt.createdAt ? new Date(evt.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }) : '—'}
                        </time>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Status transitioned to{' '}
                        <span className="font-semibold text-foreground uppercase">{evt.newStatus || 'active'}</span>
                        {evt.newEndsAt && (
                          <span>
                            {' '}• Valid until {new Date(evt.newEndsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </span>
                        )}
                        {evt.reason && <span> — {/migration bootstrap/i.test(evt.reason) ? 'School workspace activated' : evt.reason}</span>}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </RevealCard>
      </div>

      {/* Manual Payment Submission Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Pay & Renew — {selectedPlan?.name || 'Selected Plan'}
            </DialogTitle>
            <DialogDescription>
              Transfer <strong>PKR {(selectedPlan?.price ?? 0).toLocaleString()}</strong> using any method below and attach the transfer receipt.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePaymentSubmit} className="space-y-5 pt-2">
            {/* Step 1: Select Method */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                1. Select Official Payment Account
              </Label>
              {methods.length === 0 ? (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300">
                  Platform payment accounts are currently being configured. You may still attach payment proof below.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {methods.map((m) => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => setSelectedMethodId(m._id)}
                      className={`p-3 rounded-lg border text-left text-xs transition-all ${
                        selectedMethodId === m._id
                          ? 'border-primary bg-primary/5 font-semibold text-primary'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <p className="font-semibold text-sm truncate">{m.name}</p>
                      <p className="text-muted-foreground truncate">{m.accountTitle}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Show Account Transfer Details */}
            {activeMethod && (
              <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-teal-500/20">
                  <span className="font-semibold text-sm text-foreground">{activeMethod.name}</span>
                  <Badge variant="outline" className="text-teal-600 border-teal-400">
                    Official Receiver
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-slate-700 dark:text-slate-300">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Account Title:</span>
                    <strong className="font-mono text-foreground">{activeMethod.accountTitle}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Account / Wallet Number:</span>
                    <div className="flex items-center gap-1.5">
                      <strong className="font-mono text-foreground select-all">{activeMethod.accountNumber}</strong>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activeMethod.accountNumber, 'Account number')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {activeMethod.bankName && (
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Bank Name:</span>
                      <span>{activeMethod.bankName}</span>
                    </div>
                  )}
                  {activeMethod.iban && (
                    <div>
                      <span className="text-muted-foreground block text-[11px]">IBAN:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono select-all text-foreground">{activeMethod.iban}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(activeMethod.iban!, 'IBAN')}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {activeMethod.instructions && (
                  <p className="text-[11px] text-muted-foreground pt-1 italic">{activeMethod.instructions}</p>
                )}
              </div>
            )}

            {/* Step 3: Payment Verification Inputs */}
            <div className="space-y-3 pt-1">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                2. Enter Transaction & Attach Screenshot
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="txnRef" className="text-xs">
                    Transaction ID / Reference Number *
                  </Label>
                  <Input
                    id="txnRef"
                    type="text"
                    required
                    placeholder="e.g. 1029384756"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount" className="text-xs">
                    Amount Transferred (PKR) *
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    required
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* File Upload Box */}
              <div className="space-y-1.5">
                <Label className="text-xs">Transfer Receipt / Screenshot * (Max 5MB)</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all hover:bg-muted/40 ${
                    proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-border'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {proofFile ? (
                    <div className="flex flex-col items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                      <span className="font-semibold">{proofFile.name}</span>
                      <span className="text-muted-foreground">({(proofFile.size / 1024).toFixed(0)} KB)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
                      <Upload className="w-6 h-6 text-primary" />
                      <span className="font-medium text-foreground">Click to browse payment screenshot</span>
                      <span>Supported: PNG, JPEG, WEBP, PDF</span>
                    </div>
                  )}
                </div>

                {proofPreview && (
                  <div className="mt-2 rounded-lg border p-1 bg-muted/30 inline-block">
                    <img src={proofPreview} alt="Receipt Preview" className="h-24 object-contain rounded" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">
                  Additional Notes (Optional)
                </Label>
                <Input
                  id="notes"
                  type="text"
                  placeholder="e.g. Sent from Meezan Bank ATM"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="min-w-[140px]">
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                  </>
                ) : (
                  'Submit For Approval'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
