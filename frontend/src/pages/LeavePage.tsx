import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Check, Loader2, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, type ApiListResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface LeaveRow {
  _id: string;
  requesterType: 'student' | 'teacher';
  requesterId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  requesterName?: string;
}

const STATUS_BADGES: Record<LeaveRow['status'], { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export function LeavePage() {
  const { user, can } = useAuth();
  const canApprove = can('leaveRequests', 'approve');
  const canCreate = can('leaveRequests', 'create');

  const [data, setData] = useState<LeaveRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [requesterType, setRequesterType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fromDate: '', toDate: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<LeaveRow | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (canApprove && status !== 'all') params.set('status', status);
      if (canApprove && requesterType !== 'all') params.set('requesterType', requesterType);
      if (canApprove && from) params.set('from', from);
      if (canApprove && to) params.set('to', to);
      const res = await api.get<ApiListResponse<LeaveRow>>(`/leave-requests?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, canApprove, status, requesterType, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ fromDate: '', toDate: '', reason: '' });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.fromDate || !form.toDate) {
      toast.error('From and to dates are required');
      return;
    }
    if (form.toDate < form.fromDate) {
      toast.error('To date cannot be before from date');
      return;
    }
    if (form.reason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    try {
      await api.post('/leave-requests', { fromDate: form.fromDate, toDate: form.toDate, reason: form.reason.trim() });
      toast.success('Leave request submitted');
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit leave request'));
    } finally {
      setBusy(false);
    }
  };

  const openReview = (row: LeaveRow, dec: 'approve' | 'reject') => {
    setReviewTarget(row);
    setDecision(dec);
    setReviewNote('');
  };

  const saveReview = async () => {
    if (!reviewTarget) return;
    setBusy(true);
    try {
      await api.patch(`/leave-requests/${reviewTarget._id}/review`, {
        decision,
        reviewNote: reviewNote.trim() || undefined,
      });
      toast.success(decision === 'approve' ? 'Leave approved — requester notified' : 'Leave rejected — requester notified');
      setReviewTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not review leave request'));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<LeaveRow>[] = [
    {
      key: 'requester',
      header: 'Requester',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.requesterName ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.requesterType === 'student' ? 'Student' : 'Teacher'}</p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      cell: (row) => (
        <span className="text-sm">
          {formatDate(row.fromDate)} → {formatDate(row.toDate)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (row) => <span className="line-clamp-2 max-w-[300px] text-xs text-muted-foreground">{row.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        const badge = STATUS_BADGES[row.status];
        return (
          <div className="leading-tight">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {row.reviewNote && <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{row.reviewNote}</p>}
          </div>
        );
      },
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canApprove && row.status === 'pending' && (
            <>
              <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => openReview(row, 'approve')}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => openReview(row, 'reject')}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        description={canApprove ? 'Review leave requests from students and teachers.' : 'Submit leave requests and track their status.'}
        crumbs={[{ label: 'Communication' }, { label: 'Leave Requests' }]}
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Request leave
            </Button>
          ) : undefined
        }
      />

      {canApprove && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="w-36">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Label className="text-xs">Requester</Label>
              <Select value={requesterType} onValueChange={setRequesterType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Students & teachers</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="w-36">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {(from || to || status !== 'all' || requesterType !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setStatus('all');
                  setRequesterType('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
        emptyTitle="No leave requests"
        emptyDescription={canCreate ? 'Request leave to inform the school of your absence.' : 'No leave requests found.'}
      />

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
            <DialogDescription>Leave requests are reviewed by the school administration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="l-from">From</Label>
                <Input id="l-from" type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="l-to">To</Label>
                <Input id="l-to" type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="l-reason">Reason</Label>
              <Textarea id="l-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="Why do you need leave? (min 5 characters)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={Boolean(reviewTarget)} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decision === 'approve' ? 'Approve leave?' : 'Reject leave?'}</DialogTitle>
            <DialogDescription>
              {reviewTarget?.requesterName} — {reviewTarget && formatDate(reviewTarget.fromDate)} → {reviewTarget && formatDate(reviewTarget.toDate)}
              <br />
              <span className="text-foreground">{reviewTarget?.reason}</span>
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rv-note">Note (optional)</Label>
            <Textarea id="rv-note" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} placeholder="Shown to the requester with the decision" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={decision === 'approve' ? 'default' : 'destructive'} onClick={saveReview} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
