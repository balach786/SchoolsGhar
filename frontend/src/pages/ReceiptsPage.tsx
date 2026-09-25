import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Receipt as ReceiptIcon,
  Search,
  Printer,
  Download,
  Filter,
  Eye,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, downloadCsv } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';

interface PayRow {
  _id: string;
  studentId: string;
  studentFeeId: string;
  sessionId: string;
  amount: number;
  refundableAmount?: number;
  paymentMethod: string;
  paymentDate: string;
  receiptNumber: string;
  reference: string | null;
  notes: string | null;
  collectedBy: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  feeTitle?: string;
  isReversed?: boolean;
  reversalReceiptNumber?: string;
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
    isReversed?: boolean;
    reversalReceiptNumber?: string;
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
    scholarshipAmount?: number;
    fineAmount: number;
    otherFeeAmount?: number;
    netPayable: number;
    remainingBalanceAfter: number;
    status: string;
  };
}

export function ReceiptsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<PayRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Receipt Modal
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // Cancellation / Reversal Modal
  const [reversalTarget, setReversalTarget] = useState<PayRow | null>(null);
  const [reversalReason, setReversalReason] = useState('Administrative correction requested by guardian');
  const [reversalNotes, setReversalNotes] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);

  const canReverse = can('payments', 'manage') || can('payments', 'delete');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      if (search.trim()) params.set('search', search.trim());
      if (method !== 'all') params.set('method', method);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await api.get<ApiListResponse<PayRow>>(`/payments?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, method, from, to]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function openReceiptModal(paymentId: string) {
    setReceiptLoading(true);
    setReceipt(null);
    try {
      const res = await api.get<ApiDataResponse<ReceiptPayload>>(`/payments/${paymentId}/receipt`);
      setReceipt(res.data.data);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setReceiptLoading(false);
    }
  }

  async function handleExecuteReversal() {
    if (!reversalTarget) return;
    setReversalBusy(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { reversal: { reversalReceiptNumber: string } };
      }>(`/payments/${reversalTarget._id}/reversal`, {
        sourceType: 'regular_fee',
        paymentId: reversalTarget._id,
        amount: reversalTarget.amount,
        reversalType: 'full_reversal',
        reason: reversalReason,
        notes: reversalNotes.trim() || undefined,
      });

      const revReceipt = res.data.data.reversal.reversalReceiptNumber;
      toast.success(`Payment cancelled successfully! Reversal receipt generated: ${revReceipt}`, {
        duration: 5000,
      });

      setReversalTarget(null);
      setReversalNotes('');
      loadPayments();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setReversalBusy(false);
    }
  }

  function exportReceiptsCsv() {
    if (!data.length) {
      toast.error('No receipts to export');
      return;
    }
    const headers = [
      'Receipt Number',
      'Student Name',
      'Admission Number',
      'Fee Title',
      'Payment Method',
      'Reference',
      'Date',
      'Amount (PKR)',
      'Status',
    ];
    const rows = data.map((r) => [
      r.receiptNumber,
      r.studentName || 'Student',
      r.admissionNumber || '—',
      r.feeTitle || 'Fee',
      r.paymentMethod.toUpperCase(),
      r.reference || '—',
      formatDate(r.paymentDate),
      (r.amount / 100).toFixed(2),
      r.refundableAmount === 0 ? 'CANCELLED / REVERSED' : 'ACTIVE',
    ]);
    downloadCsv('Fee_Payment_Receipts', [headers, ...rows]);
    toast.success('Receipts exported to CSV');
  }

  const columns: Column<PayRow>[] = [
    {
      key: 'receipt',
      header: 'Receipt #',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-mono font-bold text-foreground">{row.receiptNumber}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(row.paymentDate)}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-semibold text-foreground">{row.studentName || 'Student'}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.admissionNumber} • {row.className || 'Class'}
          </p>
        </div>
      ),
    },
    {
      key: 'feeTitle',
      header: 'Fee Item',
      cell: (row) => <span className="text-xs text-foreground font-medium">{row.feeTitle || 'Fee'}</span>,
    },
    {
      key: 'method',
      header: 'Channel & Reference',
      cell: (row) => (
        <div className="leading-tight">
          <Badge variant="outline" className="capitalize text-[10px]">
            {row.paymentMethod.replace('_', ' ')}
          </Badge>
          {row.reference && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Ref: {row.reference}</p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Paid',
      cell: (row) => (
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      cell: (row) => {
        const isReversed = row.refundableAmount === 0;
        return (
          <Badge
            variant="outline"
            className={
              isReversed
                ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
            }
          >
            {isReversed ? 'Reversed / Cancelled' : 'Active Valid'}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (row) => {
        const isReversed = row.refundableAmount === 0;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openReceiptModal(row._id)}
              className="h-8 gap-1 text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              View / Print
            </Button>

            {!isReversed && canReverse && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReversalTarget(row)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                title="Cancel Receipt via Payment Reversal"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Receipts & Reversals"
        description="Official payment receipts ledger, print customer copies, and execute auditable cancellations via PaymentReversal"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportReceiptsCsv}
            disabled={!data.length}
            className="h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Receipts CSV
          </Button>
        }
      />

      <FeesNavHeader activeTab="receipts" />

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border border-border/70 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search receipt # or student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-52 bg-background"
          />
        </div>

        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-40 h-8 text-xs bg-background">
            <SelectValue placeholder="All Methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="easypaisa">EasyPaisa</SelectItem>
            <SelectItem value="jazzcash">JazzCash</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">From:</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs w-36 bg-background"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">To:</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs w-36 bg-background"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <DataTable<PayRow>
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
        emptyTitle="No payment receipts found matching your query."
      />

      {/* Receipt Modal */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          {receipt && (
            <div className="p-6 bg-white text-slate-900 space-y-4 print:p-0">
              <div className="border-b pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    {receipt.school.schoolName || 'School Prime'}
                  </h3>
                  <p className="text-xs text-slate-500">{receipt.school.address || 'Academic Complex'}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-slate-900 text-white font-mono text-xs">
                    {receipt.payment.receiptNumber}
                  </Badge>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Date: {formatDate(receipt.payment.paymentDate)}
                  </p>
                </div>
              </div>

              {receipt.payment.isReversed && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
                  <span>THIS RECEIPT HAS BEEN CANCELLED / REVERSED</span>
                  <span className="font-mono text-[11px]">{receipt.payment.reversalReceiptNumber}</span>
                </div>
              )}

              {/* Student Details */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-[10px]">Student Name:</span>
                  <p className="font-bold text-slate-900">{receipt.student.fullName}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Admission / Roll:</span>
                  <p className="font-bold text-slate-900">
                    {receipt.student.admissionNumber} / #{receipt.student.rollNumber || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Class & Section:</span>
                  <p className="font-semibold text-slate-800">
                    {receipt.student.className} ({receipt.student.sectionName})
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Session:</span>
                  <p className="font-semibold text-slate-800">{receipt.student.sessionName}</p>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 font-semibold">
                  <span>Fee Item:</span>
                  <span>{receipt.fee.title}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>Base Fee:</span>
                  <span>{formatCurrency(receipt.fee.originalAmount)}</span>
                </div>
                {receipt.fee.discountAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-600 font-medium">
                    <span>Discount Snapshot:</span>
                    <span>-{formatCurrency(receipt.fee.discountAmount)}</span>
                  </div>
                )}
                {receipt.fee.otherFeeAmount && receipt.fee.otherFeeAmount > 0 ? (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                    <span>Auxiliary Fee:</span>
                    <span>+{formatCurrency(receipt.fee.otherFeeAmount)}</span>
                  </div>
                ) : null}
                {receipt.fee.fineAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-purple-700 font-medium">
                    <span>Late Fine:</span>
                    <span>+{formatCurrency(receipt.fee.fineAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b-2 border-slate-900 font-bold text-slate-900">
                  <span>Net Payable:</span>
                  <span>{formatCurrency(receipt.fee.netPayable)}</span>
                </div>
                <div className="flex justify-between py-2 text-sm font-black text-emerald-700 bg-emerald-50/70 px-2 rounded">
                  <span>AMOUNT RECEIVED:</span>
                  <span>{formatCurrency(receipt.payment.amount)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-700">
                  <span>Remaining Balance:</span>
                  <span className="font-bold">{formatCurrency(receipt.fee.remainingBalanceAfter)}</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 flex justify-between border-t">
                <div>
                  <span>Method: </span>
                  <strong className="uppercase text-slate-800">
                    {receipt.payment.paymentMethod}
                  </strong>
                  {receipt.payment.reference && (
                    <span> (Ref: {receipt.payment.reference})</span>
                  )}
                </div>
                <div>
                  <span>Cashier: </span>
                  <strong className="text-slate-800">{receipt.payment.collectedByName}</strong>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="p-4 bg-muted/30 border-t flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setReceipt(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 bg-primary text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation / Reversal Confirmation Dialog */}
      <Dialog open={!!reversalTarget} onOpenChange={(open) => !open && setReversalTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-rose-600">
              <RotateCcw className="h-4 w-4" />
              Cancel Payment Receipt
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Under financial compliance rules, transactions are never hard-deleted. A PaymentReversal record will be created and the student's invoice balance will be atomically restored.
            </DialogDescription>
          </DialogHeader>

          {reversalTarget && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-xl bg-muted/60 border border-border/70 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt Number:</span>
                  <span className="font-mono font-bold text-foreground">{reversalTarget.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student:</span>
                  <span className="font-semibold text-foreground">{reversalTarget.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount to Reverse:</span>
                  <span className="font-bold text-rose-600">{formatCurrency(reversalTarget.amount)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cancellation Reason</Label>
                <Select value={reversalReason} onValueChange={setReversalReason}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Administrative correction requested by guardian">
                      Administrative correction requested by guardian
                    </SelectItem>
                    <SelectItem value="Payment deposited via wrong branch / channel">
                      Payment deposited via wrong branch / channel
                    </SelectItem>
                    <SelectItem value="Duplicate payment entry by cashier">
                      Duplicate payment entry by cashier
                    </SelectItem>
                    <SelectItem value="Fee concession awarded retroactively">
                      Fee concession awarded retroactively
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Audit Notes / Memo</Label>
                <Textarea
                  placeholder="Provide detailed notes for the administrative audit log..."
                  value={reversalNotes}
                  onChange={(e) => setReversalNotes(e.target.value)}
                  className="h-20 text-xs resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReversalTarget(null)}
              disabled={reversalBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExecuteReversal}
              disabled={reversalBusy}
              className="gap-1.5"
            >
              {reversalBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Confirm Reversal & Restore Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
