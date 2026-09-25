import { useEffect, useState } from 'react';
import {
  Receipt,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Loader2,
  FileText,
  AlertCircle,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, getAssetUrl } from '@/lib/api';

interface PaymentRequest {
  _id: string;
  tenantId: string;
  schoolName: string;
  contactEmail: string;
  planName: string;
  planDurationDays: number;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
  proofUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  adminReviewNotes?: string;
  submittedByName: string;
  reviewedAt?: string;
  createdAt: string;
}

export function PlatformPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Receipt Preview Modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewPayment, setPreviewPayment] = useState<PaymentRequest | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  // Approve Modal
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reject Modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '30');
      if (statusFilter) params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await api.get<{
        success: boolean;
        data: PaymentRequest[];
      }>(`/platform/payments?${params.toString()}`);

      if (res.data?.success) {
        setPayments(res.data.data);
      }
    } catch (err) {
      toast.error('Failed to load payments', { description: apiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, statusFilter]);

  const handleApprove = async () => {
    if (!selectedPayment) return;

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/payments/${selectedPayment._id}/approve`, {
        note: approvalNote.trim() || 'Verified by Platform Administrator',
      });

      if (res.data?.success) {
        toast.success(`Payment Approved for ${selectedPayment.schoolName}`, {
          description: `Subscription extended by ${selectedPayment.planDurationDays} days. Tenant is now active.`,
        });
        setApproveOpen(false);
        fetchPayments();
      }
    } catch (err) {
      toast.error('Approval failed', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    if (!rejectionReason.trim()) {
      toast.error('Reason required', { description: 'Please explain why the payment was rejected' });
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/payments/${selectedPayment._id}/reject`, {
        reason: rejectionReason.trim(),
      });

      if (res.data?.success) {
        toast.success(`Payment Rejected for ${selectedPayment.schoolName}`);
        setRejectOpen(false);
        fetchPayments();
      }
    } catch (err) {
      toast.error('Rejection failed', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const openReceipt = (p: PaymentRequest) => {
    setPreviewPayment(p);
    setPreviewFailed(false);
    setPreviewUrl(getAssetUrl(p.proofUrl));
    setPreviewTitle(`Receipt — ${p.schoolName} (Ref: ${p.transactionReference})`);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Payment Proof Verifications</h1>
          <p className="text-muted-foreground text-xs mt-1">
            Review offline bank deposit slips, ATM receipts, and mobile wallet transfers uploaded by school administrators.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background text-foreground text-xs px-3 focus:outline-none focus:border-teal-500"
            >
              <option value="pending">Pending Review Only</option>
              <option value="approved">Approved Payments</option>
              <option value="rejected">Rejected Payments</option>
              <option value="">All Verification History</option>
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search reference, school..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPayments()}
              className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground text-xs h-9"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : payments.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No payment proofs found for the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border bg-background text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">School Name</th>
                    <th className="px-4 py-3">Plan / Tier</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Reference / Txn ID</th>
                    <th className="px-4 py-3">Screenshot Slip</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {payments.map((p) => (
                    <tr key={p._id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{p.schoolName}</div>
                        <div className="text-[11px] text-muted-foreground">{p.contactEmail}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-foreground">{p.planName}</span>
                        <span className="text-[11px] text-muted-foreground block">{p.planDurationDays} days</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-success">
                        {p.currency} {p.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[140px] truncate">
                        {p.paymentMethod}
                      </td>
                      <td className="px-4 py-3 font-mono text-primary select-all font-semibold">
                        {p.transactionReference}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openReceipt(p)}
                          className="h-7 px-2 text-primary hover:text-primary text-xs hover:bg-primary/10"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> View Receipt
                        </Button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.status === 'pending' && (
                          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-[10px]">
                            Pending Review
                          </Badge>
                        )}
                        {p.status === 'approved' && (
                          <Badge className="bg-emerald-500/10 text-success border-emerald-500/20 text-[10px]">
                            Approved
                          </Badge>
                        )}
                        {p.status === 'rejected' && (
                          <Badge className="bg-rose-500/10 text-destructive border-rose-500/20 text-[10px]">
                            Rejected
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                        {p.status === 'pending' ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedPayment(p);
                                setApprovalNote('');
                                setApproveOpen(true);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] h-7 px-2.5 font-semibold"
                            >
                              <Check className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPayment(p);
                                setRejectionReason('');
                                setRejectOpen(true);
                              }}
                              className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-destructive hover:bg-rose-950/30 text-[11px] h-7 px-2.5 font-semibold"
                            >
                              <X className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {p.adminReviewNotes || 'Completed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Review payment proof</DialogTitle><DialogDescription>Check the school details against the submitted receipt before approving.</DialogDescription></DialogHeader><div className="grid gap-6 md:grid-cols-[.7fr_1.3fr]"><div className="space-y-5">{previewPayment && <><div><Badge variant="outline" className="capitalize">{previewPayment.status}</Badge><h3 className="mt-4 text-xl font-semibold">{previewPayment.schoolName}</h3><p className="mt-1 break-all text-sm text-muted-foreground">{previewPayment.contactEmail}</p></div><dl className="space-y-4 text-sm">{[['Plan',previewPayment.planName],['Amount',previewPayment.currency+' '+previewPayment.amount.toLocaleString()],['Payment method',previewPayment.paymentMethod],['Reference',previewPayment.transactionReference],['Payment date',new Date(previewPayment.paymentDate).toLocaleDateString()],['Submitted by',previewPayment.submittedByName]].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value || '—'}</dd></div>)}</dl>{previewPayment.status==='pending' && <div className="flex flex-wrap gap-2"><Button onClick={()=>{setSelectedPayment(previewPayment);setApprovalNote('');setPreviewOpen(false);setApproveOpen(true);}}><Check/>Approve</Button><Button variant="outline" className="text-destructive" onClick={()=>{setSelectedPayment(previewPayment);setRejectionReason('');setPreviewOpen(false);setRejectOpen(true);}}><X/>Reject</Button></div>}</>}<a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-primary">Open original receipt <ExternalLink size={14}/></a></div><div className="grid min-h-[300px] place-items-center overflow-auto rounded-2xl border bg-muted/50 p-3">{previewFailed?<p role="alert" className="p-8 text-center text-sm text-muted-foreground">This receipt couldn’t be previewed. Use “Open original receipt” to view the file.</p>:previewUrl.split('?')[0].toLowerCase().endsWith('.pdf')?<iframe src={previewUrl} title="Payment proof PDF" className="h-[500px] w-full rounded-xl"/>:<img src={previewUrl} alt={previewTitle} className="max-h-[550px] w-full rounded-xl object-contain" onError={()=>setPreviewFailed(true)}/>}</div></div></DialogContent></Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Approve Payment & Extend Subscription
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Confirming this payment will immediately mark the school account as <strong>active</strong> and extend their subscription by{' '}
              <strong>{selectedPayment?.planDurationDays} days</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-lg bg-background border border-border text-xs space-y-1 my-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">School:</span>
              <strong className="text-foreground">{selectedPayment?.schoolName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan:</span>
              <strong className="text-foreground">{selectedPayment?.planName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verified Amount:</span>
              <strong className="text-success">
                {selectedPayment?.currency} {selectedPayment?.amount.toLocaleString()}
              </strong>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Approval Note (Optional)</Label>
            <Input
              type="text"
              placeholder="e.g. Verified deposit in bank ledger statement"
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              className="bg-background border-border text-foreground text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveOpen(false)}
              className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              Reject Payment Proof
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The school administrator will see this reason in their billing dashboard so they can correct the error.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReject} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Rejection Reason *</Label>
              <Input
                type="text"
                required
                placeholder="e.g. Transaction ID not found in bank statement, amount mismatch"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="bg-background border-border text-foreground text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectOpen(false)}
                className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
