import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Archive, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionRow {
  _id: string; name: string; classId: string; sessionId: string; className: string;
  studentCount: number; isArchived: boolean;
}

const schema = z.object({
  name: z.string().trim().min(1, 'Section name required').max(20),
  classId: z.string().min(1, 'Select a class'),
});
type FormValues = z.infer<typeof schema>;

export function SectionsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<SectionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<SectionRow | null>(null);

  const canEdit = can('sections', 'edit');
  const canCreate = can('sections', 'create');

  useEffectOnce(() => {
    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => setClasses(r.data.data)).catch(() => {});
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (classFilter) params.set('classId', classFilter);
      const res = await api.get<ApiListResponse<SectionRow>>(`/sections?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, search, classFilter]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<SectionRow>[] = [
    {
      key: 'name', header: 'Section',
      cell: (row) => <div className="leading-tight"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.className}</p></div>,
    },
    {
      key: 'strength', header: 'Strength',
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="outline">{row.studentCount}</Badge>
        </span>
      ),
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
      <PageHeader title="Sections" description="Divisions within a class, e.g. A, B, C."
        crumbs={[{ label: 'Classes & Roster' }, { label: 'Sections' }]}
        actions={canCreate ? (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add section</Button>
        ) : undefined} />

      <div className="filter-toolbar mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search section name..." className="pl-8" value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
        </div>
        <Select value={classFilter || undefined} onValueChange={(v) => { setClassFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data} loading={loading} pagination={pagination} rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        emptyTitle="No sections found" emptyDescription="Create sections within your classes." />

      <SectionFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} classes={classes} onSaved={load} />

      <ConfirmDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}
        title="Archive this section?" description={`"${archiveTarget?.name}" (${archiveTarget?.className}) will be hidden. Records are preserved.`}
        confirmLabel="Archive" destructive loading={busy}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          try {
            await api.post(`/sections/${archiveTarget._id}/archive`);
            toast.success('Section archived');
            setArchiveTarget(null);
            load();
          } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
        }} />
    </div>
  );
}

function SectionFormDialog({ open, onOpenChange, editing, classes, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: SectionRow | null;
  classes: ClassLite[]; onSaved: () => void;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { name: '', classId: '' },
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) reset(editing ? { name: editing.name, classId: editing.classId } : { name: '', classId: '' });
  }, [open, editing, reset]);

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    try {
      if (editing) { await api.patch(`/sections/${editing._id}`, values); toast.success('Section updated'); }
      else { await api.post('/sections', values); toast.success('Section created'); }
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit section' : 'Add section'}</DialogTitle>
          <DialogDescription>Sections belong to exactly one class.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sec-name">Section name</Label>
            <Input id="sec-name" placeholder="A" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select value={watch('classId') || undefined} onValueChange={(v) => setValue('classId', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.classId && <p className="text-xs text-destructive">{errors.classId.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create section'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
