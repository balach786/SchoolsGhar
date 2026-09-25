import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Star,
  Archive,
  ArchiveRestore,
  Pencil,
  Search,
  CalendarRange,
  Users,
  School,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SessionRow {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  studentCount: number;
  classCount?: number;
  createdAt?: string;
}

interface SessionSummary {
  totalSessions: number;
  activeSession: SessionRow | null;
  activeStudentCount: number;
  activeClassCount: number;
  archivedCount: number;
}

const sessionSchema = z
  .object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters').max(40),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date required (YYYY-MM-DD)'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date required (YYYY-MM-DD)'),
    makeActive: z.boolean().optional(),
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ['endDate'],
    message: 'End date must be strictly after start date',
  });

type FormValues = z.infer<typeof sessionSchema>;

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';

export function SessionsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();

  const [data, setData] = useState<SessionRow[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Confirmation targets
  const [activateTarget, setActivateTarget] = useState<SessionRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SessionRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SessionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null);

  const canEdit = can('academicSessions', 'edit');
  const canCreate = can('academicSessions', 'create');
  const canDelete = can('academicSessions', 'delete');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await api.get<ApiListResponse<SessionRow> & { summary?: SessionSummary }>(
        `/academic-sessions?${params}`
      );
      setData(res.data.data);
      setPagination(res.data.pagination);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleActivate = async (row: SessionRow) => {
    setBusy(true);
    try {
      await api.post(`/academic-sessions/${row._id}/activate`);
      toast.success(`"${row.name}" is now the active academic session`);
      setActivateTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (row: SessionRow) => {
    setBusy(true);
    try {
      await api.post(`/academic-sessions/${row._id}/archive`);
      toast.success(`Session "${row.name}" has been archived`);
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (row: SessionRow) => {
    setBusy(true);
    try {
      await api.post(`/academic-sessions/${row._id}/restore`);
      toast.success(`Session "${row.name}" restored`);
      setRestoreTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: SessionRow) => {
    setBusy(true);
    try {
      await api.delete(`/academic-sessions/${row._id}`);
      toast.success(`Session "${row.name}" permanently deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const getPeriodMeta = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const now = new Date();

    const diffMonths = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));

    if (now < s) {
      return { status: 'Upcoming', tone: 'text-sky-600 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800', duration: `${diffMonths} mos` };
    }
    if (now > e) {
      return { status: 'Concluded', tone: 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', duration: `${diffMonths} mos` };
    }
    return { status: 'Ongoing', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800', duration: `${diffMonths} mos` };
  };

  const columns: Column<SessionRow>[] = [
    {
      key: 'name',
      header: 'Academic Session',
      cell: (row) => {
        const meta = getPeriodMeta(row.startDate, row.endDate);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">{row.name}</span>
              {row.isActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              )}
              {row.isArchived && (
                <Badge variant="muted" className="text-[10px] gap-1 py-0">
                  <Archive className="h-3 w-3" /> Archived
                </Badge>
              )}
              {!row.isActive && !row.isArchived && (
                <span className="text-[10px] font-medium text-muted-foreground px-2 py-0.5 rounded bg-muted/50 border border-border/50">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{formatDate(row.startDate)} &rarr; {formatDate(row.endDate)}</span>
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.2 rounded border', meta.tone)}>
                {meta.status} · {meta.duration}
              </span>
            </p>
          </div>
        );
      },
    },
    {
      key: 'students',
      header: 'Enrolled Students',
      cell: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/students?sessionId=${row._id}`)}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer"
          title="Click to view students roster for this session"
        >
          <Users className="h-3.5 w-3.5" />
          <span>{row.studentCount} Students</span>
          <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </button>
      ),
    },
    {
      key: 'classes',
      header: 'Classes & Grades',
      cell: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/classes?sessionId=${row._id}`)}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-all cursor-pointer"
          title="Click to view classes configured in this session"
        >
          <School className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{row.classCount ?? 0} Classes</span>
          <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-56 text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && !row.isArchived && !row.isActive && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-xl gap-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
              onClick={() => setActivateTarget(row)}
            >
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              Make active
            </Button>
          )}

          {canEdit && !row.isArchived && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary"
              title="Edit session dates or name"
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}

          {canEdit && !row.isArchived && !row.isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
              title="Archive session"
              onClick={() => setArchiveTarget(row)}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}

          {canEdit && row.isArchived && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-xl gap-1 text-primary hover:bg-primary/10 border-primary/30 font-medium"
              onClick={() => setRestoreTarget(row)}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore
            </Button>
          )}

          {canDelete && !row.isActive && (row.studentCount === 0 && (row.classCount ?? 0) === 0) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Delete empty session"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const activeSessionName = summary?.activeSession?.name || data.find((s) => s.isActive)?.name || 'None Active';
  const activeSessionDates = summary?.activeSession
    ? `${formatDate(summary.activeSession.startDate)} – ${formatDate(summary.activeSession.endDate)}`
    : 'No active session configured';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Academic Sessions"
        description="Manage school years, define active admission cycles, and control academic record boundaries."
        crumbs={[{ label: 'Academics' }, { label: 'Academic Sessions' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-9 gap-1.5"
              onClick={() => load()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            {canCreate && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="rounded-xl h-9 gap-1.5 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white shadow-md"
              >
                <Plus className="h-4 w-4" />
                New Academic Session
              </Button>
            )}
          </div>
        }
      />

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Session"
          value={activeSessionName}
          icon={CalendarRange}
          tone="navy"
          description={activeSessionDates}
          loading={loading && !summary}
        />
        <StatCard
          title="Total Sessions"
          value={summary?.totalSessions ?? pagination.total}
          icon={Layers}
          tone="primary"
          description={`${summary?.archivedCount ?? 0} in historical archive`}
          loading={loading && !summary}
        />
        <StatCard
          title="Enrolled in Active"
          value={summary?.activeStudentCount ?? 0}
          icon={Users}
          tone="success"
          description="Active registered students"
          loading={loading && !summary}
        />
        <StatCard
          title="Classes Configured"
          value={summary?.activeClassCount ?? 0}
          icon={School}
          tone="gold"
          description="Rosters in active session"
          loading={loading && !summary}
        />
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search academic sessions…"
            className="pl-9 rounded-xl border-border/70"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/50 rounded-xl border border-border/40">
          {(
            [
              { id: 'all', label: 'All Sessions' },
              { id: 'active', label: 'Active Only' },
              { id: 'inactive', label: 'Inactive' },
              { id: 'archived', label: 'Archived' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer',
                statusFilter === tab.id
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        emptyTitle="No academic sessions found"
        emptyDescription={
          search || statusFilter !== 'all'
            ? 'No sessions match your search criteria. Try clearing the filter.'
            : 'Create your first academic session to define the active school year.'
        }
      />

      {/* Session Create/Edit Modal */}
      <SessionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        hasActiveSession={!!(summary?.activeSession || data.some((s) => s.isActive))}
        onSaved={load}
      />

      {/* Activation Confirm */}
      <ConfirmDialog
        open={!!activateTarget}
        onOpenChange={(o) => !o && setActivateTarget(null)}
        title={`Set "${activateTarget?.name}" as Active Session?`}
        description="Setting this session as active will switch the primary academic year for all school admissions, classes, examinations, and fee records. Exactly one session is active at any time."
        confirmLabel="Activate Session"
        loading={busy}
        onConfirm={() => activateTarget && handleActivate(activateTarget)}
      />

      {/* Archive Confirm */}
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={`Archive "${archiveTarget?.name}"?`}
        description="This session will be hidden from everyday dropdowns. Historical student records, examination marks, and invoices are safely preserved and can be restored at any time."
        confirmLabel="Archive Session"
        destructive
        loading={busy}
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
      />

      {/* Restore Confirm */}
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={`Restore "${restoreTarget?.name}"?`}
        description="This session will be un-archived and restored to inactive status so it is available again."
        confirmLabel="Restore Session"
        loading={busy}
        onConfirm={() => restoreTarget && handleRestore(restoreTarget)}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Permanently delete "${deleteTarget?.name}"?`}
        description="This session is empty (0 students, 0 classes). Deletion is permanent and cannot be undone."
        confirmLabel="Delete Session"
        destructive
        loading={busy}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}

function SessionFormDialog({
  open,
  onOpenChange,
  editing,
  hasActiveSession,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: SessionRow | null;
  hasActiveSession: boolean;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      name: '',
      startDate: '',
      endDate: '',
      makeActive: false,
    },
  });

  const [busy, setBusy] = useState(false);
  const makeActiveWatch = watch('makeActive');

  useEffect(() => {
    if (open) {
      if (editing) {
        reset({
          name: editing.name,
          startDate: editing.startDate.slice(0, 10),
          endDate: editing.endDate.slice(0, 10),
          makeActive: editing.isActive,
        });
      } else {
        // Default to upcoming year preset
        const currYear = new Date().getFullYear();
        reset({
          name: `${currYear}–${currYear + 1}`,
          startDate: `${currYear}-04-01`,
          endDate: `${currYear + 1}-03-31`,
          makeActive: !hasActiveSession,
        });
      }
    }
  }, [open, editing, hasActiveSession, reset]);

  const currYear = new Date().getFullYear();
  const namePresets = [
    `${currYear}–${currYear + 1}`,
    `${currYear + 1}–${currYear + 2}`,
    `${currYear - 1}–${currYear}`,
  ];

  const applyDatePreset = (startMonth: string, endMonth: string, nextYearEnd = true) => {
    const sYear = currYear;
    const eYear = nextYearEnd ? currYear + 1 : currYear;
    setValue('startDate', `${sYear}-${startMonth}`);
    setValue('endDate', `${eYear}-${endMonth}`);
  };

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/academic-sessions/${editing._id}`, {
          name: values.name,
          startDate: values.startDate,
          endDate: values.endDate,
        });
        if (values.makeActive && !editing.isActive) {
          await api.post(`/academic-sessions/${editing._id}/activate`);
        }
        toast.success('Academic session updated');
      } else {
        await api.post('/academic-sessions', values);
        toast.success('Academic session created');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            {editing ? 'Edit Academic Session' : 'New Academic Session'}
          </DialogTitle>
          <DialogDescription>
            Define the school year term. Date ranges determine admission cycles and academic boundaries.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Session Name with Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="s-name" className="text-xs font-semibold">
                Session Name
              </Label>
              {!editing && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground mr-1 flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> Quick:
                  </span>
                  {namePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setValue('name', preset)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary font-medium transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              id="s-name"
              placeholder="e.g. 2026–2027"
              className="rounded-xl border-border/70"
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Date Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Academic Cycle Dates</Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyDatePreset('04-01', '03-31', true)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary font-medium transition-colors"
                  title="April to March"
                >
                  Apr–Mar
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('01-01', '12-31', false)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary font-medium transition-colors"
                  title="January to December"
                >
                  Jan–Dec
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('09-01', '06-30', true)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary font-medium transition-colors"
                  title="September to June"
                >
                  Sep–Jun
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-start" className="text-[11px] text-muted-foreground">
                  Start Date
                </Label>
                <Input id="s-start" type="date" className="rounded-xl" {...register('startDate')} />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-end" className="text-[11px] text-muted-foreground">
                  End Date
                </Label>
                <Input id="s-end" type="date" className="rounded-xl" {...register('endDate')} />
                {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
              </div>
            </div>
          </div>

          {/* Make Active Switch */}
          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-3">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="s-active" className="text-xs font-semibold cursor-pointer">
                Set as Active Academic Session
              </Label>
              <p className="text-[11px] text-muted-foreground">
                All daily operations, new student admissions, and attendance will anchor to this session.
              </p>
            </div>
            <Switch
              id="s-active"
              checked={makeActiveWatch}
              onCheckedChange={(c) => setValue('makeActive', c)}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-semibold"
            >
              {busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
