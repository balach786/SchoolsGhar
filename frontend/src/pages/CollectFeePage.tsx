import { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Search,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Printer,
  Sparkles,
  ArrowRight,
  Loader2,
  Clock,
  ShieldCheck,
  Building2,
  Smartphone,
  Banknote,
  DollarSign,
  History,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, toPaisa, formatStudentIdentity } from '@/lib/format';
import { useFeeSettings } from '@/hooks/useFeeSettings';
import { useAuth } from '@/context/AuthContext';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface StudentSearchResult {
  _id: string;
  fullName: string;
  admissionNumber: string;
  rollNumber?: string;
  className?: string;
  sectionName?: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  guardianPhone?: string;
}

interface CalculatedObligations {
  student: {
    studentId: string;
    fullName: string;
    admissionNumber: string;
    rollNumber?: string;
  };
  settings: {
    lateFeeEnabled: boolean;
    dueDateEnabled: boolean;
    otherFeeEnabled: boolean;
    discountEnabled: boolean;
    admissionFeeEnabled: boolean;
  };
  currentMonthFee: {
    invoiceId: string | null;
    baseFee: number;
    discount: number;
    otherFee: number;
    lateFee: number;
    netPayable: number;
    amountPaid: number;
    remainingAmount: number;
  };
  previousPending: {
    totalAmount: number;
    invoices: Array<{
      invoiceId: string;
      title: string;
      feeType: string;
      month: number | null;
      year: number | null;
      dueDate: string | null;
      originalAmount: number;
      discountAmount: number;
      fineAmount: number;
      otherFeeAmount: number;
      netPayable: number;
      amountPaid: number;
      remainingBalance: number;
      status: string;
    }>;
  };
  admissionFee: {
    isEligible: boolean;
    reason: string | null;
    amount: number;
  };
  totalPayable: number;
  totalAlreadyPaid: number;
  totalRemainingAmount: number;
}

interface ReceiptPayload {
  school: {
    schoolName: string;
    schoolLogoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    currency: string;
    signatureLabel: string;
    footerText: string | null;
  };
  payment: {
    _id: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    receiptNumber: string;
    reference: string | null;
    notes: string | null;
    collectedByName: string;
  };
  student: {
    fullName: string;
    admissionNumber: string;
    rollNumber: string;
    className: string;
    sectionName: string;
    sessionName: string;
  };
  fee: {
    title: string;
    feeType: string;
    month: number | null;
    originalAmount: number;
    discountAmount: number;
    fineAmount: number;
    otherFeeAmount?: number;
    netPayable: number;
    remainingBalanceAfter: number;
    status: string;
    chargeBreakdown?: any;
  };
}

export function CollectFeePage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get('studentId');

  const { hasDueDate, hasLateFee, hasOtherFee, hasDiscounts, hasAdmissionFee, otherFeeName } =
    useFeeSettings();

  // Search & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);

  // Month & Year context
  const [billingMonth, setBillingMonth] = useState<number>(new Date().getMonth() + 1);
  const [billingYear, setBillingYear] = useState<number>(new Date().getFullYear());

  // Obligations data
  const [obligations, setObligations] = useState<CalculatedObligations | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Payment Form
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');
  const [paymentAmountPkr, setPaymentAmountPkr] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash'>('cash');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Receipt Modal
  const [issuedReceipt, setIssuedReceipt] = useState<ReceiptPayload | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const canPay = can('payments', 'create');

  // Search Students
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get<ApiListResponse<StudentSearchResult>>(
          `/students?limit=15&search=${encodeURIComponent(searchQuery.trim())}`
        );
        if (active && res.data?.data) {
          setSearchResults(res.data.data);
        }
      } catch {
        // silent
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Handle Initial Student ID from query params
  useEffect(() => {
    if (initialStudentId) {
      api
        .get<ApiDataResponse<StudentSearchResult>>(`/students/${initialStudentId}`)
        .then((res) => {
          if (res.data?.data) {
            setSelectedStudent(res.data.data);
          }
        })
        .catch(() => {});
    }
  }, [initialStudentId]);

  // Load Real-time Student Fee Obligations
  const loadStudentObligations = useCallback(
    async (studentId: string) => {
      setCalcLoading(true);
      setObligations(null);
      try {
        const params = new URLSearchParams({
          studentId,
          month: String(billingMonth),
          year: String(billingYear),
        });
        const res = await api.get<ApiDataResponse<CalculatedObligations>>(
          `/student-fees/calculate?${params}`
        );
        const data = res.data.data;
        setObligations(data);

        // Auto-select best default invoice target: oldest pending first, or current month
        const pendingWithBalance = data.previousPending.invoices.filter((i) => i.remainingBalance > 0);
        if (pendingWithBalance.length > 0) {
          const oldest = pendingWithBalance[0];
          setTargetInvoiceId(oldest.invoiceId);
          setPaymentAmountPkr(String(oldest.remainingBalance / 100));
        } else if (data.currentMonthFee.invoiceId && data.currentMonthFee.remainingAmount > 0) {
          setTargetInvoiceId(data.currentMonthFee.invoiceId);
          setPaymentAmountPkr(String(data.currentMonthFee.remainingAmount / 100));
        } else {
          setTargetInvoiceId('');
          setPaymentAmountPkr('0');
        }
      } catch (err: any) {
        toast.error(apiErrorMessage(err));
      } finally {
        setCalcLoading(false);
      }
    },
    [billingMonth, billingYear]
  );

  function handleInvoiceSelect(id: string) {
    setTargetInvoiceId(id);
    if (!obligations) return;
    if (obligations.currentMonthFee.invoiceId === id) {
      setPaymentAmountPkr(String(obligations.currentMonthFee.remainingAmount / 100));
      return;
    }
    const found = obligations.previousPending.invoices.find((i) => i.invoiceId === id);
    if (found) {
      setPaymentAmountPkr(String(found.remainingBalance / 100));
    }
  }

  useEffect(() => {
    if (selectedStudent?._id) {
      loadStudentObligations(selectedStudent._id);
    }
  }, [selectedStudent, loadStudentObligations]);

  // Submit Payment
  async function handleProcessPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !targetInvoiceId) {
      toast.error('Please select an invoice or Auto-Allocate to apply payment');
      return;
    }

    const amt = parseFloat(paymentAmountPkr);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }

    if (paymentMethod !== 'cash' && !paymentRef.trim()) {
      toast.error(`Transaction Reference is required for ${paymentMethod.toUpperCase()}`);
      return;
    }

    setSubmittingPayment(true);
    try {
      const payload = {
        studentFeeId: targetInvoiceId === 'auto' ? undefined : targetInvoiceId,
        studentId: selectedStudent._id,
        amount: toPaisa(amt),
        paymentMethod,
        reference: paymentRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      };

      const res = await api.post<{ success: boolean; data: { payment: { _id: string } } }>(
        '/payments',
        payload
      );

      const paymentId = res.data.data.payment._id;
      toast.success('Payment recorded successfully!');

      // Fetch Full Receipt for modal display & printing
      const receiptRes = await api.get<ApiDataResponse<ReceiptPayload>>(
        `/payments/${paymentId}/receipt`
      );
      setIssuedReceipt(receiptRes.data.data);

      // Refresh obligations
      loadStudentObligations(selectedStudent._id);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmittingPayment(false);
    }
  }

  function handlePrintReceipt() {
    window.print();
  }

  const cur = obligations?.currentMonthFee;
  const prev = obligations?.previousPending;
  const adm = obligations?.admissionFee;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Collect Fee Counter"
        description="Search enrolled student, verify real-time snapshot obligations, partition pending balances, and record payments"
      />

      <FeesNavHeader activeTab="collect" />

      {/* Top Search & Selection Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Search Box */}
        <Card className="border-border/70 shadow-xs lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Find Student
            </CardTitle>
            <CardDescription className="text-xs">
              Search by Student Name, Roll Number, or Admission Number
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type name, roll, admission #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Results List */}
            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto divide-y divide-border/60 rounded-xl border border-border/70 bg-muted/20">
                {searchResults.map((s) => (
                  <div
                    key={s._id}
                    onClick={() => {
                      setSelectedStudent(s);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="p-2.5 hover:bg-primary/5 transition-colors cursor-pointer text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{formatStudentIdentity(s)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.className || 'Class'} • Roll #{s.rollNumber || '—'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {s.admissionNumber}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Student Card */}
            {selectedStudent ? (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {formatStudentIdentity(selectedStudent)}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-background">
                    {selectedStudent.admissionNumber}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>
                    Class & Section:{' '}
                    <span className="font-medium text-foreground">
                      {selectedStudent.className || '—'} ({selectedStudent.sectionName || '—'})
                    </span>
                  </p>
                  <p>
                    Guardian:{' '}
                    <span className="font-medium text-foreground">
                      {selectedStudent.guardianName || '—'} {selectedStudent.guardianPhone ? `(${selectedStudent.guardianPhone})` : ''}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-border/70 text-center text-xs text-muted-foreground">
                No student selected. Use the search bar above.
              </div>
            )}

            {/* Billing Month Selector */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Billing Month</Label>
                <Select value={String(billingMonth)} onValueChange={(v) => setBillingMonth(Number(v))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, idx) => (
                      <SelectItem key={m} value={String(idx + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Billing Year</Label>
                <Input
                  type="number"
                  value={billingYear}
                  onChange={(e) => setBillingYear(Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real-time Fee Obligations Summary Panel */}
        <Card className="border-border/70 shadow-xs lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Real-Time Obligation Assessment
              </CardTitle>
              <CardDescription className="text-xs">
                Backend calculated snapshot: Current month vs separated previous pending balances
              </CardDescription>
            </div>
            {selectedStudent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadStudentObligations(selectedStudent._id)}
                disabled={calcLoading}
                className="h-8 text-xs gap-1 text-primary"
              >
                <Clock className="h-3.5 w-3.5" />
                Recalculate
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {calcLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Calculating student fee ledger and snapshot breakdown...
              </div>
            ) : obligations ? (
              <div className="space-y-4 text-xs">
                {/* Outstanding Total Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-muted/80 to-muted/40 border border-border/80 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Total Outstanding Obligation
                    </span>
                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                      {formatCurrency(obligations.totalRemainingAmount)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Current Month</p>
                      <p className="font-bold text-foreground">
                        {formatCurrency(cur?.remainingAmount ?? 0)}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Previous Pending</p>
                      <p className="font-bold text-amber-600">
                        {formatCurrency(prev?.totalAmount ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1. Current Month Fee Breakdown */}
                <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-foreground flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      {MONTHS[billingMonth - 1]} {billingYear} Tuition Fee
                    </span>
                    {cur?.invoiceId ? (
                      <Badge
                        variant="outline"
                        className={
                          cur.remainingAmount === 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                            : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                        }
                      >
                        {cur.remainingAmount === 0 ? 'Fully Paid' : 'Pending Payment'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Not Generated Yet
                      </Badge>
                    )}
                  </div>

                  {cur?.invoiceId ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-muted/40">
                        <span className="text-[10px] text-muted-foreground">Base Fee</span>
                        <p className="font-semibold text-foreground">{formatCurrency(cur.baseFee)}</p>
                      </div>

                      {hasDiscounts && (
                        <div className="p-2 rounded-lg bg-muted/40">
                          <span className="text-[10px] text-muted-foreground">Discount</span>
                          <p className="font-semibold text-emerald-600">
                            -{formatCurrency(cur.discount)}
                          </p>
                        </div>
                      )}

                      {hasOtherFee && (
                        <div className="p-2 rounded-lg bg-muted/40">
                          <span className="text-[10px] text-muted-foreground">{otherFeeName}</span>
                          <p className="font-semibold text-foreground">
                            +{formatCurrency(cur.otherFee)}
                          </p>
                        </div>
                      )}

                      {hasLateFee && (
                        <div className="p-2 rounded-lg bg-muted/40">
                          <span className="text-[10px] text-muted-foreground">Assessed Fine</span>
                          <p className="font-semibold text-purple-600">
                            +{formatCurrency(cur.lateFee)}
                          </p>
                        </div>
                      )}

                      <div className="p-2 rounded-lg bg-primary/5 sm:col-span-2">
                        <span className="text-[10px] text-primary font-medium">Net Payable:</span>
                        <p className="font-bold text-foreground">{formatCurrency(cur.netPayable)}</p>
                      </div>

                      <div className="p-2 rounded-lg bg-emerald-50/50 sm:col-span-1">
                        <span className="text-[10px] text-emerald-700">Already Paid:</span>
                        <p className="font-bold text-emerald-600">{formatCurrency(cur.amountPaid)}</p>
                      </div>

                      <div className="p-2 rounded-lg bg-rose-50/50 sm:col-span-1">
                        <span className="text-[10px] text-rose-700">Balance Due:</span>
                        <p className="font-bold text-rose-600">{formatCurrency(cur.remainingAmount)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      No monthly invoice exists for {MONTHS[billingMonth - 1]} {billingYear}. You can generate it from the Fee Setup page.
                    </p>
                  )}
                </div>

                {/* 2. Previous Pending Invoices (Never Merged) */}
                {prev && prev.invoices.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        Previous Pending Invoices ({prev.invoices.length})
                      </span>
                      <span className="font-bold">{formatCurrency(prev.totalAmount)}</span>
                    </div>
                    <div className="divide-y divide-border/60">
                      {prev.invoices.map((inv) => (
                        <div
                          key={inv.invoiceId}
                          className="py-2 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-foreground">{inv.title}</span>
                            <span className="text-muted-foreground ml-2 text-[11px]">
                              {inv.month ? `${MONTHS[inv.month - 1]} ${inv.year || ''}` : 'One-time'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-[11px]">
                              Net: {formatCurrency(inv.netPayable)}
                            </span>
                            <span className="font-bold text-rose-600">
                              Remaining: {formatCurrency(inv.remainingBalance)}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTargetInvoiceId(inv.invoiceId);
                                setPaymentAmountPkr(String(inv.remainingBalance / 100));
                              }}
                              className="h-6 px-2 text-[10px] text-primary"
                            >
                              Select
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Admission Fee Status (Only if Eligible according to backend) */}
                {hasAdmissionFee && adm && (
                  <div className="p-3 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <div>
                        <span className="font-semibold text-foreground">Admission Fee Eligibility</span>
                        <p className="text-[10px] text-muted-foreground">
                          {adm.isEligible
                            ? 'New student eligible for one-time admission charge.'
                            : `Ineligible: ${adm.reason || 'Already completed / Charged previously'}`}
                        </p>
                      </div>
                    </div>
                    {adm.isEligible ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        Eligible ({formatCurrency(adm.amount)})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        Not Applicable
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Select a student from the left panel to load their fee obligation ledger.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Processing Form */}
      {selectedStudent && obligations && (
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Process Fee Payment
            </CardTitle>
            <CardDescription className="text-xs">
              Select invoice target, payment channel (Cash, Bank Transfer, EasyPaisa, JazzCash), and issue official receipt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Target Invoice */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Fee to Pay</Label>
                  <Select value={targetInvoiceId} onValueChange={handleInvoiceSelect}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose fee with pending balance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" className="font-semibold text-primary">
                        Auto-Allocate (Oldest First)
                      </SelectItem>
                      {/* Oldest pending months first */}
                      {prev?.invoices
                        .filter((i) => i.remainingBalance > 0)
                        .map((i) => (
                          <SelectItem key={i.invoiceId} value={i.invoiceId}>
                            {i.title} — Due {formatCurrency(i.remainingBalance)}
                          </SelectItem>
                        ))}
                      {/* Current Month Fee (only if remainingAmount > 0) */}
                      {cur?.invoiceId && cur.remainingAmount > 0 && (
                        <SelectItem value={cur.invoiceId}>
                          {MONTHS[billingMonth - 1]} {billingYear} Tuition — Due {formatCurrency(cur.remainingAmount)}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount to Pay (PKR)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={paymentAmountPkr}
                    onChange={(e) => setPaymentAmountPkr(e.target.value)}
                    className="h-9 text-xs font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Supports partial installments. Invoice remaining balance updates atomically.
                  </p>
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(v: any) => setPaymentMethod(v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash Counter</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                      <SelectItem value="jazzcash">JazzCash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Reference */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Transaction Reference {paymentMethod !== 'cash' && <span className="text-rose-500">*</span>}
                  </Label>
                  <Input
                    placeholder={
                      paymentMethod === 'cash'
                        ? 'Optional cash memo / book ref'
                        : `Required for ${paymentMethod.toUpperCase()} (e.g. TID / Deposit Slip)`
                    }
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="h-9 text-xs"
                    required={paymentMethod !== 'cash'}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Remarks / Notes (Optional)</Label>
                  <Input
                    placeholder="e.g. Paid by uncle via branch deposit"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submittingPayment || !canPay}
                  className="gap-2 bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white shadow-sm"
                >
                  {submittingPayment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4" />
                  )}
                  Process Payment & Generate Receipt
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Official Printable Receipt Modal */}
      <Dialog open={!!issuedReceipt} onOpenChange={(open) => !open && setIssuedReceipt(null)}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <div ref={receiptRef} className="p-6 bg-white text-slate-900 space-y-4 print:p-0">
            {/* Header */}
            <div className="border-b pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  {issuedReceipt?.school.schoolName || 'School Prime'}
                </h3>
                <p className="text-xs text-slate-500">
                  {issuedReceipt?.school.address || 'Academic Complex'} • Phone: {issuedReceipt?.school.phone || '—'}
                </p>
              </div>
              <div className="text-right">
                <Badge className="bg-slate-900 text-white font-mono text-xs">
                  {issuedReceipt?.payment.receiptNumber}
                </Badge>
                <p className="text-[11px] text-slate-500 mt-1">
                  Date: {formatDate(issuedReceipt?.payment.paymentDate)}
                </p>
              </div>
            </div>

            {/* Student Details */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px]">Student Name:</span>
                <p className="font-bold text-slate-900">{issuedReceipt?.student.fullName}</p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px]">Admission / Roll:</span>
                <p className="font-bold text-slate-900">
                  {issuedReceipt?.student.admissionNumber} / #{issuedReceipt?.student.rollNumber || '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px]">Class & Section:</span>
                <p className="font-semibold text-slate-800">
                  {issuedReceipt?.student.className} ({issuedReceipt?.student.sectionName})
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px]">Session:</span>
                <p className="font-semibold text-slate-800">{issuedReceipt?.student.sessionName}</p>
              </div>
            </div>

            {/* Payment & Breakdown Snapshot */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 font-semibold">
                <span>Fee Description:</span>
                <span>{issuedReceipt?.fee.title}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                <span>Base Original Amount:</span>
                <span>{formatCurrency(issuedReceipt?.fee.originalAmount)}</span>
              </div>
              {issuedReceipt?.fee.discountAmount ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-600 font-medium">
                  <span>Applied Discount Snapshot:</span>
                  <span>-{formatCurrency(issuedReceipt.fee.discountAmount)}</span>
                </div>
              ) : null}
              {issuedReceipt?.fee.otherFeeAmount ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                  <span>Auxiliary Charge Snapshot:</span>
                  <span>+{formatCurrency(issuedReceipt.fee.otherFeeAmount)}</span>
                </div>
              ) : null}
              {issuedReceipt?.fee.fineAmount ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-purple-700 font-medium">
                  <span>Assessed Late Fine Snapshot:</span>
                  <span>+{formatCurrency(issuedReceipt.fee.fineAmount)}</span>
                </div>
              ) : null}

              <div className="flex justify-between py-1.5 border-b-2 border-slate-900 font-bold text-slate-900">
                <span>Net Payable:</span>
                <span>{formatCurrency(issuedReceipt?.fee.netPayable)}</span>
              </div>

              {/* Amount Paid Now */}
              <div className="flex justify-between py-2 text-sm font-black text-emerald-700 bg-emerald-50/70 px-2 rounded">
                <span>AMOUNT RECEIVED NOW:</span>
                <span>{formatCurrency(issuedReceipt?.payment.amount)}</span>
              </div>

              <div className="flex justify-between py-1 text-slate-700">
                <span>Remaining Balance After Payment:</span>
                <span className="font-bold">
                  {formatCurrency(issuedReceipt?.fee.remainingBalanceAfter)}
                </span>
              </div>
            </div>

            {/* Payment Meta */}
            <div className="pt-2 text-[11px] text-slate-500 flex justify-between border-t">
              <div>
                <span>Method: </span>
                <strong className="uppercase text-slate-800">
                  {issuedReceipt?.payment.paymentMethod}
                </strong>
                {issuedReceipt?.payment.reference && (
                  <span> (Ref: {issuedReceipt.payment.reference})</span>
                )}
              </div>
              <div>
                <span>Cashier: </span>
                <strong className="text-slate-800">{issuedReceipt?.payment.collectedByName}</strong>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-center text-slate-400 pt-2 border-t">
              This is a computer-generated fee receipt. Preserved permanently in the school ledger.
            </p>
          </div>

          <DialogFooter className="p-4 bg-muted/30 border-t flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setIssuedReceipt(null)}>
              Close
            </Button>
            <Button size="sm" onClick={handlePrintReceipt} className="gap-1.5 bg-primary text-white">
              <Printer className="h-3.5 w-3.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
