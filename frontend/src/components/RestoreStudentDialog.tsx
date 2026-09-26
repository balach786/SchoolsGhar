import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, apiErrorMessage } from '@/lib/api';
import { toast } from '@/components/ui/sonner';

interface RestoreStudentDialogProps {
  studentId: string | null;
  studentName?: string;
  onClose: () => void;
  onSuccess: () => void;
  sessions: { _id: string; name: string; isActive?: boolean }[];
  classes: { _id: string; name: string; sessionId: string }[];
  sections: { _id: string; name: string; classId: string }[];
}

export function RestoreStudentDialog({ studentId, studentName, onClose, onSuccess, sessions, classes, sections }: RestoreStudentDialogProps) {
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (studentId) {
      setClassId('');
      setSectionId('');
      setRollNumber('');
      if (sessions.length > 0) {
        const active = sessions.find(s => s.isActive);
        setSessionId(active ? active._id : sessions[0]._id);
      } else {
        setSessionId('');
      }
    }
  }, [studentId, sessions]);

  const sessionClasses = classes.filter(c => c.sessionId === sessionId);
  const classSections = sections.filter(s => s.classId === classId);

  const handleSubmit = async () => {
    if (!sessionId || !classId) {
      toast.error('Session and Class are required');
      return;
    }
    setBusy(true);
    try {
      const payload: any = { sessionId, classId };
      if (classSections.length === 0) {
        payload.sectionId = null;
      } else if (sectionId) {
        payload.sectionId = sectionId === 'none' ? null : sectionId;
      }
      if (rollNumber) payload.rollNumber = rollNumber;
      await api.post(`/students/${studentId}/restore`, payload);
      toast.success('Student restored and placed successfully');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!studentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Student Placement</DialogTitle>
          <DialogDescription>
            {studentName ? `Provide a valid academic placement to restore ${studentName}.` : 'Provide a valid academic placement to restore the student.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Academic Session</Label>
            <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setClassId(''); setSectionId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map(s => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label>Class</Label>
            <Select disabled={!sessionId} value={classId} onValueChange={(v) => { setClassId(v); setSectionId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {sessionClasses.map(c => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {classSections.length > 0 && (
            <div className="grid gap-2">
              <Label>Section (Optional)</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Section</SelectItem>
                  {classSections.map(s => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Roll Number (Optional)</Label>
            <Input 
              value={rollNumber} 
              onChange={e => setRollNumber(e.target.value)} 
              placeholder="e.g. 101"
              maxLength={12}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || !sessionId || !classId}>
            {busy ? 'Restoring...' : 'Restore Student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
