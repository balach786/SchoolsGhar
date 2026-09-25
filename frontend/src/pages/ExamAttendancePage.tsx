import { useCallback, useEffect, useState } from 'react';
import { Check, UserX, Clock, Save, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface ExamOption {
  _id: string;
  name: string;
}

interface SessionOption {
  id: string; // e.g. "2026-10-15_09:00"
  date: string;
  startTime: string;
  display: string;
}

interface ScheduleOption {
  _id: string;
  subjectId: { _id: string; name: string; code?: string } | string;
  examDate: string;
  startTime: string;
  endTime: string;
  roomNumber?: string;
}

interface AttendanceRecord {
  studentId: string;
  fullName: string;
  fatherName?: string;
  guardianName?: string;
  className: string;
  admissionNumber: string;
  rollNumber?: string;
  examRollNumber?: number | null;
  sectionId?: string;
  status: 'present' | 'absent' | 'leave';
  remarks?: string;
  recorded: boolean;
  profilePhotoUrl?: string; // currently not sent by backend but in case
}

export function ExamAttendancePage() {
  const { can } = useAuth();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);

  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load initial exams & classes
  useEffect(() => {
    (async () => {
      try {
        const examsRes = await api.get<{ data: ExamOption[] }>('/exams');
        const exList = examsRes.data.data || [];
        setExams(exList);
        if (exList.length > 0) setSelectedExamId(exList[0]._id);
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    })();
  }, []);

  // Load schedules (sessions) & blocks for selected exam
  useEffect(() => {
    if (!selectedExamId) {
      setSessions([]);
      setBlocks([]);
      setSelectedSessionId('');
      setSelectedBlock('');
      return;
    }
    (async () => {
      try {
        const [schRes, blkRes] = await Promise.all([
          api.get<{ data: ScheduleOption[] }>(`/exams/schedules?examId=${selectedExamId}`),
          api.get<{ data: string[] }>(`/exams/attendance/blocks?examId=${selectedExamId}`)
        ]);
        
        const list = schRes.data.data || [];
        const uniqueSessions = new Map<string, SessionOption>();
        
        list.forEach((sch) => {
           const id = `${sch.examDate}_${sch.startTime}`;
           if (!uniqueSessions.has(id)) {
              uniqueSessions.set(id, {
                 id,
                 date: sch.examDate,
                 startTime: sch.startTime,
                 display: `${formatDate(sch.examDate)} (${sch.startTime})`
              });
           }
        });
        
        const sessionList = Array.from(uniqueSessions.values());
        sessionList.sort((a, b) => a.id.localeCompare(b.id));
        setSessions(sessionList);
        
        const blkList = blkRes.data.data || [];
        setBlocks(blkList);

        if (sessionList.length > 0) setSelectedSessionId(sessionList[0].id);
        else setSelectedSessionId('');
        
        if (blkList.length > 0) setSelectedBlock(blkList[0]);
        else setSelectedBlock('');
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    })();
  }, [selectedExamId]);

  // Load attendance sheet
  const loadSheet = useCallback(async () => {
    if (!selectedExamId || !selectedSessionId || !selectedBlock) {
      setRecords([]);
      return;
    }
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    setLoading(true);
    try {
      const res = await api.get<{ data: { records: AttendanceRecord[] } }>(
        `/exams/attendance/sheet?examId=${selectedExamId}&date=${session.date}&startTime=${session.startTime}&block=${encodeURIComponent(selectedBlock)}`
      );
      setRecords(res.data.data?.records || []);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedSessionId, selectedBlock, sessions]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'leave') => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.studentId === studentId ? { ...rec, status } : rec
      )
    );
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setRecords((prev) =>
      prev.map((rec) =>
        rec.studentId === studentId ? { ...rec, remarks } : rec
      )
    );
  };

  const handleMarkAll = (status: 'present' | 'absent') => {
    setRecords((prev) => prev.map((rec) => ({ ...rec, status })));
  };

  const handleSaveAttendance = async () => {
    if (!selectedExamId || !selectedSessionId || !selectedBlock) return;
    setSaving(true);
    try {
      const payload = {
        examId: selectedExamId,
        block: selectedBlock,
        records: records.map((r: any) => ({
          studentId: r.studentId,
          examScheduleId: r.examScheduleId,
          status: r.status,
          remarks: r.remarks,
        })),
      };
      const res = await api.post<{ message: string }>('/exams/attendance/bulk', payload);
      toast.success(res.data?.message || 'Attendance saved successfully');
      loadSheet();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const presentCount = records.filter((r) => r.status === 'present').length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const leaveCount = records.filter((r) => r.status === 'leave').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Attendance"
        description="Mark and monitor student presence during individual exam sessions. Accurately links to marks grading."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveAttendance}
              disabled={loading || saving || records.length === 0 || !can('examAttendance', 'mark')}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Attendance
            </Button>
          </div>
        }
      />

      {/* Selectors */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 bg-muted/30 p-4 rounded-lg border">
        <div>
          <Label className="text-xs mb-1 block">1. Select Examination</Label>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select Exam" />
            </SelectTrigger>
            <SelectContent>
              {exams.map((ex) => (
                <SelectItem key={ex._id} value={ex._id}>{ex.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs mb-1 block">2. Select Session (Date & Time)</Label>
          <Select
            value={selectedSessionId}
            onValueChange={setSelectedSessionId}
            disabled={sessions.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={sessions.length === 0 ? 'No sessions found' : 'Select Session'} />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((ses) => (
                <SelectItem key={ses.id} value={ses.id}>{ses.display}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs mb-1 block">3. Select Block / Room</Label>
          <Select
            value={selectedBlock}
            onValueChange={setSelectedBlock}
            disabled={blocks.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={blocks.length === 0 ? 'No blocks found' : 'Select Block'} />
            </SelectTrigger>
            <SelectContent>
              {blocks.map((blk) => (
                <SelectItem key={blk} value={blk}>{blk}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistics and Quick Actions Bar */}
      {selectedSessionId && selectedBlock && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border rounded-lg p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">Present: <strong>{presentCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500" />
              <span className="text-sm font-medium">Absent: <strong>{absentCount}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-sm font-medium">On Leave: <strong>{leaveCount}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkAll('present')}
              disabled={loading || records.length === 0}
            >
              <CheckCheck className="mr-1.5 h-4 w-4 text-emerald-600" /> Mark All Present
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkAll('absent')}
              disabled={loading || records.length === 0}
            >
              <UserX className="mr-1.5 h-4 w-4 text-rose-600" /> Mark All Absent
            </Button>
          </div>
        </div>
      )}

      {/* Attendance Roster Table */}
      <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="px-4 py-3 text-left">Exam Roll No</th>
              <th className="px-4 py-3 text-left">Seat No</th>
              <th className="px-4 py-3 text-left">Student Info</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading student roster...
                </td>
              </tr>
            ) : (!selectedSessionId || !selectedBlock) ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  Please select an examination, session, and block to take attendance.
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                    <p className="font-semibold text-foreground">No seating plan found for this block at this time.</p>
                    <p>Ensure students are assigned to this block and have a scheduled paper.</p>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr key={rec.studentId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold px-2 py-1 bg-muted rounded-md border">
                      {rec.examRollNumber ?? 'Not Generated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-xs text-muted-foreground">
                    {(rec as any).seatNumber || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 border flex items-center justify-center font-bold text-xs text-primary overflow-hidden">
                        {rec.profilePhotoUrl ? (
                          <img src={rec.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>
                            {rec.fullName
                              ? rec.fullName.slice(0, 2).toUpperCase()
                              : rec.fullName?.[0] || ''}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {rec.fullName} <span className="font-normal text-muted-foreground">({(rec as any).className})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paper: <span className="font-semibold text-primary/80">{(rec as any).subjectName}</span>
                          {rec.fatherName ? ` · D/O ${rec.fatherName}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={rec.status === 'present' ? 'default' : 'outline'}
                        className={`h-8 px-3 text-xs font-semibold ${
                          rec.status === 'present' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                        }`}
                        onClick={() => handleStatusChange(rec.studentId, 'present')}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Present
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={rec.status === 'absent' ? 'destructive' : 'outline'}
                        className={`h-8 px-3 text-xs font-semibold ${
                          rec.status === 'absent' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''
                        }`}
                        onClick={() => handleStatusChange(rec.studentId, 'absent')}
                      >
                        <UserX className="mr-1 h-3.5 w-3.5" /> Absent
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={rec.status === 'leave' ? 'secondary' : 'outline'}
                        className={`h-8 px-3 text-xs font-semibold ${
                          rec.status === 'leave' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''
                        }`}
                        onClick={() => handleStatusChange(rec.studentId, 'leave')}
                      >
                        <Clock className="mr-1 h-3.5 w-3.5" /> Leave
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      placeholder="Optional notes..."
                      value={rec.remarks || ''}
                      onChange={(e) => handleRemarksChange(rec.studentId, e.target.value)}
                      className="h-8 text-xs max-w-xs"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
