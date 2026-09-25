import { useCallback, useEffect, useState } from 'react';
import { Search, ScrollText, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface AuditRow {
  _id: string;
  userId: string | null;
  userName: string;
  module: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

const actionTone: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  LOGIN_SUCCESS: 'success',
  USER_CREATED: 'success',
  USER_UPDATED: 'secondary',
  USER_ACTIVATED: 'success',
  USER_DEACTIVATED: 'destructive',
  USER_ROLE_CHANGED: 'warning',
  USER_PASSWORD_RESET: 'warning',
  ROLE_CREATED: 'secondary',
  ROLE_UPDATED: 'secondary',
  ROLE_PERMISSION_UPDATED: 'warning',
  PASSWORD_CHANGED: 'warning',
};

export function AuditLogsPage() {
  const [data, setData] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (moduleFilter !== 'all') params.set('module', moduleFilter);
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<ApiListResponse<AuditRow>>(`/audit-logs?${params.toString()}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, moduleFilter, actionFilter, from, to]);

  const loadFilters = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: { modules: string[]; actions: string[] } }>('/audit-logs/filters');
      setModules(res.data.data.modules);
      setActions(res.data.data.actions);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const columns: Column<AuditRow>[] = [
    {
      key: 'time',
      header: 'Date / Time',
      cell: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      cell: (row) => (
        <div className="leading-tight">
          <p className="text-sm">{row.userName}</p>
          {row.userId && <p className="text-[11px] text-muted-foreground">…{row.userId.slice(-6)}</p>}
        </div>
      ),
    },
    { key: 'module', header: 'Module', cell: (row) => <Badge variant="outline">{row.module}</Badge> },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => <Badge variant={actionTone[row.action] ?? 'default'}>{row.action}</Badge>,
    },
    {
      key: 'target',
      header: 'Target',
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.targetId ? `…${row.targetId.slice(-8)}` : '—'}</span>
      ),
    },
  ];

  const hasFilters = search || moduleFilter !== 'all' || actionFilter !== 'all' || from || to;

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Compact trail of important system actions. No passwords, tokens, or request bodies are stored."
        crumbs={[{ label: 'Audit Logs' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="filter-toolbar mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search user, target, module…"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPagination((p) => ({ ...p, page: 1 }));
                setSearch(searchInput.trim());
              }
            }}
          />
        </div>
        <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full lg:w-52">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="w-full lg:w-40" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="w-full lg:w-40" />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setModuleFilter('all');
              setActionFilter('all');
              setFrom('');
              setTo('');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onLimitChange={(limit) => setPagination((p) => ({ ...p, limit, page: 1 }))}
        emptyTitle="No audit records"
        emptyDescription={
          <span className="flex items-center gap-1.5">
            <ScrollText className="h-4 w-4" /> No matching activity in this period.
          </span>
        }
        compact
      />
    </div>
  );
}
