import { RevealCard } from '@/components/motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Pencil, Mail, Phone, BadgeCheck, Calendar, Briefcase, Banknote, User } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiDataResponse } from '@/lib/api';
import { formatDate, formatCurrency, toPaisa, initials } from '@/lib/format';
import { LoadingOverlay } from '@/components/DataTable';

interface StaffDetail {
  _id: string; employeeId: string; fullName: string; fatherName: string; caste: string; profilePhotoUrl: string | null;
  email: string | null; phone: string | null; qualification: string | null; joiningDate: string;
  designation: string; staffType: 'teaching' | 'non_teaching';
  salary?: number;
  isActive: boolean; isArchived: boolean;
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
  designation: z.string().trim().min(1, 'Designation required'),
});
type FormValues = z.infer<typeof schema>;

export function StaffProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const isNew = id === 'new' || !id || location.pathname.endsWith('/new');
  const editMode = params.get('edit') === '1' || isNew;
  const { can, loading: authLoading } = useAuth();

  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  const canEdit = can('users', isNew ? 'create' : 'edit');
  const canSeeSalary = can('salaries', 'view');

  const load = useCallback(async () => {
    if (!id || isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<ApiDataResponse<StaffDetail>>(`/staff/${id}`);
      setStaff(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      navigate('/staff');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, navigate]);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return <LoadingOverlay label="Loading..." />;
  if (isNew && !canEdit) return <LoadingOverlay label="Not authorized" />;

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add staff' : staff?.fullName ?? 'Staff profile'}
        description={isNew ? 'Create a new non-teaching staff record.' : staff ? `${staff.employeeId} · joined ${formatDate(staff.joiningDate)}` : 'Loading staff profile…'}
        crumbs={[{ label: 'Staff', to: '/staff' }, { label: isNew ? 'New staff' : 'Profile' }]}
        actions={
          !isNew && staff && (
            <div className="flex gap-2">
              {canEdit && !editMode && (
                <Button variant="outline" onClick={() => navigate(`/staff/${id}?edit=1`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate('/staff')} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      />

      {isNew ? (
        <StaffForm
          canSeeSalary={canSeeSalary}
          onSubmit={async (values) => {
            setSubmitting(true);
            try {
              const created = await api.post<ApiDataResponse<{ _id: string }>>('/staff', {
                ...values,
                salary: toPaisa(values.salary ?? 0),
                staffType: 'non_teaching',
              });
              toast.success('Staff added');
              navigate(`/staff/${created.data.data._id}`);
            } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSubmitting(false); }
          }}
          submitting={submitting}
        />
      ) : loading ? (
        <LoadingOverlay label="Loading profile…" />
      ) : staff ? (
        editMode && canEdit ? (
          <StaffForm
            initial={staff}
            canSeeSalary={canSeeSalary}
            onSubmit={async (values) => {
              setSubmitting(true);
              try {
                await api.patch(`/staff/${staff._id}`, {
                  ...values,
                  salary: toPaisa(values.salary ?? 0),
                });
                toast.success('Staff updated');
                navigate(`/staff/${staff._id}`);
              } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSubmitting(false); }
            }}
            submitting={submitting}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <RevealCard className="lg:col-span-1">
              <CardContent className="flex flex-col items-center pt-6 text-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="bg-primary/10 text-2xl text-primary">{initials(staff.fullName)}</AvatarFallback>
                </Avatar>
                <h2 className="mt-3 text-lg font-semibold">{staff.fullName}</h2>
                <p className="text-sm text-muted-foreground">{staff.employeeId}</p>
                <div className="mt-2 flex gap-1.5">
                  <Badge variant={staff.isActive ? 'success' : 'muted'}>{staff.isActive ? 'Active' : 'Inactive'}</Badge>
                  {staff.isArchived && <Badge variant="destructive">Archived</Badge>}
                </div>
                <div className="mt-4 w-full space-y-2 text-left text-sm">
                  <InfoRow icon={User} label="Father Name" value={staff.fatherName ?? '—'} />
                  <InfoRow icon={User} label="Caste" value={staff.caste ?? '—'} />
                  <InfoRow icon={Mail} label="Email" value={staff.email ?? '—'} />
                  <InfoRow icon={Phone} label="Phone" value={staff.phone ?? '—'} />
                  <InfoRow icon={BadgeCheck} label="Qualification" value={staff.qualification ?? '—'} />
                  <InfoRow icon={Calendar} label="Joined" value={formatDate(staff.joiningDate)} />
                  {canSeeSalary && staff.salary !== undefined && (
                    <InfoRow icon={Banknote} label="Salary" value={`${formatCurrency(staff.salary)} / month`} />
                  )}
                </div>
              </CardContent>
            </RevealCard>

            <RevealCard className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Employment</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" /> Designation
                    </p>
                    <Badge variant="outline" className="text-sm">{staff.designation}</Badge>
                  </div>
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

function StaffForm({ initial, canSeeSalary, onSubmit, submitting }: {
  initial?: StaffDetail;
  canSeeSalary: boolean;
  onSubmit: (values: FormValues) => Promise<void>;
  submitting: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      employeeId: '', fullName: '', fatherName: '', caste: '', email: '', phone: '',
      qualification: '', joiningDate: '', salary: 0, designation: '',
    },
  });

  useEffect(() => {
    reset(initial ? {
      employeeId: initial.employeeId, fullName: initial.fullName, fatherName: initial.fatherName ?? '', caste: initial.caste ?? '',
      email: initial.email ?? '', phone: initial.phone ?? '', designation: initial.designation ?? '',
      qualification: initial.qualification ?? '', joiningDate: initial.joiningDate.slice(0, 10),
      salary: initial.salary !== undefined ? initial.salary / 100 : 0,
    } : {
      employeeId: '', fullName: '', fatherName: '', caste: '', email: '', phone: '', designation: '',
      qualification: '', joiningDate: '', salary: 0,
    });
  }, [initial, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-2">
      <RevealCard>
        <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
        <CardContent className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input {...register('fullName')} />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Father name *</Label>
              <Input {...register('fatherName')} />
              {errors.fatherName && <p className="text-xs text-destructive">{errors.fatherName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Caste *</Label>
              <Input {...register('caste')} />
              {errors.caste && <p className="text-xs text-destructive">{errors.caste.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Employee ID *</Label>
            <Input placeholder="S-1001" {...register('employeeId')} />
            {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
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
            <Label>Designation *</Label>
            <Select value={watch('designation') || undefined} onValueChange={(v) => setValue('designation', v)}>
              <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Accountant">Accountant</SelectItem>
                <SelectItem value="Receptionist">Receptionist</SelectItem>
                <SelectItem value="Peon">Peon</SelectItem>
                <SelectItem value="Clerk">Clerk</SelectItem>
                <SelectItem value="Security Guard">Security Guard</SelectItem>
                <SelectItem value="Cleaner">Cleaner</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.designation && <p className="text-xs text-destructive">{errors.designation.message}</p>}
          </div>
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
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : initial ? 'Save changes' : 'Add staff'}</Button>
      </div>
    </form>
  );
}
