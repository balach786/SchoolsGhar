import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';

interface TeacherOption {
  _id: string;
  fullName: string;
  employeeId: string;
}

const schema = z.object({
  substituteTeacherId: z.string().min(1, 'Please select a substitute teacher'),
  duration: z.enum(['one_day', 'multiple_days']),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.duration === 'multiple_days') {
    if (!data.endDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required for multiple days', path: ['endDate'] });
    } else if (new Date(data.startDate) > new Date(data.endDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date must be after start date', path: ['endDate'] });
    }
  }
});

type FormValues = z.infer<typeof schema>;

export function AssignSubstituteModal({
  open,
  onOpenChange,
  classId,
  className,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string | null;
  className: string;
  onAssigned?: () => void;
}) {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { substituteTeacherId: '', duration: 'one_day', startDate: '', endDate: '' },
  });

  const durationType = watch('duration');

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      reset({ substituteTeacherId: '', duration: 'one_day', startDate: today, endDate: today });
      setLoading(true);
      api.get<ApiListResponse<TeacherOption>>('/teachers?limit=200&status=active')
        .then(res => setTeachers(res.data.data))
        .catch(err => toast.error(apiErrorMessage(err)))
        .finally(() => setLoading(false));
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!classId) return;
    setSubmitting(true);
    try {
      const payload = {
        substituteTeacherId: values.substituteTeacherId,
        startDate: values.startDate,
        endDate: values.duration === 'one_day' ? values.startDate : values.endDate,
      };
      await api.post(`/classes/${classId}/substitutes`, payload);
      toast.success('Substitute assigned successfully');
      if (onAssigned) onAssigned();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Temporary Substitute</DialogTitle>
          <DialogDescription>
            Grant temporary attendance marking access for <span className="font-semibold text-foreground">{className}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Substitute Teacher *</Label>
            {loading ? (
              <div className="h-10 rounded-md border flex items-center px-3 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Loading teachers...</div>
            ) : (
              <Select value={watch('substituteTeacherId')} onValueChange={v => setValue('substituteTeacherId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t._id} value={t._id}>{t.fullName} ({t.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.substituteTeacherId && <p className="text-xs text-destructive">{errors.substituteTeacherId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Duration Type</Label>
            <Select value={durationType} onValueChange={(v: string) => setValue('duration', v as 'one_day' | 'multiple_days')}>
              <SelectTrigger>
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_day">One Day</SelectItem>
                <SelectItem value="multiple_days">Multiple Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{durationType === 'one_day' ? 'Date *' : 'Start Date *'}</Label>
              <div className="relative">
                <Input type="date" {...register('startDate')} className="pl-9" />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
            </div>
            
            {durationType === 'multiple_days' && (
              <div className="space-y-2">
                <Label>End Date *</Label>
                <div className="relative">
                  <Input type="date" {...register('endDate')} className="pl-9" />
                  <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || loading}>
              {submitting ? 'Assigning...' : 'Assign Substitute'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
