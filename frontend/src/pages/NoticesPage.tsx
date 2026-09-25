import { useCallback, useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Loader2, Megaphone, Pin, Plus } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, type ApiListResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface NoticeRow {
  _id: string;
  title: string;
  body: string;
  audienceType: 'school' | 'students' | 'teachers' | 'class' | 'section';
  className?: string | null;
  sectionName?: string | null;
  isPinned: boolean;
  isImportant: boolean;
  expiresAt: string | null;
  isArchived: boolean;
  createdAt: string;
}

interface ClassLite {
  _id: string;
  name: string;
  sections?: { _id: string; name: string }[];
}

const AUDIENCE_LABELS: Record<NoticeRow['audienceType'], string> = {
  school: 'Whole school',
  students: 'Students',
  teachers: 'Teachers',
  class: 'Class',
  section: 'Section',
};

export function NoticesPage() {
  const { user, can } = useAuth();
  const canCreate = can('notices', 'create');
  const canEdit = can('notices', 'edit');
  const canArchive = can('notices', 'archive');
  const canManageNotices = canCreate || canEdit || canArchive;

  const [data, setData] = useState<NoticeRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [detail, setDetail] = useState<NoticeRow | null>(null);

  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [classDetail, setClassDetail] = useState<ClassLite | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeRow | null>(null);
  const [form, setForm] = useState({
    title: '',
    body: '',
    audienceType: 'school' as NoticeRow['audienceType'],
    classId: '',
    sectionId: '',
    isPinned: false,
    isImportant: false,
    expiresAt: '',
  });
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<NoticeRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);



  useEffect(() => {
    if (canManageNotices) {
      api
        .get<ApiListResponse<ClassLite>>('/classes/lookup')
        .then((r) => setClasses(r.data.data))
        .catch(() => {});
    }
  }, [canManageNotices]);

  useEffect(() => {
    if (!form.classId) {
      setClassDetail(null);
      return;
    }
    const known = classes.find((c) => c._id === form.classId);
    if (known?.sections?.length) {
      setClassDetail(known);
      return;
    }
    api
      .get<{ success: boolean; data: ClassLite }>(`/classes/${form.classId}`)
      .then((r) => setClassDetail(r.data.data))
      .catch(() => setClassDetail(null));
  }, [form.classId, classes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (canManageNotices && audience !== 'all') params.set('audienceType', audience);
      if (canManageNotices && includeArchived) params.set('includeArchived', 'true');
      const res = await api.get<ApiListResponse<NoticeRow>>(`/notices?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, canManageNotices, audience, includeArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', body: '', audienceType: 'school', classId: '', sectionId: '', isPinned: false, isImportant: false, expiresAt: '' });
    setFormOpen(true);
  };

  const openEdit = (row: NoticeRow) => {
    setEditing(row);
    setForm({
      title: row.title,
      body: row.body,
      audienceType: row.audienceType,
      classId: '',
      sectionId: '',
      isPinned: row.isPinned,
      isImportant: row.isImportant,
      expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    if (form.audienceType === 'class' && !form.classId) {
      toast.error('Select a class for class notices');
      return;
    }
    if (form.audienceType === 'section' && !form.sectionId) {
      toast.error('Select a section for section notices');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        audienceType: form.audienceType,
        classId: form.classId || undefined,
        sectionId: form.sectionId || undefined,
        isPinned: form.isPinned,
        isImportant: form.isImportant,
        expiresAt: form.expiresAt || undefined,
      };
      if (editing) {
        await api.patch(`/notices/${editing._id}`, payload);
        toast.success('Notice updated');
      } else {
        await api.post('/notices', payload);
        toast.success('Notice published');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save notice'));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    try {
      const action = archiveTarget.isArchived ? 'publish' : 'archive';
      await api.post(`/notices/${archiveTarget._id}/${action}`);
      toast.success(archiveTarget.isArchived ? 'Notice re-published' : 'Notice archived');
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setArchiveBusy(false);
    }
  };

  const columns: Column<NoticeRow>[] = [
    {
      key: 'title',
      header: 'Notice',
      cell: (row) => (
        <button type="button" onClick={() => setDetail(row)} className="min-w-0 text-left leading-tight">
          <p className="flex items-center gap-1.5 font-medium hover:underline">
            {row.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
            {row.title}
            {row.isArchived && <Badge variant="muted">Archived</Badge>}
          </p>
          <p className="mt-0.5 line-clamp-1 max-w-[380px] text-xs text-muted-foreground">{row.body}</p>
        </button>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      cell: (row) => (
        <div className="leading-tight">
          <p className="text-sm">{AUDIENCE_LABELS[row.audienceType]}</p>
          {(row.className || row.sectionName) && (
            <p className="text-xs text-muted-foreground">
              {[row.className, row.sectionName && `Section ${row.sectionName}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'flags',
      header: 'Flags',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.isImportant && <Badge variant="destructive">Important</Badge>}
          {row.expiresAt && new Date(row.expiresAt) < new Date() && !row.isArchived && <Badge variant="muted">Expired</Badge>}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      cell: (row) => (
        <div className="text-sm leading-tight">
          <p>{formatDate(row.createdAt)}</p>
          {row.expiresAt && <p className="text-xs text-muted-foreground">Expires {formatDate(row.expiresAt)}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canEdit && !row.isArchived && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {canArchive && (
            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row)}>
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              <span className="sr-only">{row.isArchived ? 'Publish' : 'Archive'}</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Notices"
        description="School announcements targeted at audiences — pinned items stay on top."
        crumbs={[{ label: 'Communication' }, { label: 'Notices' }]}
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> New notice
            </Button>
          ) : undefined
        }
      />

      {canManageNotices && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-4 pt-4">
            <div className="w-44">
              <Label className="text-xs">Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All audiences</SelectItem>
                  <SelectItem value="school">Whole school</SelectItem>
                  <SelectItem value="students">Students</SelectItem>
                  <SelectItem value="teachers">Teachers</SelectItem>
                  <SelectItem value="class">Class</SelectItem>
                  <SelectItem value="section">Section</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={includeArchived} onCheckedChange={setIncludeArchived} />
              Include archived
            </label>
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
        emptyTitle="No notices"
        emptyDescription={canCreate ? 'Publish your first notice to reach the school.' : 'No notices are visible to you right now.'}
      />

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {detail?.isPinned && <Pin className="h-4 w-4 text-primary" />}
              {detail?.title}
            </DialogTitle>
            <DialogDescription>
              {detail && AUDIENCE_LABELS[detail.audienceType]}
              {detail?.className && ` · ${detail.className}`}
              {detail?.sectionName && ` · Section ${detail.sectionName}`}
              {' · '}
              {detail && formatDate(detail.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">{detail?.body}</div>
          {detail?.isImportant && (
            <p className="text-xs font-semibold text-destructive">
              <Megaphone className="mr-1 inline h-3.5 w-3.5" />
              This notice is marked important.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit notice' : 'New notice'}</DialogTitle>
            <DialogDescription>Notices reach only the selected audience. Class/section notices need a target.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="n-title">Title</Label>
              <Input id="n-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sports day announcement" />
            </div>
            <div>
              <Label htmlFor="n-body">Body</Label>
              <Textarea id="n-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} placeholder="Details of the announcement…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Audience</Label>
                <Select value={form.audienceType} onValueChange={(v) => setForm({ ...form, audienceType: v as NoticeRow['audienceType'], classId: '', sectionId: '' })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="school">Whole school</SelectItem>
                    <SelectItem value="students">Students</SelectItem>
                    <SelectItem value="teachers">Teachers</SelectItem>
                    <SelectItem value="class">Class</SelectItem>
                    <SelectItem value="section">Section</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="n-expires">Expires (optional)</Label>
                <Input id="n-expires" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              {form.audienceType === 'class' && (
                <div>
                  <Label>Class</Label>
                  <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v, sectionId: '' })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.audienceType === 'section' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Class</Label>
                    <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v, sectionId: '' })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Select value={form.sectionId} onValueChange={(v) => setForm({ ...form, sectionId: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Section" />
                      </SelectTrigger>
                      <SelectContent>
                        {(classDetail?.sections ?? []).map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            Section {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.isPinned} onCheckedChange={(v) => setForm({ ...form, isPinned: v })} />
                Pinned to top
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.isImportant} onCheckedChange={(v) => setForm({ ...form, isImportant: v })} />
                Important
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Publish notice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Re-publish notice?' : 'Archive notice?'}
        description={archiveTarget?.isArchived ? `"${archiveTarget?.title}" will be visible to its audience again.` : `"${archiveTarget?.title}" will be hidden from everyone.`}
        confirmLabel={archiveTarget?.isArchived ? 'Publish' : 'Archive'}
        loading={archiveBusy}
        onConfirm={toggleArchive}
      />
    </div>
  );
}
