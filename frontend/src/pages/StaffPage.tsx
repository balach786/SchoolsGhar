import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MoreHorizontal, Pencil, Archive, Eye, Download, Briefcase, Sparkles, Award, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDate, formatCurrency, initials } from '@/lib/format';

interface StaffRow {
  _id: string; employeeId: string; fullName: string; fatherName: string; caste: string; profilePhotoUrl: string | null;
  email: string | null; phone: string | null; designation: string | null;
  joiningDate: string; salary?: number; isActive: boolean; isArchived: boolean;
}

export function StaffPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<StaffRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [summary, setSummary] = useState<{ total: number; active: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canEdit = can('users', 'edit');
  const canCreate = can('users', 'create');
  const canSeeSalary = can('salaries', 'view');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit), staffType: 'non_teaching' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await api.get<ApiListResponse<StaffRow, { total: number; active: number }>>(`/staff?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleExportStaff = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'xlsx', staffType: 'non_teaching' });
      if (status) params.append('status', status);
      const res = await api.get(`/data-transfer/export/staff?${params.toString()}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NonTeaching_Staff_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Staff directory exported');
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<StaffRow>[] = [
    {
      key: 'staff', header: 'Staff Member',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(row.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium">{row.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.employeeId} {row.email ? `· ${row.email}` : ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'fatherName', header: 'Father Name', cell: (row) => <span className="text-sm font-medium">{row.fatherName ?? '—'}</span> },
    { key: 'caste', header: 'Caste', cell: (row) => <span className="text-sm text-muted-foreground">{row.caste ?? '—'}</span> },
    { key: 'designation', header: 'Designation', cell: (row) => <span className="text-sm text-muted-foreground">{row.designation ?? '—'}</span> },
    { key: 'joined', header: 'Joined', cell: (row) => <span className="text-xs">{formatDate(row.joiningDate)}</span> },
    ...(canSeeSalary ? [{ key: 'salary', header: 'Salary', cell: (row: StaffRow) => <span className="text-sm font-medium">{formatCurrency(row.salary ?? 0)}</span> }] : []),
    {
      key: 'status', header: 'Status',
      cell: (row) => row.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>,
    },
    {
      key: 'actions', header: '', headerClassName: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Record actions" variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Staff actions</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/staff/${row._id}`)}>
              <Eye className="h-4 w-4" /> View profile
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/staff/${row._id}?edit=1`)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
            )}
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive" onClick={() => setArchiveTarget(row)}>
                  <Archive className="h-4 w-4" /> Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const totalStaff = pagination.total || data.length;
  const activeStaff = data.filter((t) => t.isActive).length;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Non-Teaching Staff Directory"
        description="Comprehensive profiles and administrative assignments."
        crumbs={[{ label: 'Staff' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/80 hover:bg-muted/50 transition-all font-medium text-xs shadow-sm"
              onClick={handleExportStaff}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              {exporting ? 'Exporting...' : 'Export View'}
            </Button>
            {canCreate && (
              <>

                <Button
                  onClick={() => navigate('/staff/new')}
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all"
                >
                  <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" /> Add Staff
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Total Staff" value={summary?.total ?? totalStaff} icon={Briefcase} tone="primary" loading={loading} />
        <StatCard title="Active Staff" value={summary?.active ?? activeStaff} icon={Sparkles} tone="success" loading={loading} />
        <StatCard title="In Roster" value={data.length} icon={ClipboardList} tone="navy" loading={loading} />
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] p-3 shadow-sm flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Name, employee ID, email…"
            className="pl-9 h-9 text-xs rounded-xl bg-background/50 border-border/60"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          />
        </div>
        <Select value={status || undefined} onValueChange={(v) => { setStatus(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-36 h-9 text-xs rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          pagination={pagination}
          rowKey={(r) => r._id}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
          onRowClick={(row) => navigate(`/staff/${row._id}`)}
          emptyTitle="No non-teaching staff found"
          emptyDescription="Add your first staff member."
        />
      </div>

      <ConfirmDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}
        title="Archive this staff member?" description={`${archiveTarget?.fullName} (${archiveTarget?.employeeId}) will be hidden from active lists.`}
        confirmLabel="Archive" destructive loading={busy}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          try {
            await api.post(`/staff/${archiveTarget._id}/archive`);
            toast.success('Staff archived');
            setArchiveTarget(null);
            load();
          } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
        }} />

    </div>
  );
}
