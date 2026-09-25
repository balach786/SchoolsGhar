import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Send,
  CalendarClock,
  Wallet,
  Banknote,
  Award,
  Users,
  CheckCircle2,
  Trash2,
  Settings2,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  ScrollText,
  ClipboardCheck,
  PenLine,
  BarChart3,
  Receipt,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { QuickActionGrid, QuickActionItem } from '@/components/dashboard/QuickActionGrid';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { formatMoney } from '@/lib/format';

interface DashboardMetrics {
  totalExams: number;
  upcomingExams: number;
  studentsInExam: number;
  expectedExamFees: number;
  collectedExamFees: number;
  pendingExamFees: number;
  resultsPublished: number;
}

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
  isArchived: boolean;
}

interface ClassRow {
  _id: string;
  name: string;
  sessionId: string;
  isArchived: boolean;
}

interface ExamTypeRow {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface GradeScaleRow {
  _id: string;
  name: string;
  isDefault: boolean;
  boundaries: { grade: string; minPercentage: number }[];
}

interface ExamSubject {
  subjectId: string;
  maxMarks: number;
  passMarks?: number;
}

interface ExamRow {
  _id: string;
  name: string;
  examTypeId?: string | null;
  examTypeName?: string;
  sessionId: string;
  classId: string;
  classIds?: string[];
  startDate?: string | null;
  endDate?: string | null;
  examDate?: string | null;
  description?: string | null;
  status: string;
  requireExamFeeForAdmitCard?: boolean;
  subjects: ExamSubject[];
  gradeScaleId: string | null;
  isPublished: boolean;
  isArchived: boolean;
  className?: string;
  sessionName?: string;
}

const EXAM_STATUSES = ['Draft', 'Scheduled', 'Ongoing', 'Completed', 'Results Pending', 'Published', 'Archived'];

export function ExamsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ExamRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [examTypeIdFilter, setExamTypeIdFilter] = useState('all');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [examTypes, setExamTypes] = useState<ExamTypeRow[]>([]);
  const [gradeScales, setGradeScales] = useState<GradeScaleRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Create/Edit Exam Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Exam Form Inputs
  const [examName, setExamName] = useState('');
  const [selectedExamTypeId, setSelectedExamTypeId] = useState<string>('none');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classFees, setClassFees] = useState<Record<string, string>>({});
  const [bulkFee, setBulkFee] = useState('');
  const [examFeeDueDate, setExamFeeDueDate] = useState('');
  const [selectedGradeScaleId, setSelectedGradeScaleId] = useState<string>('default');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Scheduled');
  const [requireFeeBeforeAdmitCard, setRequireFeeBeforeAdmitCard] = useState(false);

  // Exam Types Management Modal
  const [typesModalOpen, setTypesModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');

  // Confirmation modals
  const [archiveTarget, setArchiveTarget] = useState<ExamRow | null>(null);
  const [publishTarget, setPublishTarget] = useState<ExamRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExamRow | null>(null);

  const canCreate = can('exams', 'create');
  const canEdit = can('exams', 'edit');
  const canPublish = can('exams', 'publish');
  const canArchive = can('exams', 'archive');
  const canDelete = can('exams', 'delete');

  useEffectOnce(() => {
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions/lookup')
      .then((r) => {
        setSessions(r.data.data.filter((s) => !s.isArchived));
        const active = r.data.data.find((s) => s.isActive);
        if (active) setSessionId(active._id);
      })
      .catch(() => { });

    loadExamTypes();
    loadGradeScales();
  });

  const loadExamTypes = async () => {
    try {
      const r = await api.get<ApiDataResponse<ExamTypeRow[]>>('/exam-types');
      setExamTypes(r.data.data);
    } catch { }
  };

  const loadGradeScales = async () => {
    try {
      const r = await api.get<ApiListResponse<GradeScaleRow>>('/grade-scales');
      setGradeScales(r.data.data || []);
    } catch { }
  };

  useEffect(() => {
    if (!sessionId) return;
    api
      .get<ApiListResponse<ClassRow>>(`/classes/lookup?sessionId=${sessionId}`)
      .then((r) => {
        setClasses(r.data.data.filter((c) => !c.isArchived));
      })
      .catch(() => { });
  }, [sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (sessionId) params.set('sessionId', sessionId);
      if (classId !== 'all') params.set('classId', classId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (examTypeIdFilter !== 'all') params.set('examTypeId', examTypeIdFilter);

      const res = await api.get<ApiListResponse<ExamRow>>(`/exams?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sessionId, classId, statusFilter, examTypeIdFilter]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      const res = await api.get<ApiDataResponse<DashboardMetrics>>(`/exam-reports/dashboard?${params}`);
      setMetrics(res.data.data);
    } catch { }
    finally {
      setMetricsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    loadMetrics();
  }, [load, loadMetrics]);

  const examQuickActions: QuickActionItem[] = [
    { id: 'create-exam', label: 'Create Exam', subtitle: 'Tests & schedules', icon: FileSpreadsheet, onClick: () => openCreate(), permission: can('exams', 'create'), color: 'navy' },
    { id: 'create-sched', label: 'Schedule', subtitle: 'Timetable slots', icon: CalendarClock, to: '/exams/schedule', permission: can('exams', 'create'), color: 'amber' },
    { id: 'exam-fees', label: 'Exam Fees', subtitle: 'Manage exam fees', icon: Wallet, to: '/exams/fees', permission: can('examFees', 'view'), color: 'amber' },
    { id: 'admit-card', label: 'Roll Nos & Admit Cards', subtitle: 'Hall tickets', icon: ScrollText, to: '/exams/admit-cards', permission: can('admitCards', 'view'), color: 'navy' },
    { id: 'seating-plan', label: 'Seating Plan', subtitle: 'Hall arrangements', icon: Users, to: '/exams/seating-plan', permission: can('admitCards', 'view'), color: 'amber' },
    { id: 'exam-att', label: 'Attendance', subtitle: 'Hall roll-call', icon: ClipboardCheck, to: '/exams/attendance', permission: can('examAttendance', 'view'), color: 'navy' },
    { id: 'enter-marks', label: 'Marks', subtitle: 'Subject scoring', icon: PenLine, to: '/exams/marks', permission: can('marks', 'view'), color: 'amber' },
    { id: 'results', label: 'Results', subtitle: 'Generate & Publish', icon: Award, to: '/exams/results', permission: can('results', 'view'), color: 'navy' },
    { id: 'exam-reports', label: 'Reports', subtitle: 'Performance analytics', icon: BarChart3, to: '/exams/reports', permission: can('reports', 'view'), color: 'navy' },
  ];

  const openCreate = () => {
    setEditing(null);
    setExamName('');
    setSelectedExamTypeId(examTypes.length > 0 ? examTypes[0]._id : 'none');
    setSelectedSessionId(sessionId || (sessions[0]?._id ?? ''));
    setSelectedClassId(classes[0]?._id ?? '');
    setSelectedClassIds(classes.length > 0 ? [classes[0]._id] : []);
    setClassFees({});
    setBulkFee('');
    setExamFeeDueDate('');
    const defScale = gradeScales.find((g) => g.isDefault);
    setSelectedGradeScaleId(defScale ? defScale._id : (gradeScales[0]?._id || 'default'));
    setStartDate('');
    setEndDate('');
    setDescription('');
    setStatus('Scheduled');
    setRequireFeeBeforeAdmitCard(false);
    setFormOpen(true);
  };

  const openEdit = (exam: ExamRow) => {
    setEditing(exam);
    setExamName(exam.name);
    setSelectedExamTypeId(exam.examTypeId || 'none');
    setSelectedSessionId(exam.sessionId);
    setSelectedClassId(exam.classId);
    setSelectedClassIds((exam as any).classIds?.length ? (exam as any).classIds : exam.classId ? [exam.classId] : []);
    
    const apiClassFees = (exam as any).classFees || {};
    const fees: Record<string, string> = {};
    for (const [cid, amt] of Object.entries(apiClassFees)) {
      fees[cid] = String(amt);
    }
    setClassFees(fees);
    setBulkFee('');
    setExamFeeDueDate('');

    setSelectedGradeScaleId(exam.gradeScaleId || 'default');
    setStartDate(exam.startDate ? exam.startDate.slice(0, 10) : '');
    setEndDate(exam.endDate ? exam.endDate.slice(0, 10) : '');
    setDescription(exam.description ?? '');
    setStatus(exam.status || 'Scheduled');
    setRequireFeeBeforeAdmitCard(Boolean(exam.requireExamFeeForAdmitCard));
    setFormOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim()) {
      toast.error('Exam name is required');
      return;
    }
    if (!selectedSessionId || selectedClassIds.length === 0) {
      toast.error('Session and class are required');
      return;
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    setBusy(true);
    try {
      const payload: Record<string, any> = {
        name: examName.trim(),
        sessionId: selectedSessionId,
        examTypeId: selectedExamTypeId === 'none' ? undefined : selectedExamTypeId,
        gradeScaleId: selectedGradeScaleId === 'default' ? undefined : selectedGradeScaleId,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        description: description.trim() || undefined,
        status,
        requireExamFeeForAdmitCard: requireFeeBeforeAdmitCard,
      };

      payload.classIds = selectedClassIds;

      const formattedFees: Record<string, number> = {};
      for (const [cid, feeStr] of Object.entries(classFees)) {
        const amt = Number(feeStr);
        if (!isNaN(amt) && amt > 0) {
          formattedFees[cid] = Math.round(amt * 100);
        }
      }
      payload.classFees = formattedFees;
      if (examFeeDueDate) {
        payload.examFeeDueDate = new Date(examFeeDueDate).toISOString();
      }

      if (editing) {
        await api.patch(`/exams/${editing._id}`, payload);
        toast.success('Exam updated successfully');
      } else {
        const response = await api.post('/exams', payload);
        toast.success(response.data.message || 'Exam created successfully');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    try {
      await api.post('/exam-types', {
        name: newTypeName.trim(),
        description: newTypeDescription.trim() || undefined,
        isActive: true,
      });
      toast.success('Exam type added');
      setNewTypeName('');
      setNewTypeDescription('');
      loadExamTypes();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleToggleType = async (typeId: string) => {
    try {
      await api.post(`/exam-types/${typeId}/toggle`);
      loadExamTypes();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      const action = archiveTarget.isArchived ? 'restore' : 'archive';
      await api.post(`/exams/${archiveTarget._id}/${action}`);
      toast.success(archiveTarget.isArchived ? 'Exam restored' : 'Exam archived');
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handlePublish = async () => {
    if (!publishTarget) return;
    try {
      const action = publishTarget.isPublished ? 'unpublish' : 'publish';
      await api.post(`/exams/${publishTarget._id}/${action}`);
      toast.success(publishTarget.isPublished ? 'Results unpublished' : 'Results published to students');
      setPublishTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/exams/${deleteTarget._id}`);
      toast.success('Exam deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const columns: Column<ExamRow>[] = [
    {
      key: 'name',
      header: 'Exam',
      cell: (row) => (
        <div className="leading-tight">
          <span className="font-semibold text-foreground text-sm">{row.name}</span>
          {row.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'examTypeName',
      header: 'Type',
      cell: (row) => (
        <Badge variant="outline" className="text-xs font-medium border-primary/20 bg-primary/5 text-primary">
          {row.examTypeName && row.examTypeName !== '—' ? row.examTypeName : 'Standard'}
        </Badge>
      ),
    },
    {
      key: 'sessionName',
      header: 'Session',
      cell: (row) => <span className="text-xs text-muted-foreground font-medium">{row.sessionName ?? '—'}</span>,
    },
    {
      key: 'className',
      header: 'Class',
      cell: (row) => {
        const classNamesArr = (row as any).classNames;
        if (classNamesArr && classNamesArr.length > 0) {
          return <span className="text-xs font-semibold text-foreground">{classNamesArr.join(', ')}</span>;
        }
        return <span className="text-xs font-semibold text-foreground">{row.className ?? '—'}</span>;
      }
    },
    {
      key: 'dates',
      header: 'Start & End Date',
      cell: (row) => (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>{row.startDate ? formatDate(row.startDate) : '—'}</span>
          <span>to</span>
          <span>{row.endDate ? formatDate(row.endDate) : '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        const st = row.status || (row.isPublished ? 'Published' : row.isArchived ? 'Archived' : 'Scheduled');
        let badgeClass = 'bg-primary/10 text-primary border-primary/20';
        if (st === 'Published') badgeClass = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
        else if (st === 'Ongoing') badgeClass = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
        else if (st === 'Archived') badgeClass = 'bg-rose-500/10 text-rose-600 border-rose-500/20';

        return (
          <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
            {st}
          </span>
        );
      },
    },
    {
      key: 'fee',
      header: 'Exam Fee',
      cell: (row) => (
        row.requireExamFeeForAdmitCard ? (
          <span className="inline-flex items-center rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Fee Required
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Standard</span>
        )
      ),
    },

    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} title="Edit Exam">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}

          {canPublish && !row.isArchived && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${row.isPublished ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setPublishTarget(row)}
              title={row.isPublished ? 'Unpublish Results' : 'Publish / Send'}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}

          {canArchive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setArchiveTarget(row)}
              title={row.isArchived ? 'Restore' : 'Archive'}
            >
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          )}

          {canDelete && !row.isPublished && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(row)}
              title="Delete Exam"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Examinations"
        description="Plan examinations, manage types, schedule subjects, configure dedicated fees, and track results."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTypesModalOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Exam Types
            </Button>
            {canCreate && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Create Exam
              </Button>
            )}
          </div>
        }
      />

      {/* ── Top Quick Actions Grid ── */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Exam Quick Actions
        </p>
        <QuickActionGrid actions={examQuickActions} />
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <StatCard title="Total Exams" value={metricsLoading ? null : metrics?.totalExams ?? 0} icon={FileSpreadsheet} loading={metricsLoading} tone="navy" />
        <StatCard title="Upcoming" value={metricsLoading ? null : metrics?.upcomingExams ?? 0} icon={CalendarClock} loading={metricsLoading} tone="primary" />
        <StatCard title="Eligible Students" value={metricsLoading ? null : metrics?.studentsInExam ?? 0} icon={Users} loading={metricsLoading} />
        <StatCard title="Fees Expected" value={metricsLoading ? null : formatMoney(metrics?.expectedExamFees ?? 0)} icon={Receipt} loading={metricsLoading} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="Fees Collected" value={metricsLoading ? null : formatMoney(metrics?.collectedExamFees ?? 0)} icon={Wallet} tone="success" loading={metricsLoading} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="Fees Pending" value={metricsLoading ? null : formatMoney(metrics?.pendingExamFees ?? 0)} icon={AlertCircle} tone="warning" loading={metricsLoading} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="Published Results" value={metricsLoading ? null : metrics?.resultsPublished ?? 0} icon={CheckCircle2} loading={metricsLoading} tone="success" />
      </div>

      {/* Filter Bar */}
      <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <Select value={sessionId} onValueChange={(v) => setSessionId(v)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s._id} value={s._id} className="text-xs">
                      {s.name} {s.isActive && '(Active)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <Select value={examTypeIdFilter} onValueChange={(v) => setExamTypeIdFilter(v)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Exam Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Exam Types</SelectItem>
                  {examTypes.map((t) => (
                    <SelectItem key={t._id} value={t._id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <Select value={classId} onValueChange={(v) => setClassId(v)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-44">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  {EXAM_STATUSES.map((st) => (
                    <SelectItem key={st} value={st} className="text-xs">
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table or Custom Empty State */}
      {!loading && data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-12 text-center bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm/40">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-semibold text-foreground">No exams created yet</h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            Create your first exam to schedule subjects, collect dedicated exam fees, issue admit cards and publish
            results.
          </p>
          {canCreate && (
            <Button size="sm" onClick={openCreate} className="mt-5">
              <Plus className="mr-2 h-4 w-4" /> Create Exam
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          pagination={pagination}
          rowKey={(r) => r._id}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        />
      )}

      {/* Create / Edit Exam Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Examination' : 'Create Examination'}</DialogTitle>
            <DialogDescription>
              Define the exam parameters, class assignment, schedule window, and admit card fee clearance rules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveExam} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="examName">Exam Name *</Label>
              <Input
                id="examName"
                placeholder="e.g. Final Examination 2026"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="examType">Exam Type</Label>
                <Select value={selectedExamTypeId} onValueChange={setSelectedExamTypeId}>
                  <SelectTrigger id="examType">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Standard / None</SelectItem>
                    {examTypes
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Exam Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="session">Academic Session *</Label>
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={Boolean(editing)}>
                  <SelectTrigger id="session">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>


                <div className="space-y-1.5 col-span-2">
                  <Label>Target Classes *</Label>
                  <div className="border rounded-xl p-3 space-y-3 bg-card/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Select classes and set optional exam fees.</span>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Bulk fee (PKR)"
                          className="h-7 text-xs w-28"
                          value={bulkFee}
                          onChange={(e) => setBulkFee(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (!bulkFee) return;
                            const newFees = { ...classFees };
                            selectedClassIds.forEach(id => {
                              newFees[id] = bulkFee;
                            });
                            setClassFees(newFees);
                          }}
                        >
                          Apply to Selected
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {classes.map((c) => {
                        const isSelected = selectedClassIds.includes(c._id);
                        const fee = classFees[c._id];
                        return (
                          <div key={c._id} className={`flex items-center justify-between border rounded-lg p-2 transition-colors ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/60 hover:border-primary/20'}`}>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`class-${c._id}`}
                                checked={isSelected}
                                onCheckedChange={(chk) => {
                                  if (chk) setSelectedClassIds(prev => [...prev, c._id]);
                                  else setSelectedClassIds(prev => prev.filter(id => id !== c._id));
                                }}
                              />
                              <Label htmlFor={`class-${c._id}`} className="text-xs font-semibold cursor-pointer">{c.name}</Label>
                            </div>
                            {isSelected && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-auto px-1.5 text-[10px] gap-1 shrink-0 text-muted-foreground hover:text-primary">
                                    <Banknote className="h-3 w-3" />
                                    {fee ? `Rs. ${fee}` : 'No Fee'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-3" align="end">
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-xs leading-none">Exam Fee (PKR)</h4>
                                    <p className="text-[10px] text-muted-foreground leading-snug">Fee for {c.name}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                      <Input
                                        type="number"
                                        className="h-7 text-xs"
                                        placeholder="0"
                                        value={fee || ''}
                                        onChange={(e) => setClassFees(prev => ({ ...prev, [c._id]: e.target.value }))}
                                      />
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
            </div>

            {!editing && (
              <div className="space-y-1.5 border rounded-lg p-3 bg-muted/10 border-border/80">
                <Label htmlFor="examFeeDueDate" className="text-sm font-semibold">Exam Fee Due Date (Optional)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Generated Student Exam Fees will use this due date.
                </p>
                <Input
                  id="examFeeDueDate"
                  type="date"
                  value={examFeeDueDate}
                  onChange={(e) => setExamFeeDueDate(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="gradeScale">Grading Scale</Label>
              <Select value={selectedGradeScaleId} onValueChange={setSelectedGradeScaleId}>
                <SelectTrigger id="gradeScale">
                  <SelectValue placeholder="Select grading scale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    {gradeScales.find((g) => g.isDefault)
                      ? `Default (${gradeScales.find((g) => g.isDefault)?.name})`
                      : 'School Default (Standard A+ to F)'}
                  </SelectItem>
                  {gradeScales.map((scale) => (
                    <SelectItem key={scale._id} value={scale._id}>
                      {scale.name} {scale.isDefault ? '(Default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Automatic letter grading and rank calculations are evaluated against this grading scale.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Description / Instructions</Label>
              <Textarea
                id="desc"
                rows={2}
                placeholder="Optional notes or instructions for teachers and students..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Fee Clearance Requirement */}
            <div className="rounded-lg border border-border/80 p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Require Exam Fee Clearance For Admit Cards</p>
                  <p className="text-[11px] text-muted-foreground">
                    If ON, students with unpaid exam fees will be blocked from downloading/printing admit cards until cleared or overridden.
                  </p>
                </div>
                <Switch
                  checked={requireFeeBeforeAdmitCard}
                  onCheckedChange={setRequireFeeBeforeAdmitCard}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving...' : editing ? 'Update Exam' : 'Create Exam'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Exam Types Dialog */}
      <Dialog open={typesModalOpen} onOpenChange={setTypesModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Exam Types</DialogTitle>
            <DialogDescription>
              Configure school exam classifications (Monthly Test, Midterm, Final Exam, Mock Exam, etc.).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateType} className="space-y-3 pt-1">
            <div className="flex gap-2">
              <Input
                placeholder="New exam type (e.g. Unit Test)"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="flex-1"
                required
              />
              <Button type="submit" size="sm">
                Add Type
              </Button>
            </div>
            <Input
              placeholder="Optional description"
              value={newTypeDescription}
              onChange={(e) => setNewTypeDescription(e.target.value)}
              className="text-xs"
            />
          </form>

          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
            {examTypes.map((t) => (
              <div
                key={t._id}
                className="flex items-center justify-between rounded-lg border border-border/70 p-2.5 text-xs bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm"
              >
                <div>
                  <p className="font-semibold">{t.name}</p>
                  {t.description && <p className="text-[11px] text-muted-foreground">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.isActive ? 'default' : 'secondary'} className="text-[10px]">
                    {t.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleType(t._id)}
                    className="h-7 text-xs px-2"
                  >
                    {t.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setTypesModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Restore Exam' : 'Archive Exam'}
        description={`Are you sure you want to ${archiveTarget?.isArchived ? 'restore' : 'archive'} "${archiveTarget?.name}"?`}
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        destructive={!archiveTarget?.isArchived}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={Boolean(publishTarget)}
        onOpenChange={(open) => !open && setPublishTarget(null)}
        title={publishTarget?.isPublished ? 'Unpublish Results' : 'Publish Results'}
        description={
          publishTarget?.isPublished
            ? 'Hiding results will prevent students from viewing their marks and rank.'
            : 'Publishing will make final results and rank visible to enrolled students.'
        }
        confirmLabel={publishTarget?.isPublished ? 'Unpublish' : 'Publish'}
        onConfirm={handlePublish}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Examination"
        description={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
