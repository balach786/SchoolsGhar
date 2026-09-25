import { RevealCard, StaggerContainer, StaggerItem } from '@/components/motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Pencil, Mail, Phone, BadgeCheck, Calendar, GraduationCap, BookOpen, School, Banknote, X, Key } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatDate, formatCurrency, toPaisa, initials } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { LoadingOverlay } from '@/components/DataTable';

interface ClassLite { _id: string; name: string; sessionId: string }
interface SubjectLite { _id: string; name: string; code: string }
interface TeacherDetail {
  _id: string; employeeId: string; fullName: string; fatherName: string; caste: string; profilePhotoUrl: string | null;
  email: string | null; phone: string | null; qualification: string | null; joiningDate: string;
  salary?: number;
  className?: string;
  isActive: boolean; isArchived: boolean;
  userId?: string | null;
}

const schema = z.object({
  employeeId: z.string().trim().min(1, 'Employee ID required').max(20),
  fullName: z.string().trim().min(2, 'Full name required').max(80),
  fatherName: z.string().trim().min(2, 'Father name required').max(80),
  caste: z.string().trim().min(2, 'Caste required').max(80),
  email: z.string().trim().email('Invalid email').max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(24).optional().or(z.literal('')),
  qualification: z.string().trim().max(120).optional().or(z.literal('')),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required'),
  salary: z.coerce.number().min(0, 'Cannot be negative').optional().default(0),
  createLogin: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.createLogin && !data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email is required when creating a login account',
      path: ['email'],
    });
  }
});
type FormValues = z.infer<typeof schema>;

export function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isMyProfile = location.pathname.includes('/my-profile');
  const [params] = useSearchParams();
  const isNew = id === 'new' || (!id && !isMyProfile) || location.pathname.endsWith('/new');
  const editMode = params.get('edit') === '1' || isNew;
  const { can, loading: authLoading } = useAuth();

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canEdit = isMyProfile ? false : can('teachers', isNew ? 'create' : 'edit');
  const canSeeSalary = isMyProfile ? false : can('salaries', 'view');

  const load = useCallback(async () => {
    if (!id && !isMyProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const endpoint = isMyProfile ? '/teachers/me' : `/teachers/${id}`;
      const [res, classesRes] = await Promise.all([
        !isNew ? api.get<ApiDataResponse<TeacherDetail>>(endpoint) : Promise.resolve(null),
        api.get<ApiListResponse<ClassLite>>('/classes?limit=200&status=active')
      ]);
      if (res) setTeacher(res.data.data);
      if (classesRes) setClasses(classesRes.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, isMyProfile, navigate]);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return <LoadingOverlay label="Loading..." />;
  if (isNew && !canEdit) return <LoadingOverlay label="Not authorized" />;

  return (
    <div>
      <PageHeader
        title={isMyProfile ? 'My Profile' : isNew ? 'Add teacher' : teacher?.fullName ?? 'Teacher profile'}
        description={isNew ? 'Create a new faculty record.' : teacher ? `${teacher.employeeId} · joined ${formatDate(teacher.joiningDate)}` : 'Loading teacher profile…'}
        crumbs={
          isMyProfile 
            ? [{ label: 'My Profile' }] 
            : [{ label: 'Teachers', to: '/teachers' }, { label: isNew ? 'New teacher' : 'Profile' }]
        }
        actions={
          !isNew && teacher && (
            <div className="flex gap-2">
              {canEdit && !editMode && (
                <Button variant="outline" onClick={() => navigate(`/teachers/${id}?edit=1`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              {!isMyProfile && (
                <Button variant="ghost" size="icon" onClick={() => navigate('/teachers')} aria-label="Back">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )
        }
      />

      {isNew ? (
        <TeacherForm
          classes={classes} subjects={subjects} canSeeSalary={canSeeSalary}
          onSubmit={async (values) => {
            setSubmitting(true);
            try {
              const created = await api.post<ApiDataResponse<{ _id: string; tempPassword?: string }>>('/teachers', {
                ...values,
                salary: toPaisa(values.salary ?? 0),
              });
              const tempPass = created.data.data.tempPassword;
              if (tempPass) {
                toast.success('Teacher added & Login created!', { description: `Temporary password: ${tempPass}` });
              } else {
                toast.success('Teacher added');
              }
              navigate(`/teachers/${created.data.data._id}`);
            } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSubmitting(false); }
          }}
          submitting={submitting}
        />
      ) : loading ? (
        <LoadingOverlay label="Loading profile…" />
      ) : teacher ? (
        editMode && canEdit ? (
          <TeacherForm
            initial={teacher}
            classes={classes} subjects={subjects} canSeeSalary={canSeeSalary}
            onSubmit={async (values) => {
              setSubmitting(true);
              try {
                const res = await api.patch<ApiDataResponse<{ _id: string; tempPassword?: string }>>(`/teachers/${teacher._id}`, {
                  ...values,
                  salary: toPaisa(values.salary ?? 0),
                });
                const tempPass = res.data.data.tempPassword;
                if (tempPass) {
                  toast.success('Teacher updated & Login created!', { description: `Temporary password: ${tempPass}` });
                } else {
                  toast.success('Teacher updated');
                }
                navigate(`/teachers/${teacher._id}`);
              } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSubmitting(false); }
            }}
            submitting={submitting}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <RevealCard>
              <CardContent className="flex flex-col items-center pt-6 text-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="bg-primary/10 text-2xl text-primary">{initials(teacher.fullName)}</AvatarFallback>
                </Avatar>
                <h2 className="mt-3 text-lg font-semibold">{teacher.fullName}</h2>
                <p className="text-sm text-muted-foreground">{teacher.employeeId}</p>
                <div className="mt-2 flex gap-1.5">
                  <Badge variant={teacher.isActive ? 'success' : 'muted'}>{teacher.isActive ? 'Active' : 'Inactive'}</Badge>
                  {teacher.userId && <Badge variant="secondary"><Key className="h-3 w-3 mr-1"/> Login Active</Badge>}
                  {teacher.isArchived && <Badge variant="destructive">Archived</Badge>}
                </div>
                <div className="mt-4 w-full space-y-2 text-left text-sm">
                  <InfoRow icon={Pencil} label="Father Name" value={teacher.fatherName} />
                  <InfoRow icon={Pencil} label="Caste" value={teacher.caste} />
                  <InfoRow icon={Mail} label="Email" value={teacher.email ?? '—'} />
                  <InfoRow icon={Phone} label="Phone" value={teacher.phone ?? '—'} />
                  <InfoRow icon={BadgeCheck} label="Qualification" value={teacher.qualification ?? '—'} />
                  <InfoRow icon={GraduationCap} label="Class Teacher For" value={teacher.className ?? "—"} />
                  <InfoRow icon={Calendar} label="Joined" value={formatDate(teacher.joiningDate)} />
                  {canSeeSalary && teacher.salary !== undefined && (
                    <InfoRow icon={Banknote} label="Salary" value={`${formatCurrency(teacher.salary)} / month`} />
                  )}
                </div>
              </CardContent>
            </RevealCard>


          </div>
        )
      ) : null}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
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

function TeacherForm({ initial, classes, subjects, canSeeSalary, onSubmit, submitting }: {
  initial?: TeacherDetail;
  classes: ClassLite[]; subjects: SubjectLite[]; canSeeSalary: boolean;
  onSubmit: (values: FormValues) => Promise<void>;
  submitting: boolean;
}) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      employeeId: '', fullName: '', fatherName: '', caste: '', email: '', phone: '',
      qualification: '', joiningDate: '', salary: 0,
    },
  });


  useEffect(() => {
    reset(initial ? {
      employeeId: initial.employeeId, fullName: initial.fullName,
      fatherName: initial.fatherName, caste: initial.caste,
      email: initial.email ?? '', phone: initial.phone ?? '',
      qualification: initial.qualification ?? '', joiningDate: initial.joiningDate.slice(0, 10),
      salary: initial.salary !== undefined ? initial.salary / 100 : 0,
      createLogin: false,
    } : {
      employeeId: '', fullName: '', fatherName: '', caste: '', email: '', phone: '',
      qualification: '', joiningDate: '', salary: 0,
      createLogin: false,
    });

  }, [initial, reset]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v))} className="grid gap-4 lg:grid-cols-2">
      <RevealCard>
        <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
        <CardContent className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input placeholder="e.g. Fatima Siddiqui" {...register('fullName')} />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Father Name *</Label>
              <Input placeholder="e.g. Tariq Siddiqui" {...register('fatherName')} />
              {errors.fatherName && <p className="text-xs text-destructive">{errors.fatherName.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Caste *</Label>
              <Input placeholder="e.g. Siddiqui" {...register('caste')} />
              {errors.caste && <p className="text-xs text-destructive">{errors.caste.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Employee ID *</Label>
              <Input placeholder="T-1001" {...register('employeeId')} />
              {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="name@school.edu.pk" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="03xx-xxxxxxx" {...register('phone')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Qualification</Label>
            <Input placeholder="M.Sc. Mathematics" {...register('qualification')} />
          </div>

        </CardContent>
      </RevealCard>

      <RevealCard>
        <CardHeader><CardTitle className="text-base">Employment</CardTitle></CardHeader>
        <CardContent className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Joining date *</Label>
            <Input type="date" {...register('joiningDate')} />
            {errors.joiningDate && <p className="text-xs text-destructive">{errors.joiningDate.message}</p>}
          </div>
          {canSeeSalary && (
            <div className="space-y-1.5">
              <Label>Monthly salary (PKR)</Label>
              <Input type="number" min={0} step="any" placeholder="85000" {...register('salary')} />
              {errors.salary && <p className="text-xs text-destructive">{errors.salary.message}</p>}
            </div>
          )}

        </CardContent>
      </RevealCard>

      <div className="lg:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => window.history.back()} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : initial ? 'Save changes' : 'Add teacher'}</Button>
      </div>
    </form>
  );
}
