import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Archive, Search, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface TeacherLite { _id: string; fullName: string; employeeId: string }
interface SubjectRow {
  _id: string; name: string; code: string; sessionId: string;
  classIds: string[];
  classNames: string; isActive: boolean; isArchived: boolean;
}

const schema = z.object({
  name: z.string().trim().min(2, 'Subject name must be at least 2 characters').max(80),
  code: z.string().trim().min(1, 'Subject code required').max(20),
  sessionId: z.string().min(1, 'Select a session'),
  classIds: z.array(z.string()).default([]),

});
type FormValues = z.infer<typeof schema>;

export function SubjectsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<SubjectRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<SubjectRow | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const canEdit = can('subjects', 'edit');
  const canCreate = can('subjects', 'create');

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => {
      const all = r.data.data.filter((s) => !s.isArchived);
      setSessions(all);
      const active = all.find((s) => s.isActive);
      if (active) setSessionId(active._id);
      setSessionReady(true);
    }).catch(() => {
      setSessionReady(true);
    });
    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => setClasses(r.data.data)).catch(() => {});
    api.get<ApiListResponse<TeacherLite>>('/teachers?limit=100').then((r) => setTeachers(r.data.data)).catch(() => {});
  });

  const load = useCallback(async () => {
    if (!sessionReady) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (sessionId) params.set('sessionId', sessionId);
      const res = await api.get<ApiListResponse<SubjectRow>>(`/subjects?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [sessionReady, pagination.page, pagination.limit, search, sessionId]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<SubjectRow>[] = [
    {
      key: 'name', header: 'Subject',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'classes', header: 'Classes',
      cell: (row) => <span className="max-w-[200px] truncate text-xs text-muted-foreground">{row.classNames || '—'}</span>,
    },

    {
      key: 'status', header: 'Status',
      cell: (row) => row.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>,
    },
    {
      key: 'actions', header: '', headerClassName: 'w-24',
      cell: (row) => canEdit ? (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(row); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setArchiveTarget(row)}>
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ) : <span />,
    },
  ];

  return (
    <div>
      <PageHeader title="Subjects" description="Subjects with class assignments."
        crumbs={[{ label: 'Classes & Roster' }, { label: 'Subjects' }]}
        actions={canCreate ? (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add subject</Button>
        ) : undefined} />

      <div className="filter-toolbar mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or code…" className="pl-8" value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
        </div>
        <Select value={sessionId || undefined} onValueChange={(v) => { setSessionId(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All sessions" /></SelectTrigger>
          <SelectContent>
            {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data} loading={loading} pagination={pagination} rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        emptyTitle="No subjects found" emptyDescription="Add subjects like English, Mathematics, Urdu…" />

      <SubjectFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing}
        sessions={sessions} classes={classes} teachers={teachers} onSaved={load} />

      <ConfirmDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}
        title="Archive this subject?" description={`"${archiveTarget?.name}" will be hidden from active lists.`}
        confirmLabel="Archive" destructive loading={busy}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          try {
            await api.post(`/subjects/${archiveTarget._id}/archive`);
            toast.success('Subject archived');
            setArchiveTarget(null);
            load();
          } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}

function SubjectFormDialog({ open, onOpenChange, editing, sessions, classes, teachers, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: SubjectRow | null;
  sessions: SessionLite[]; classes: ClassLite[]; teachers: TeacherLite[]; onSaved: () => void;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', sessionId: '', classIds: [] },
  });
  const [busy, setBusy] = useState(false);
  const selectedSession = watch('sessionId');
  const sessionClasses = classes.filter((c) => c.sessionId === selectedSession);

  useEffect(() => {
    if (open) {
      reset(editing
        ? { name: editing.name, code: editing.code, sessionId: editing.sessionId, classIds: editing.classIds }
        : { name: '', code: '', sessionId: sessions.find((s) => s.isActive)?._id ?? '', classIds: [] });
    }
  }, [open, editing, reset, sessions]);

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    try {
      if (editing) { await api.patch(`/subjects/${editing._id}`, values); toast.success('Subject updated'); }
      else { await api.post('/subjects', values); toast.success('Subject created'); }
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit subject' : 'Add subject'}</DialogTitle>
          <DialogDescription>Assign the subject to classes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subj-name">Subject name</Label>
              <Input id="subj-name" placeholder="Mathematics" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subj-code">Code</Label>
              <Input id="subj-code" placeholder="MTH" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Session</Label>
            <Select value={watch('sessionId') || undefined} onValueChange={(v) => { setValue('sessionId', v, { shouldValidate: true }); setValue('classIds', []); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.sessionId && <p className="text-xs text-destructive">{errors.sessionId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Classes</Label>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
              {sessionClasses.length === 0 && <p className="px-1 py-1 text-xs text-muted-foreground">No classes in this session.</p>}
              {sessionClasses.map((c) => {
                const checked = (watch('classIds') ?? []).includes(c._id);
                return (
                  <button key={c._id} type="button"
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${checked ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                    onClick={() => setValue('classIds', toggleId(watch('classIds') ?? [], c._id))}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create subject'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
