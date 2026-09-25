import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ClipboardList, Loader2, Plus, Send } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, type ApiListResponse, type ApiDataResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface AssignmentRow {
  _id: string;
  title: string;
  description: string | null;
  classId: string;
  sectionId: string | null;
  subjectId: string | null;
  teacherId: string | null;
  dueDate: string | null;
  maxMarks: number | null;
  attachments: { name: string; url: string; mimeType?: string | null }[];
  isArchived: boolean;
  createdAt: string;
  className?: string;
  sectionName?: string | null;
  subjectName?: string | null;
  teacherName?: string | null;
  submissionStatus?: 'pending' | 'late' | 'submitted';
  mySubmissionId?: string | null;
  marksObtained?: number | null;
  feedback?: string | null;
}

interface SubmissionRow {
  _id: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  rollNumber?: string;
  content?: string | null;
  fileUrl?: string | null;
  submittedAt: string;
  isLate: boolean;
  marksObtained: number | null;
  feedback: string | null;
}

interface ClassLite {
  _id: string;
  name: string;
  sections?: { _id: string; name: string }[];
}
interface SubjectLite {
  _id: string;
  name: string;
  code: string;
}

interface AssignmentForm {
  title: string;
  description: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  dueDate: string;
  maxMarks: string;
}

const EMPTY_FORM: AssignmentForm = { title: '', description: '', classId: '', sectionId: '', subjectId: '', dueDate: '', maxMarks: '' };

export function AssignmentsPage() {
  const { user, can } = useAuth();
  const role = user?.role ?? '';
  const isAdmin = role === 'super_admin' || role === 'admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const [data, setData] = useState<AssignmentRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('assignments');

  // Filters
  const [status, setStatus] = useState('active');
  const [classId, setClassId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');

  // Reference data
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);

  const [classDetail, setClassDetail] = useState<ClassLite | null>(null);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [form, setForm] = useState<AssignmentForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AssignmentRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  // Submissions
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentRow | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<AssignmentRow | null>(null);
  const [submitContent, setSubmitContent] = useState('');
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitName, setSubmitName] = useState('');
  const [reviewTarget, setReviewTarget] = useState<SubmissionRow | null>(null);
  const [reviewMarks, setReviewMarks] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');

  const canCreate = can('assignments', 'create');
  const canEdit = can('assignments', 'edit');
  const canReview = can('submissions', 'edit');
  const canViewSubmissions = can('submissions', 'view');
  const canSubmit = can('submissions', 'create');
  const canArchive = can('assignments', 'archive');

  const allowedClasses = classes; // All classes visible; tenant scoping applied in backend

  useEffect(() => {
    api
      .get<ApiListResponse<ClassLite>>('/classes/lookup')
      .then((r) => setClasses(r.data.data))
      .catch(() => {});
    api
      .get<ApiListResponse<SubjectLite>>('/subjects?limit=100')
      .then((r) => setSubjects(r.data.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (isAdmin && status !== 'active') params.set('status', status);
      if (isAdmin && classId !== 'all') params.set('classId', classId);
      if (subjectId !== 'all') params.set('subjectId', subjectId);
      const res = await api.get<ApiListResponse<AssignmentRow>>(`/assignments?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, isAdmin, status, classId, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Class detail (sections) when the class changes in the form
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
      .get<ApiDataResponse<ClassLite>>(`/classes/${form.classId}`)
      .then((r) => setClassDetail(r.data.data))
      .catch(() => setClassDetail(null));
  }, [form.classId, classes]);

  // Submissions loader (reviewers see submissions of the selected assignment)
  const loadSubs = useCallback(async () => {
    if (!selectedAssignment) {
      setSubs([]);
      return;
    }
    setSubsLoading(true);
    try {
      const res = await api.get<ApiListResponse<SubmissionRow>>(`/submissions?assignmentId=${selectedAssignment._id}&limit=100`);
      setSubs(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubsLoading(false);
    }
  }, [selectedAssignment]);

  useEffect(() => {
    loadSubs();
  }, [loadSubs]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: AssignmentRow) => {
    setEditing(row);
    setForm({
      title: row.title,
      description: row.description ?? '',
      classId: row.classId,
      sectionId: row.sectionId ?? '',
      subjectId: row.subjectId ?? '',
      dueDate: row.dueDate ? row.dueDate.slice(0, 10) : '',
      maxMarks: row.maxMarks !== null ? String(row.maxMarks) : '',
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.title.trim() || !form.classId) {
      toast.error('Title and class are required');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        classId: form.classId,
        sectionId: form.sectionId || undefined,
        subjectId: form.subjectId || undefined,
        dueDate: form.dueDate || undefined,
        maxMarks: form.maxMarks ? Number(form.maxMarks) : undefined,
      };
      if (editing) {
        await api.patch(`/assignments/${editing._id}`, payload);
        toast.success('Assignment updated');
      } else {
        await api.post('/assignments', payload);
        toast.success('Assignment created');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save assignment'));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    try {
      const action = archiveTarget.isArchived ? 'restore' : 'archive';
      await api.post(`/assignments/${archiveTarget._id}/${action}`);
      toast.success(archiveTarget.isArchived ? 'Assignment restored' : 'Assignment archived');
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setArchiveBusy(false);
    }
  };

  const openSubmit = (row: AssignmentRow) => {
    setSubmitTarget(row);
    setSubmitContent('');
    setSubmitUrl('');
    setSubmitName('');
    setSubmitOpen(true);
  };

  const saveSubmit = async () => {
    if (!submitTarget) return;
    if (!submitContent.trim() && !submitUrl.trim()) {
      toast.error('Provide text content or a file reference');
      return;
    }
    setBusy(true);
    try {
      await api.post('/submissions', {
        assignmentId: submitTarget._id,
        content: submitContent.trim() || undefined,
        fileUrl: submitUrl.trim() || undefined,
        fileMeta: submitUrl.trim() ? { name: submitName.trim() || 'attachment', mimeType: undefined } : undefined,
      });
      toast.success('Submission received');
      setSubmitOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit'));
    } finally {
      setBusy(false);
    }
  };

  const openReview = (row: SubmissionRow) => {
    setReviewTarget(row);
    setReviewMarks(row.marksObtained !== null ? String(row.marksObtained) : '');
    setReviewFeedback(row.feedback ?? '');
  };

  const saveReview = async () => {
    if (!reviewTarget) return;
    setBusy(true);
    try {
      await api.patch(`/submissions/${reviewTarget._id}`, {
        marksObtained: Number(reviewMarks),
        feedback: reviewFeedback.trim() || undefined,
      });
      toast.success('Submission reviewed');
      setReviewTarget(null);
      loadSubs();
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not review submission'));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<AssignmentRow>[] = [
    {
      key: 'title',
      header: 'Assignment',
      cell: (row) => (
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-2 font-medium">
            {row.title}
            {row.isArchived && <Badge variant="muted">Archived</Badge>}
          </p>
          {row.description && <p className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-muted-foreground">{row.description}</p>}
          {row.attachments.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.attachments.map((a) => (
                <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="mr-2 underline underline-offset-2 hover:text-foreground">
                  {a.name}
                </a>
              ))}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      cell: (row) => (
        <div className="leading-tight">
          <p className="text-sm">{row.className ?? '—'}</p>
          {row.sectionName && <p className="text-xs text-muted-foreground">Section {row.sectionName}</p>}
        </div>
      ),
    },
    { key: 'subject', header: 'Subject', cell: (row) => <span className="text-sm">{row.subjectName ?? '—'}</span> },
    {
      key: 'teacher',
      header: 'Posted by',
      cell: (row) => <span className="text-sm">{row.teacherName ?? '—'}</span>,
    },
    {
      key: 'due',
      header: 'Due date',
      cell: (row) => (
        <span className="text-sm">
          {row.dueDate ? formatDate(row.dueDate) : '—'}
          {row.dueDate && !row.isArchived && new Date(row.dueDate) < new Date() ? (
            <Badge variant="destructive" className="ml-2">
              overdue
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'max', header: 'Max marks', cell: (row) => <span className="text-sm">{row.maxMarks ?? '—'}</span> },
    ...(isStudent
      ? [
          {
            key: 'status',
            header: 'My status',
            cell: (row: AssignmentRow) => (
              <Badge variant={row.submissionStatus === 'submitted' ? 'success' : row.submissionStatus === 'late' ? 'destructive' : 'muted'}>
                {row.submissionStatus}
              </Badge>
            ),
          } as Column<AssignmentRow>,
        ]
      : []),
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {isStudent &&
            !row.isArchived &&
            (row.submissionStatus === 'pending' || row.submissionStatus === 'late') &&
            canSubmit && (
              <Button size="sm" variant="outline" onClick={() => openSubmit(row)}>
                <Send className="mr-1 h-3.5 w-3.5" /> Submit
              </Button>
            )}
          {canViewSubmissions && !row.isArchived && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTab('submissions');
                setSelectedAssignment(row);
              }}
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5" /> Submissions
            </Button>
          )}
          {canEdit && !row.isArchived && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {canArchive && (
            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row)}>
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              <span className="sr-only">{row.isArchived ? 'Restore' : 'Archive'}</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  const submissionColumns: Column<SubmissionRow>[] = [
    {
      key: 'student',
      header: 'Student',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.studentName ?? '—'}</p>
          <p className="text-xs text-muted-foreground">
            {row.admissionNumber ?? '—'} · Roll {row.rollNumber ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (row) => (
        <span className="text-sm">
          {formatDate(row.submittedAt)}
          {row.isLate && (
            <Badge variant="destructive" className="ml-2">
              late
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'answer',
      header: 'Answer',
      cell: (row) => (
        <div className="max-w-[260px] leading-tight">
          {row.content && <p className="line-clamp-2 text-xs text-muted-foreground">{row.content}</p>}
          {row.fileUrl && (
            <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
              View file
            </a>
          )}
          {!row.content && !row.fileUrl && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'marks',
      header: 'Marks',
      cell: (row) => <span className="text-sm">{row.marksObtained !== null ? `${row.marksObtained}` : 'Not reviewed'}</span>,
    },
    {
      key: 'feedback',
      header: 'Feedback',
      cell: (row) => <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{row.feedback ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end">
          {canReview && (
            <Button size="sm" variant="outline" onClick={() => openReview(row)}>
              {row.marksObtained !== null ? 'Update review' : 'Review'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const reviewableAssignments = useMemo(() => data.filter((a) => !a.isArchived), [data]);
  const mySubmissionsAssignments = useMemo(() => data.filter((a) => a.mySubmissionId), [data]);

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Homework and classwork posted per class — students submit, teachers review."
        crumbs={[{ label: 'Academics' }, { label: 'Assignments' }]}
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> New assignment
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          {canViewSubmissions && <TabsTrigger value="submissions">Submissions</TabsTrigger>}
          {isStudent && <TabsTrigger value="mysubmissions">My submissions</TabsTrigger>}
        </TabsList>

        <TabsContent value="assignments" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 pt-4">
              {isAdmin && (
                <div className="w-40">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isAdmin && (
                <div className="w-40">
                  <Label className="text-xs">Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="w-40">
                <Label className="text-xs">Subject</Label>
                <Select value={subjectId} onValueChange={setSubjectId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={data}
            loading={loading}
            rowKey={(r) => r._id}
            pagination={pagination}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
            emptyTitle="No assignments"
            emptyDescription={canCreate ? 'Create your first assignment to get started.' : 'No assignments are visible to you right now.'}
          />
        </TabsContent>

        {canViewSubmissions && (
          <TabsContent value="submissions" className="mt-4 space-y-4">
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 pt-4">
                <div className="w-72">
                  <Label className="text-xs">Assignment</Label>
                  <Select value={selectedAssignment?._id ?? ''} onValueChange={(v) => setSelectedAssignment(data.find((a) => a._id === v) ?? null)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pick an assignment…" />
                    </SelectTrigger>
                    <SelectContent>
                      {reviewableAssignments.map((a) => (
                        <SelectItem key={a._id} value={a._id}>
                          {a.title} · {a.className}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedAssignment && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAssignment.title} — due {selectedAssignment.dueDate ? formatDate(selectedAssignment.dueDate) : 'n/a'}, max marks{' '}
                    {selectedAssignment.maxMarks ?? '—'}
                  </p>
                )}
              </CardContent>
            </Card>

            <DataTable
              columns={submissionColumns}
              data={subs}
              loading={subsLoading}
              rowKey={(r) => r._id}
              emptyTitle="No submissions yet"
              emptyDescription={selectedAssignment ? 'No student has submitted this assignment yet.' : 'Select an assignment to see submissions.'}
            />
          </TabsContent>
        )}

        {isStudent && (
          <TabsContent value="mysubmissions" className="mt-4">
            <DataTable
              columns={[
                {
                  key: 'title',
                  header: 'Assignment',
                  cell: (row) => (
                    <div className="leading-tight">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.subjectName ?? '—'}</p>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (row) => <Badge variant={row.submissionStatus === 'submitted' ? 'success' : 'destructive'}>{row.submissionStatus}</Badge>,
                },
                {
                  key: 'marks',
                  header: 'Marks',
                  cell: (row) => <span className="text-sm">{row.marksObtained !== null ? `${row.marksObtained} / ${row.maxMarks ?? '—'}` : 'Not reviewed'}</span>,
                },
                {
                  key: 'feedback',
                  header: 'Feedback',
                  cell: (row) => <span className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{row.feedback ?? '—'}</span>,
                },
              ]}
              data={mySubmissionsAssignments}
              loading={loading}
              rowKey={(r) => r._id}
              emptyTitle="No submissions yet"
              emptyDescription="Assignments you have submitted will appear here with your marks and feedback."
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit assignment' : 'New assignment'}</DialogTitle>
            <DialogDescription>Assignments are visible to the selected class (and section, if chosen).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="a-title">Title</Label>
              <Input id="a-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 4 exercises" />
            </div>
            <div>
              <Label htmlFor="a-desc">Description</Label>
              <Textarea id="a-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Instructions for students…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Class</Label>
                <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v, sectionId: '' })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedClasses.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section (optional)</Label>
                <Select value={form.sectionId || 'none'} onValueChange={(v) => setForm({ ...form, sectionId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Whole class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole class</SelectItem>
                    {(classDetail?.sections ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        Section {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject (optional)</Label>
                <Select value={form.subjectId || 'none'} onValueChange={(v) => setForm({ ...form, subjectId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any subject</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="a-due">Due date (optional)</Label>
                <Input id="a-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="a-max">Max marks (optional)</Label>
                <Input id="a-max" type="number" min={0} max={1000} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} placeholder="e.g. 20" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit: {submitTarget?.title}</DialogTitle>
            <DialogDescription>
              {submitTarget?.dueDate && <span>Due {formatDate(submitTarget.dueDate)}. </span>}
              Provide your answer text and/or a link to your file (never uploaded bytes — external references only).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="s-content">Answer</Label>
              <Textarea id="s-content" value={submitContent} onChange={(e) => setSubmitContent(e.target.value)} rows={4} placeholder="Write your answer…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="s-url">File URL (optional)</Label>
                <Input id="s-url" value={submitUrl} onChange={(e) => setSubmitUrl(e.target.value)} placeholder="https://…/work.pdf" />
              </div>
              <div>
                <Label htmlFor="s-name">File name</Label>
                <Input id="s-name" value={submitName} onChange={(e) => setSubmitName(e.target.value)} placeholder="work.pdf" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveSubmit} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Submit assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={Boolean(reviewTarget)} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review submission</DialogTitle>
            <DialogDescription>
              {reviewTarget?.studentName} — {selectedAssignment?.title}
              {selectedAssignment?.maxMarks != null && <span> · max {selectedAssignment.maxMarks} marks</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="r-marks">Marks obtained</Label>
              <Input id="r-marks" type="number" min={0} value={reviewMarks} onChange={(e) => setReviewMarks(e.target.value)} placeholder="e.g. 18" />
            </div>
            <div>
              <Label htmlFor="r-feedback">Feedback</Label>
              <Textarea id="r-feedback" value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} rows={3} placeholder="Comments for the student…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveReview} disabled={busy || reviewMarks === ''}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Restore assignment?' : 'Archive assignment?'}
        description={
          archiveTarget?.isArchived
            ? `"${archiveTarget?.title}" will become visible to students again.`
            : `"${archiveTarget?.title}" will be hidden from students. Existing submissions are kept.`
        }
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        loading={archiveBusy}
        onConfirm={toggleArchive}
      />
    </div>
  );
}
