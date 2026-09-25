import { RevealCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { StudentRecordPanel } from '@/components/StudentRecordPanel';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Pencil, Archive, ArchiveRestore, Mail, Phone, User, Users, Calendar,
  GraduationCap, BadgeCheck, FileText, History,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { LoadingOverlay } from '@/components/DataTable';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionLite { _id: string; name: string; classId: string }
interface HistoryRow { _id: string; sessionId: string; classId: string; sectionId: string; status: string; date: string; sessionName: string; className: string; sectionName: string }
interface StudentDetail {
  _id: string; admissionNumber: string; rollNumber: string; fullName: string;
  profilePhotoUrl: string | null; gender: string; dateOfBirth: string; email: string | null; phone: string | null;
  fatherName: string | null; caste: string | null;
  guardianName: string; guardianPhone: string | null; guardianRelationship: string | null;
  address: string | null; admissionDate: string; previousSchool: string | null;
  sessionId: string; classId: string; sectionId: string;
  sessionName: string; className: string; sectionName: string;
  documents: { name: string; fileUrl: string; mimeType?: string; fileSize?: number }[];
  isActive: boolean; isArchived: boolean; history: HistoryRow[];
}

function getSchoolTodayISO(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

const schema = z.object({
  admissionNumber: z.string().trim().max(24).optional().or(z.literal('')),
  rollNumber: z.string().trim().max(12).optional().or(z.literal('')),
  fullName: z.string().trim().min(2, 'Full name required').max(80),
  profilePhotoUrl: z.string().url('Must be a URL').max(500).optional().or(z.literal('')),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required'),
  email: z.string().trim().email('Invalid email').max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(24).optional().or(z.literal('')),
  fatherName: z.string().trim().max(80).optional().or(z.literal('')),
  caste: z.string().trim().max(60).optional().or(z.literal('')),
  guardianName: z.string().trim().min(2, 'Guardian name required').max(80),
  guardianPhone: z.string().trim().max(24).optional().or(z.literal('')),
  guardianRelationship: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required'),
  previousSchool: z.string().trim().max(100).optional().or(z.literal('')),
  sessionId: z.string().min(1, 'Select a session'),
  classId: z.string().min(1, 'Select a class'),
  sectionId: z.string().optional().or(z.literal('')),
  confirmDuplicate: z.boolean().optional(),
  isAutoAdmissionNumber: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export function StudentProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const isNew = id === 'new' || !id || location.pathname.endsWith('/new');
  const editMode = params.get('edit') === '1' || isNew;
  const { can, loading: authLoading } = useAuth();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [archiveTarget, setArchiveTarget] = useState(false);
  const [pendingDuesWarning, setPendingDuesWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ message: string; values: FormValues } | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const canEdit = can('students', isNew ? 'create' : 'edit');
  const canArchive = can('students', 'archive');

  const loadContext = useCallback(() => {
    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => setSessions(r.data.data.filter((s) => !s.isArchived))).catch(() => {});
    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => setClasses(r.data.data)).catch(() => {});
    api.get<ApiListResponse<SectionLite>>('/sections/lookup').then((r) => setSections(r.data.data)).catch(() => {});
  }, []);

  const loadStudent = useCallback(async () => {
    if (!id || isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<ApiDataResponse<StudentDetail>>(`/students/${id}`);
      setStudent(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      navigate('/students');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, navigate]);

  useEffect(() => { if (canEdit || isNew) loadContext(); }, [canEdit, isNew, loadContext]);
  useEffect(() => { loadStudent(); }, [loadStudent]);

  if (authLoading) return <LoadingOverlay label="Loading..." />;
  if (isNew && !canEdit) return <LoadingOverlay label="Not authorized" />;

  return (
    <div>
      <PageHeader
        title={isNew ? 'Admit student' : student?.fullName ?? 'Student profile'}
        description={isNew ? 'Create a new admission record.' : student ? `${student.admissionNumber} · ${student.className}${student.sectionName ? ` · Section ${student.sectionName}` : ''} · ${student.sessionName}` : 'Loading student profile…'}
        crumbs={[{ label: 'Students', to: '/students' }, { label: isNew ? 'New admission' : 'Profile' }]}
        actions={
          !isNew && student && (
            <div className="flex gap-2">
              {canEdit && !editMode && (
                <Button variant="outline" onClick={() => navigate(`/students/${id}?edit=1`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              {canArchive && !student.isArchived && (
                <Button variant="outline" onClick={() => setArchiveTarget(true)}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              )}
              {canArchive && student.isArchived && (
                <Button variant="outline" onClick={async () => {
                  try { await api.post(`/students/${id}/restore`); toast.success('Student restored'); loadStudent(); }
                  catch (e) { toast.error(apiErrorMessage(e)); }
                }}>
                  <ArchiveRestore className="h-4 w-4" /> Restore
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate('/students')} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />

      {isNew ? (
        <StudentForm
          isNew={true}
          sessions={sessions} classes={classes} sections={sections}
          onRequestCancel={(dirty) => {
            if (dirty) setShowUnsavedDialog(true);
            else navigate('/students');
          }}
          onSubmit={async (values, setFormError) => {
            setSubmitting(true);
            try {
              const created = await api.post<ApiDataResponse<{ _id: string }>>('/students', values);
              toast.success('Student admitted');
              navigate(`/students/${created.data.data._id}`);
            } catch (err: any) {
              const code = err?.response?.data?.error?.code;
              const msg = apiErrorMessage(err);
              if (code === 'POSSIBLE_DUPLICATE_STUDENT') {
                setDuplicateWarning({ message: msg, values });
              } else if (code === 'ADMISSION_NUMBER_TAKEN') {
                setFormError('admissionNumber', { type: 'manual', message: msg });
                toast.error(msg);
              } else if (code === 'ROLL_NUMBER_TAKEN') {
                setFormError('rollNumber', { type: 'manual', message: msg });
                toast.error(msg);
              } else {
                toast.error(msg);
              }
            } finally { setSubmitting(false); }
          }}
          submitting={submitting}
        />
      ) : loading ? (
        <LoadingOverlay label="Loading profile…" />
      ) : student ? (
        editMode && canEdit ? (
          <StudentForm
            initial={student}
            isNew={false}
            sessions={sessions} classes={classes} sections={sections}
            onRequestCancel={() => navigate(`/students/${student._id}`)}
            onSubmit={async (values, setFormError) => {
              setSubmitting(true);
              try {
                await api.patch(`/students/${student._id}`, values);
                toast.success('Student updated');
                navigate(`/students/${student._id}`);
              } catch (err: any) {
                const code = err?.response?.data?.error?.code;
                const msg = apiErrorMessage(err);
                if (code === 'ADMISSION_NUMBER_TAKEN') {
                  setFormError('admissionNumber', { type: 'manual', message: msg });
                } else if (code === 'ROLL_NUMBER_TAKEN') {
                  setFormError('rollNumber', { type: 'manual', message: msg });
                }
                toast.error(msg);
              } finally { setSubmitting(false); }
            }}
            submitting={submitting}
          />
        ) : (
          <Tabs defaultValue="overview">
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 lg:grid-cols-3">
                <RevealCard className="lg:col-span-1">
                  <CardContent className="flex flex-col items-center pt-6 text-center">
                    <Avatar className="h-24 w-24">
                      <AvatarFallback className="bg-primary/10 text-2xl text-primary">{initials(student.fullName)}</AvatarFallback>
                    </Avatar>
                    <h2 className="mt-3 text-lg font-semibold">{student.fullName}</h2>
                    <p className="text-sm text-muted-foreground">{student.admissionNumber}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Badge variant={student.isActive ? 'success' : 'muted'}>{student.isActive ? 'Active' : 'Inactive'}</Badge>
                      {student.isArchived && <Badge variant="destructive">Archived</Badge>}
                    </div>
                    <div className="mt-4 w-full space-y-2 text-left text-sm">
                      <InfoRow icon={GraduationCap} label="Class" value={`${student.className} · Section ${student.sectionName}`} />
                      <InfoRow icon={Calendar} label="Session" value={student.sessionName} />
                      <InfoRow icon={BadgeCheck} label="Roll number" value={student.rollNumber || '—'} />
                      <InfoRow icon={User} label="Gender" value={student.gender === 'male' ? 'Male' : 'Female'} />
                      <InfoRow icon={Calendar} label="Date of birth" value={formatDate(student.dateOfBirth)} />
                      <InfoRow icon={User} label="Father Name" value={student.fatherName || '—'} />
                      <InfoRow icon={User} label="Caste" value={student.caste || '—'} />
                      <InfoRow icon={Mail} label="Email" value={student.email ?? '—'} />
                      <InfoRow icon={Phone} label="Phone" value={student.phone ?? '—'} />
                    </div>
                  </CardContent>
                </RevealCard>

                <RevealCard className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Admission details</CardTitle></CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Field label="Admission date" value={formatDate(student.admissionDate)} />
                      <Field label="Previous school" value={student.previousSchool ?? '—'} />
                      <Field label="Address" value={student.address ?? '—'} />
                      <Field label="Documents" value={student.documents.length ? `${student.documents.length} file(s)` : 'None'} />
                    </dl>
                    {student.documents.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {student.documents.map((d, i) => (
                          <li key={i}>
                            <a href={d.fileUrl} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline">
                              <FileText className="h-3.5 w-3.5" /> {d.name}
                              {d.fileSize ? ` (${(d.fileSize / 1024).toFixed(0)} KB)` : ''}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </RevealCard>

                <RevealCard className="lg:col-span-3">
                  <CardHeader><CardTitle className="text-base">Guardian information</CardTitle></CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-3">
                      <Field label="Guardian name" value={student.guardianName} />
                      <Field label="Phone" value={student.guardianPhone ?? '—'} />
                      <Field label="Relationship" value={student.guardianRelationship ?? '—'} />
                    </dl>
                  </CardContent>
                </RevealCard>
              </div>
            </TabsContent>

            <TabsContent value="attendance">
              <StudentRecordPanel kind="attendance" studentId={student._id} sessionId={student.sessionId} classId={student.classId}/>
            </TabsContent>
            <TabsContent value="results">
              <StudentRecordPanel kind="results" studentId={student._id} sessionId={student.sessionId} classId={student.classId}/>
            </TabsContent>
            <TabsContent value="fees">
              <StudentRecordPanel kind="fees" studentId={student._id} sessionId={student.sessionId} classId={student.classId}/>
            </TabsContent>

            <TabsContent value="history">
              <RevealCard>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Academic history</CardTitle>
                </CardHeader>
                <CardContent>
                  {student.history.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No history records yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {student.history.map((h) => (
                        <div key={h._id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium">{h.sessionName}</p>
                            <p className="text-xs text-muted-foreground">{h.className} · Section {h.sectionName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatDate(h.date)}</span>
                            <Badge variant={h.status === 'admitted' ? 'success' : h.status === 'promoted' ? 'default' : 'warning'} className="capitalize">
                              {h.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </RevealCard>
            </TabsContent>
          </Tabs>
        )
      ) : null}

      <ConfirmDialog open={archiveTarget} onOpenChange={(o) => { setArchiveTarget(o); if (!o) setPendingDuesWarning(null); }}
        title="Archive this student?"
        description={
          pendingDuesWarning
            ? `⚠️ Outstanding dues detected: ${pendingDuesWarning}. Archiving will hide this student from active academic lists, but fee records will be preserved. Proceed?`
            : "The student will be hidden from active lists. Attendance, results and fee history are preserved."
        }
        confirmLabel={pendingDuesWarning ? "Archive with dues" : "Archive"}
        destructive loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.post(`/students/${id}/archive`, { confirmWithDues: !!pendingDuesWarning });
            toast.success('Student archived');
            setArchiveTarget(false);
            setPendingDuesWarning(null);
            loadStudent();
          } catch (err: any) {
            const code = err?.response?.data?.error?.code;
            const details = err?.response?.data?.error?.details;
            if (code === 'STUDENT_HAS_PENDING_DUES' && details?.pendingBalanceRs) {
              setPendingDuesWarning(`Rs ${details.pendingBalanceRs}`);
              toast.error(err.response.data.error.message || 'Student has outstanding fees');
            } else {
              toast.error(apiErrorMessage(err));
            }
          } finally { setBusy(false); }
        }} />

      <ConfirmDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title="Unsaved Admission"
        description="You have unsaved student information. Are you sure you want to leave?"
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        destructive={true}
        onConfirm={() => {
          setShowUnsavedDialog(false);
          navigate('/students');
        }}
      />

      <ConfirmDialog
        open={!!duplicateWarning}
        onOpenChange={(o) => { if (!o) setDuplicateWarning(null); }}
        title="Possible Duplicate Student"
        description={duplicateWarning?.message || 'A student with similar details already exists. Proceed with admission anyway?'}
        confirmLabel="Confirm Admission"
        cancelLabel="Cancel"
        destructive={false}
        loading={submitting}
        onConfirm={async () => {
          if (!duplicateWarning) return;
          const vals = { ...duplicateWarning.values, confirmDuplicate: true };
          setDuplicateWarning(null);
          setSubmitting(true);
          try {
            const created = await api.post<ApiDataResponse<{ _id: string }>>('/students', vals);
            toast.success('Student admitted');
            navigate(`/students/${created.data.data._id}`);
          } catch (err: any) {
            toast.error(apiErrorMessage(err));
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function StudentForm({ initial, isNew, sessions, classes, sections, onSubmit, onRequestCancel, submitting }: {
  initial?: StudentDetail;
  isNew?: boolean;
  sessions: SessionLite[]; classes: ClassLite[]; sections: SectionLite[];
  onSubmit: (values: FormValues, setError: UseFormSetError<FormValues>) => Promise<void>;
  onRequestCancel?: (isDirty: boolean) => void;
  submitting: boolean;
}) {
  const today = getSchoolTodayISO();
  const activeSession = sessions.find((s) => s.isActive);
  const { register, handleSubmit, reset, setValue, watch, setError, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      admissionNumber: '', rollNumber: '', fullName: '', profilePhotoUrl: '', gender: 'male',
      dateOfBirth: '', email: '', phone: '', fatherName: '', caste: '', guardianName: '', guardianPhone: '', guardianRelationship: 'Father',
      address: '', admissionDate: initial?.admissionDate ? initial.admissionDate.slice(0, 10) : today,
      previousSchool: '', sessionId: '', classId: '', sectionId: '',
    },
  });

  useEffect(() => {
    const todayStr = getSchoolTodayISO();
    reset(initial ? {
      admissionNumber: initial.admissionNumber, rollNumber: initial.rollNumber, fullName: initial.fullName,
      profilePhotoUrl: initial.profilePhotoUrl ?? '', gender: initial.gender as 'male' | 'female',
      dateOfBirth: initial.dateOfBirth.slice(0, 10), email: initial.email ?? '', phone: initial.phone ?? '',
      fatherName: initial.fatherName ?? '', caste: initial.caste ?? '',
      guardianName: initial.guardianName, guardianPhone: initial.guardianPhone ?? '',
      guardianRelationship: initial.guardianRelationship ?? '', address: initial.address ?? '',
      admissionDate: initial.admissionDate ? initial.admissionDate.slice(0, 10) : todayStr,
      previousSchool: initial.previousSchool ?? '',
      sessionId: initial.sessionId, classId: initial.classId, sectionId: initial.sectionId ?? '',
    } : {
      admissionNumber: '', rollNumber: '', fullName: '', profilePhotoUrl: '', gender: 'male',
      dateOfBirth: '', email: '', phone: '', fatherName: '', caste: '', guardianName: '', guardianPhone: '', guardianRelationship: 'Father',
      address: '', admissionDate: todayStr, previousSchool: '',
      sessionId: activeSession?._id ?? '',
      classId: '', sectionId: '',
    });
  }, [initial, reset, sessions, activeSession]);

  const suggestedNumberRef = useRef<string>('');

  // Auto-suggest next safe admission number for new admissions
  useEffect(() => {
    if (!isNew || initial) return;
    let mounted = true;
    api.get<{ data: { suggestedAdmissionNumber: string } }>('/students/suggested-admission-number')
      .then((res) => {
        if (mounted && res.data?.data?.suggestedAdmissionNumber) {
          suggestedNumberRef.current = res.data.data.suggestedAdmissionNumber;
          const currentAdm = watch('admissionNumber');
          if (!currentAdm) {
            setValue('admissionNumber', res.data.data.suggestedAdmissionNumber, { shouldValidate: false, shouldDirty: false });
          }
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [isNew, initial, setValue, watch]);

  // Unsaved form browser reload/tab close protection
  useEffect(() => {
    if (!isDirty || !isNew) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isNew]);

  const sessionId = watch('sessionId');
  const classId = watch('classId');
  const sessionClasses = classes.filter((c) => c.sessionId === sessionId);
  const classSections = sections.filter((s) => s.classId === classId);

  useEffect(() => {
    if (sessionClasses.length === 1 && !classId) {
      setValue('classId', sessionClasses[0]._id, { shouldValidate: true });
    }
  }, [sessionClasses, classId, setValue]);

  useEffect(() => {
    if (classSections.length === 1 && !watch('sectionId')) {
      setValue('sectionId', classSections[0]._id, { shouldValidate: true });
    }
  }, [classSections, setValue, watch]);

  return (
    <form
      onSubmit={handleSubmit((vals) => {
        if (isNew && (!vals.fatherName || vals.fatherName.trim().length < 2)) {
          setError('fatherName', { type: 'manual', message: 'Father name is required for new admissions (min 2 chars)' });
          return;
        }
        const isAuto = isNew && (!vals.admissionNumber || vals.admissionNumber === suggestedNumberRef.current);
        return onSubmit({ ...vals, isAutoAdmissionNumber: isAuto }, setError);
      })}
      className="grid gap-4 lg:grid-cols-2"
    >
      <RevealCard>
        <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
        <CardContent className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Full name *</Label>
            <Input {...register('fullName')} />
            {errors.fullName && <Err msg={errors.fullName.message} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gender *</Label>
              <Select value={watch('gender')} onValueChange={(v) => setValue('gender', v as 'male' | 'female')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth *</Label>
              <Input type="date" {...register('dateOfBirth')} />
              {errors.dateOfBirth && <Err msg={errors.dateOfBirth.message} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Father Name {isNew ? '*' : ''}</Label>
              <Input {...register('fatherName')} />
              {errors.fatherName && <Err msg={errors.fatherName.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Caste</Label>
              <Input {...register('caste')} />
              {errors.caste && <Err msg={errors.caste.message} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="student@example.com" {...register('email')} />
              {errors.email && <Err msg={errors.email.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="03xx-xxxxxxx" {...register('phone')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input placeholder="House, street, city" {...register('address')} />
          </div>
        </CardContent>
      </RevealCard>

      <RevealCard>
        <CardHeader><CardTitle className="text-base">Admission & placement</CardTitle></CardHeader>
        <CardContent className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Admission number *</Label>
              <Input placeholder="ADM-2026-0001" {...register('admissionNumber')} />
              {errors.admissionNumber && <Err msg={errors.admissionNumber.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Roll number</Label>
              <Input placeholder="12" {...register('rollNumber')} />
              {errors.rollNumber && <Err msg={errors.rollNumber.message} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Admission date *</Label>
              <Input type="date" {...register('admissionDate')} />
              {errors.admissionDate && <Err msg={errors.admissionDate.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Previous school</Label>
              <Input placeholder="Former school name" {...register('previousSchool')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Session *</Label>
            <Select value={sessionId || undefined} onValueChange={(v) => { setValue('sessionId', v, { shouldValidate: true }); setValue('classId', ''); setValue('sectionId', ''); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!activeSession && !initial && (
              <p className="text-xs text-destructive font-medium">No active academic session is configured.</p>
            )}
            {errors.sessionId && <Err msg={errors.sessionId.message} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select value={classId || undefined} onValueChange={(v) => { setValue('classId', v, { shouldValidate: true }); setValue('sectionId', ''); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {sessionClasses.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.classId && <Err msg={errors.classId.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Section {classSections.length > 0 ? '*' : '(Optional)'}</Label>
              <Select value={watch('sectionId') || undefined} onValueChange={(v) => setValue('sectionId', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder={classSections.length > 0 ? "Select section" : "No sections (Optional)"} /></SelectTrigger>
                <SelectContent>
                  {classSections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.sectionId && <Err msg={errors.sectionId.message} />}
            </div>
          </div>
        </CardContent>
      </RevealCard>

      <RevealCard className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Guardian information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Guardian name *</Label>
              <Input placeholder="Mr. Ahmed" {...register('guardianName')} />
              {errors.guardianName && <Err msg={errors.guardianName.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Guardian phone</Label>
              <Input placeholder="03xx-xxxxxxx" {...register('guardianPhone')} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input placeholder="Father / Mother / Uncle" {...register('guardianRelationship')} />
            </div>
          </div>
        </CardContent>
      </RevealCard>

      <div className="lg:col-span-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (onRequestCancel) onRequestCancel(isDirty);
            else window.history.back();
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : initial ? 'Save changes' : 'Admit student'}</Button>
      </div>
    </form>
  );
}

function Err({ msg }: { msg?: string }) {
  return <p className="text-xs text-destructive">{msg}</p>;
}
