import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserMinus } from 'lucide-react';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';

interface TeacherOption {
  _id: string;
  fullName: string;
  employeeId: string;
}

const schema = z.object({
  teacherId: z.string().min(1, 'Please select a teacher'),
});

type FormValues = z.infer<typeof schema>;

export function ManageClassTeacherModal({
  open,
  onOpenChange,
  classId,
  className,
  currentTeacherId,
  currentTeacherName,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string | null;
  className: string;
  currentTeacherId?: string | null;
  currentTeacherName?: string | null;
  onAssigned?: () => void;
}) {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { teacherId: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ teacherId: currentTeacherId || '' });
      setLoading(true);
      api.get<ApiListResponse<TeacherOption>>('/teachers?limit=200&status=active')
        .then(res => setTeachers(res.data.data))
        .catch(err => toast.error(apiErrorMessage(err)))
        .finally(() => setLoading(false));
    }
  }, [open, reset, currentTeacherId]);

  const onSubmit = async (values: FormValues) => {
    if (!classId) return;
    setSubmitting(true);
    try {
      await api.post(`/classes/${classId}/class-teacher`, { teacherId: values.teacherId });
      toast.success('Class Teacher assigned successfully');
      if (onAssigned) onAssigned();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassign = async () => {
    if (!classId) return;
    setSubmitting(true);
    try {
      await api.delete(`/classes/${classId}/class-teacher`);
      toast.success('Class Teacher unassigned successfully');
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
          <DialogTitle>Manage Class Teacher</DialogTitle>
          <DialogDescription>
            Assign or change the permanent class teacher for <span className="font-semibold text-foreground">{className}</span>.
          </DialogDescription>
        </DialogHeader>
        
        {currentTeacherId && (
          <div className="rounded-md border p-4 bg-muted/30 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Current Class Teacher</p>
              <p className="font-semibold">{currentTeacherName}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleUnassign} disabled={submitting}>
              <UserMinus className="h-4 w-4 mr-2" />
              Unassign
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{currentTeacherId ? 'Change to Teacher *' : 'Select Teacher *'}</Label>
            {loading ? (
              <div className="h-10 rounded-md border flex items-center px-3 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Loading teachers...</div>
            ) : (
              <Select value={watch('teacherId')} onValueChange={v => setValue('teacherId', v)}>
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
            {errors.teacherId && <p className="text-xs text-destructive">{errors.teacherId.message}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || loading || watch('teacherId') === currentTeacherId}>
              {submitting ? 'Saving...' : 'Save Assignment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
