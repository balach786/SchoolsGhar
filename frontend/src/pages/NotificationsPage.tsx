import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Inbox, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, type ApiListResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface NotificationRow {
  _id: string;
  type: string;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

interface NotificationListResponse extends ApiListResponse<NotificationRow> {
  unreadCount?: number;
}

const TYPE_BADGES: Record<string, { label: string; variant: 'default' | 'success' | 'destructive' | 'warning' | 'muted' }> = {
  NEW_ASSIGNMENT: { label: 'Assignment', variant: 'default' },
  NEW_NOTICE: { label: 'Notice', variant: 'default' },
  LEAVE_APPROVED: { label: 'Leave', variant: 'success' },
  LEAVE_REJECTED: { label: 'Leave', variant: 'destructive' },
  FEE_DUE: { label: 'Fees', variant: 'warning' },
  FEE_PAID: { label: 'Fees', variant: 'success' },
  PAYMENT_RECEIVED: { label: 'Payment', variant: 'success' },
  BALANCE_REMAINING: { label: 'Fees', variant: 'warning' },
};

export function NotificationsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<NotificationRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      const res = await api.get<NotificationListResponse>(`/notifications?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      setUnreadCount(res.data.unreadCount ?? 0);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (row: NotificationRow) => {
    if (row.isRead) return;
    setBusyId(row._id);
    try {
      await api.patch(`/notifications/${row._id}/read`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      toast.success('All notifications marked as read');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/notifications/${deleteTarget._id}`);
      toast.success('Notification removed');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: Column<NotificationRow>[] = [
    {
      key: 'status',
      header: '',
      cell: (row) =>
        row.isRead ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </span>
        ),
    },
    {
      key: 'content',
      header: 'Notification',
      cell: (row) => (
        <div className="min-w-0 leading-tight">
          <p className={`text-sm ${row.isRead ? 'text-muted-foreground' : 'font-medium'}`}>{row.title}</p>
          <p className={`mt-0.5 line-clamp-1 max-w-[420px] text-xs ${row.isRead ? 'text-muted-foreground' : ''}`}>{row.message}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => {
        const badge = TYPE_BADGES[row.type] ?? { label: row.type.replace(/_/g, ' '), variant: 'muted' as const };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'when',
      header: 'Received',
      cell: (row) => (
        <div className="text-xs leading-tight text-muted-foreground">
          <p>{formatDateTime(row.createdAt)}</p>
          {row.readAt && <p>Read {formatDateTime(row.readAt)}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {!row.isRead && (
            <Button size="sm" variant="ghost" onClick={() => markRead(row)} disabled={busyId === row._id}>
              Mark read
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(row)}>
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="System events for you — assignments, notices, leave decisions and fee updates."
        crumbs={[{ label: 'Communication' }, { label: 'Notifications' }]}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={markAllRead}>
              <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read ({unreadCount})
            </Button>
          ) : undefined
        }
      />

      {user && (
        <p className="mb-3 text-sm text-muted-foreground">
          <Inbox className="mr-1.5 inline h-4 w-4" />
          {unreadCount} unread notification{unreadCount === 1 ? '' : 's'} for {user.name}.
        </p>
      )}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
        emptyTitle="No notifications"
        emptyDescription="Notifications appear here when assignments, notices, leave decisions or fee events concern you."
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete notification?"
        description={`"${deleteTarget?.title}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
