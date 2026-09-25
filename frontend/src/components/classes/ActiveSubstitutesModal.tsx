import { useState, useEffect, useCallback } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { formatDate } from '@/lib/format';

interface TemporaryAssignment {
  _id: string;
  substituteTeacherName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'cancelled';
  createdAt: string;
}

export function ActiveSubstitutesModal({
  open,
  onOpenChange,
  classId,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string | null;
  className: string;
}) {
  const [assignments, setAssignments] = useState<TemporaryAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId || !open) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: TemporaryAssignment[] }>(`/classes/${classId}/substitutes`);
      setAssignments(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [classId, open]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.patch(`/classes/substitutes/${id}/cancel`);
      toast.success('Assignment cancelled successfully');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Substitute Teachers History</DialogTitle>
          <DialogDescription>
            History of temporary assignments for <span className="font-semibold text-foreground">{className}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : assignments.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground bg-muted/30 rounded-lg border">
              No substitute history found for this class.
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {assignments.map(a => (
                <div key={a._id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium">{a.substituteTeacherName}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatDate(a.startDate)}
                      {a.startDate !== a.endDate ? ` to ${formatDate(a.endDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={a.status === 'active' ? 'success' : a.status === 'cancelled' ? 'destructive' : 'secondary'}
                    >
                      {a.status}
                    </Badge>
                    {a.status === 'active' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleCancel(a._id)}
                        disabled={cancellingId === a._id}
                      >
                        {cancellingId === a._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
