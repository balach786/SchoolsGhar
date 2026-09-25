import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Printer, Loader2, Pencil, Wallet, Receipt as ReceiptIcon, CircleDollarSign, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { FinanceNavHeader } from '@/components/finance/FinanceNavHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatCurrency, formatDate, toPaisa, formatStudentIdentity } from '@/lib/format';

const METHODS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  online: 'Online',
  other: 'Other',
};

interface PayRow {
  _id: string; studentId: string; studentFeeId: string; sessionId: string;
  amount: number; paymentMethod: string; paymentDate: string; receiptNumber: string;
  reference: string | null; notes: string | null; collectedBy: string;
  studentName?: string; admissionNumber?: string; feeTitle?: string; feeStatus?: string;
}
interface StudentLite { _id: string; fullName: string; admissionNumber: string; className?: string; fatherName?: string | null; guardianName?: string | null; gender?: string; }
interface FeeRow {
  _id: string; feeTitle: string; feeType: string; month: number | null;
  netPayable: number; amountPaid: number; remainingBalance: number; status: string; dueDate: string | null;
}
interface ReceiptPayload {
  school: { schoolName: string; schoolLogoUrl: string | null; address: string | null; phone: string | null; email: string | null; currency: string; signatureLabel: string; footerText: string | null };
  payment: PayRow & { collectedByName: string };
  student: { fullName: string; admissionNumber: string; rollNumber: string; className: string; sectionName: string; sessionName: string; fatherName?: string | null; guardianName?: string | null; gender?: string; };
  fee: { title: string; feeType: string; month: number | null; originalAmount: number; discountAmount: number; scholarshipAmount: number; fineAmount: number; netPayable: number; remainingBalanceAfter: number; status: string };
}

export function PaymentsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<PayRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [notesTarget, setNotesTarget] = useState<PayRow | null>(null);
  const [notesText, setNotesText] = useState('');
  const [referenceText, setReferenceText] = useState('');

  const canCreate = can('payments', 'create');
  const canEdit = can('payments', 'edit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (method !== 'all') params.set('method', method);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<ApiListResponse<PayRow>>(`/payments?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, method, from, to]);

  useEffect(() => { load(); }, [load]);

  async function openReceipt(id: string) {
    setReceiptLoading(true);
    setReceipt(null);
    try {
      const res = await api.get<ApiDataResponse<ReceiptPayload>>(`/payments/${id}/receipt`);
      setReceipt(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setReceiptLoading(false);
    }
  }

  const columns: Column<PayRow>[] = [
    {
      key: 'receipt', header: 'Receipt',
      cell: (row) => (
        <div className="leading-tight">
          <button className="font-mono text-sm font-medium text-primary hover:underline" onClick={() => openReceipt(row._id)}>
            {row.receiptNumber}
          </button>
          <p className="text-xs text-muted-foreground">{formatDate(row.paymentDate)}</p>
        </div>
      ),
    },
    {
      key: 'student', header: 'Student',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.studentName ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.admissionNumber ?? '—'}</p>
        </div>
      ),
    },
    { key: 'fee', header: 'Fee', cell: (row) => <span className="text-sm">{row.feeTitle ?? '—'}</span> },
    { key: 'amount', header: 'Amount', cell: (row) => <span className="font-medium">{formatCurrency(row.amount)}</span> },
    {
      key: 'method', header: 'Method',
      cell: (row) => <Badge variant="outline">{METHODS[row.paymentMethod] ?? row.paymentMethod}</Badge>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => { setNotesTarget(row); setNotesText(row.notes ?? ''); setReferenceText(row.reference ?? ''); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openReceipt(row._id)}>
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  async function saveNotes() {
    if (!notesTarget) return;
    setBusy(true);
    try {
      await api.patch(`/payments/${notesTarget._id}`, { notes: notesText || null, reference: referenceText || null });
      toast.success('Payment details updated');
      setNotesTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const totalAmount = data.reduce((sum, r) => sum + (r.amount || 0), 0);
  const cashAmount = data.filter((r) => r.paymentMethod === 'cash').reduce((sum, r) => sum + (r.amount || 0), 0);
  const bankOnlineAmount = data.filter((r) => r.paymentMethod === 'bank_transfer' || r.paymentMethod === 'online' || r.paymentMethod === 'card').reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Payments & Fee Collections"
        description="Issue professional receipts, record tuition payments, and audit transaction ledgers."
        crumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
        actions={canCreate && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all"
          >
            <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" /> Record Payment
          </Button>
        )}
      />

      {/* Finance Navigation Hub */}
      <FinanceNavHeader />

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Total In View" value={formatCurrency(totalAmount)} icon={Wallet} tone="primary" loading={loading} />
        <StatCard title="Transactions" value={pagination.total || data.length} icon={ReceiptIcon} tone="success" loading={loading} />
        <StatCard title="Cash Receipts" value={formatCurrency(cashAmount)} icon={CircleDollarSign} tone="gold" loading={loading} />
        <StatCard title="Bank / Digital" value={formatCurrency(bankOnlineAmount)} icon={CheckCircle2} tone="navy" loading={loading} />
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] p-3 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-xs rounded-xl bg-background/50 border-border/60"
            placeholder="Search student, admission or receipt…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          />
        </div>
        <Select value={method} onValueChange={(v) => { setMethod(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-40 h-9 text-xs rounded-xl"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {Object.entries(METHODS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40 h-9 text-xs rounded-xl" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" className="w-40 h-9 text-xs rounded-xl" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
        emptyTitle="No payments yet"
        emptyDescription={canCreate ? 'Record the first payment.' : undefined}
      />
      </div>

      {createOpen && <CreatePaymentDialog open={createOpen} onOpenChange={setCreateOpen} onDone={() => { setCreateOpen(false); load(); }} />}

      {/* Receipt dialog */}
      <Dialog open={Boolean(receipt)} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="sr-only">Receipt</DialogTitle>
            <DialogDescription className="sr-only">Printable payment receipt</DialogDescription>
          </DialogHeader>
          {receiptLoading && <div className="h-72 animate-pulse rounded-md bg-muted" />}
          {!receiptLoading && receipt && (
            <div>
              <ReceiptView receipt={receipt} />
              <div className="mt-4 flex justify-end gap-2 print:hidden">
                <Button variant="outline" onClick={() => setReceipt(null)}>Close</Button>
                <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Notes dialog */}
      <Dialog open={Boolean(notesTarget)} onOpenChange={(o) => !o && setNotesTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>Only notes and the external reference can be edited — the amount is immutable.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-ref">Reference</Label>
              <Input id="pay-ref" value={referenceText} onChange={(e) => setReferenceText(e.target.value)} maxLength={120} placeholder="e.g. bank transaction id" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea id="pay-notes" value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={saveNotes} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreatePaymentDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [feeId, setFeeId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  async function findStudent() {
    if (!search.trim()) return toast.error('Enter a student name or admission number');
    setSearching(true);
    try {
      const res = await api.get<ApiListResponse<StudentLite>>(`/students?search=${encodeURIComponent(search.trim())}&limit=5`);
      if (res.data.data.length === 0) {
        toast.error('No student found');
        return;
      }
      setStudent(res.data.data[0]);
      const feeRes = await api.get<ApiListResponse<FeeRow>>(`/student-fees?studentId=${res.data.data[0]._id}&status=unpaid&limit=50`);
      const partialRes = await api.get<ApiListResponse<FeeRow>>(`/student-fees?studentId=${res.data.data[0]._id}&status=partial&limit=50`);
      setFees([...feeRes.data.data, ...partialRes.data.data]);
      if (feeRes.data.data.length === 0 && partialRes.data.data.length === 0) toast.info('This student has no pending fees');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  const selectedFee = fees.find((f) => f._id === feeId) ?? null;

  async function submit() {
    if (!student) return toast.error('Select a student first');
    if (!feeId) return toast.error('Select the fee to pay against');
    const amount = toPaisa(amountText);
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    if (selectedFee && amount > selectedFee.remainingBalance) {
      return toast.error(`Amount exceeds the remaining balance (${formatCurrency(selectedFee.remainingBalance)})`);
    }
    setBusy(true);
    try {
      const res = await api.post<ApiDataResponse<{ payment: PayRow }>>('/payments', {
        studentFeeId: feeId,
        amount,
        paymentMethod: payMethod,
        paymentDate: payDate,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success(`Payment recorded — receipt ${res.data.data.payment.receiptNumber}`);
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Balances, payment status and receipt numbers are updated automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!student ? (
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="stu-search">Student</Label>
                <Input id="stu-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or admission number" onKeyDown={(e) => e.key === 'Enter' && findStudent()} />
              </div>
              <Button variant="outline" onClick={findStudent} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="font-medium">{formatStudentIdentity(student)}</p>
              <p className="text-xs text-muted-foreground">{student.admissionNumber}</p>
              <button className="mt-1 text-xs text-primary hover:underline" onClick={() => { setStudent(null); setFees([]); setFeeId(''); setAmountText(''); }}>
                Change student
              </button>
            </div>
          )}

          {student && (
            <>
              <div className="grid gap-1.5">
                <Label>Fee to pay</Label>
                <Select value={feeId} onValueChange={(v) => { setFeeId(v); const f = fees.find((x) => x._id === v); if (f) setAmountText((f.remainingBalance / 100).toFixed(2)); }}>
                  <SelectTrigger><SelectValue placeholder="Select a pending fee" /></SelectTrigger>
                  <SelectContent>
                    {fees.map((f) => (
                      <SelectItem key={f._id} value={f._id}>
                        {f.feeTitle} — due {formatCurrency(f.remainingBalance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-amount">Amount (PKR)</Label>
                  <Input id="pay-amount" type="number" min={0.01} step={0.01} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-date">Date</Label>
                  <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METHODS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-ref">Reference</Label>
                  <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-notes">Notes</Label>
                <Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !student}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptView({ receipt }: { receipt: ReceiptPayload }) {
  const school = receipt.school;
  return (
    <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-6">
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">{school.schoolName}</h2>
          {school.address && <p className="text-xs text-muted-foreground">{school.address}</p>}
          {school.phone && <p className="text-xs text-muted-foreground">{school.phone}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-semibold">{receipt.payment.receiptNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDate(receipt.payment.paymentDate)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Received from</p>
            <p className="font-medium">{formatStudentIdentity(receipt.student)}</p>
            <p className="text-xs text-muted-foreground">
              {receipt.student.admissionNumber} · {receipt.student.className} {receipt.student.sectionName && `· ${receipt.student.sectionName}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Collected by</p>
            <p className="font-medium">{receipt.payment.collectedByName}</p>
            <p className="text-xs text-muted-foreground">{METHODS[receipt.payment.paymentMethod] ?? receipt.payment.paymentMethod}</p>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex justify-between">
            <span>{receipt.fee.title}</span>
            <span className="font-semibold">{formatCurrency(receipt.payment.amount, school.currency)}</span>
          </div>
          {receipt.fee.netPayable > 0 && (
            <>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Total payable</span>
                <span>{formatCurrency(receipt.fee.netPayable, school.currency)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Balance after this payment</span>
                <span className={receipt.fee.remainingBalanceAfter === 0 ? 'font-medium text-emerald-600' : ''}>
                  {formatCurrency(receipt.fee.remainingBalanceAfter, school.currency)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-end justify-between pt-4">
          <div>
            <p className="text-xs text-muted-foreground">{school.footerText ?? ''}</p>
          </div>
          <div className="text-center">
            <div className="h-10" />
            <div className="w-44 border-t border-dashed pt-1 text-xs text-muted-foreground">{school.signatureLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
