import { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatDate, SCHOOL_TIMEZONE } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface ExamRow {
  _id: string;
  name: string;
  sessionId: string;
  classId: string;
  startDate?: string;
  endDate?: string;
}

interface ClassRow {
  _id: string;
  name: string;
  sessionId: string;
}

interface SubjectRow {
  _id: string;
  name: string;
  code: string;
  classIds?: string[];
}

interface ScheduleRow {
  _id: string;
  examId: string;
  sessionId: string;
  classId: string;
  subjectId: string;
  subjectName?: string;
  subjectCode?: string;
  examDate: string;
  startTime: string;
  endTime: string;
  totalMarks: number;
  passingMarks: number;
  theoryMarks?: number | null;
  practicalMarks?: number | null;
  instructions?: string | null;
}

interface PrintableScheduleData {
  school: {
    schoolName: string;
    schoolLogoUrl: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  exam: {
    name: string;
    startDate: string | null;
    endDate: string | null;
  };
  session: { name: string } | null;
  class: { name: string } | null;
  schedules: ScheduleRow[];
}

export function ExamSchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramExamId = searchParams.get('examId') || '';
  const paramClassId = searchParams.get('classId') || '';

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<string>(paramExamId);
  const [selectedClassId, setSelectedClassId] = useState<string>(paramClassId);

  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog State
  const [formOpen, setFormOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classConfigs, setClassConfigs] = useState<Record<string, {
    subjectId: string;
    startTime: string;
    endTime: string;
    totalMarks: string;
    passingMarks: string;
    theoryMarks: string;
    practicalMarks: string;
    instructions: string;
  }>>({});
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);

  // Form inputs
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formTotalMarks, setFormTotalMarks] = useState('100');
  const [formPassingMarks, setFormPassingMarks] = useState('40');
  const [formTheoryMarks, setFormTheoryMarks] = useState('');
  const [formPracticalMarks, setFormPracticalMarks] = useState('');
  const [formInstructions, setFormInstructions] = useState('');

  // Print Dialog
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState<PrintableScheduleData | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffectOnce(() => {
    api
      .get<ApiListResponse<ExamRow>>('/exams?limit=100')
      .then((res) => {
        setExams(res.data.data);
        if (!selectedExamId && res.data.data.length > 0) {
          setSelectedExamId(res.data.data[0]._id);
          setSelectedClassId(res.data.data[0].classId);
        }
      })
      .catch(() => {});

    api
      .get<ApiListResponse<ClassRow>>('/classes/lookup')
      .then((res) => setClasses(res.data.data))
      .catch(() => {});
  });

  // Load all subjects globally for the multi-select dynamic dropdowns
  useEffect(() => {
    api
      .get<ApiListResponse<SubjectRow>>(`/subjects?limit=500`)
      .then((res) => setSubjects(res.data.data))
      .catch(() => {});
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ examId: selectedExamId });
      if (selectedClassId && selectedClassId !== 'all') params.set('classId', selectedClassId);
      const res = await api.get<ApiDataResponse<ScheduleRow[]>>(`/exam-schedules?${params}`);
      setSchedules(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedClassId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleExamChange = (val: string) => {
    setSelectedExamId(val);
    const ex = exams.find((e) => e._id === val);
    if (ex && ex.classId) {
      setSelectedClassId(ex.classId);
    }
    setSearchParams({ examId: val, ...(ex?.classId ? { classId: ex.classId } : {}) });
  };

  const openCreate = () => {
    setEditingSchedule(null);
    const ex = exams.find((e) => e._id === selectedExamId);
    setFormDate(ex?.startDate ? ex.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setWizardStep(1);
    setSelectedClasses([]);
    setClassConfigs({});
    setFormOpen(true);
  };

  const openEdit = (row: ScheduleRow) => {
    setEditingSchedule(row);
    setFormSubjectId(row.subjectId);
    setFormDate(row.examDate ? row.examDate.slice(0, 10) : '');
    setFormStartTime(row.startTime);
    setFormEndTime(row.endTime);
    setFormTotalMarks(String(row.totalMarks));
    setFormPassingMarks(String(row.passingMarks));
    setFormTheoryMarks(row.theoryMarks !== null && row.theoryMarks !== undefined ? String(row.theoryMarks) : '');
    setFormPracticalMarks(row.practicalMarks !== null && row.practicalMarks !== undefined ? String(row.practicalMarks) : '');
    setFormInstructions(row.instructions ?? '');
    setFormOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentExam = exams.find((e) => e._id === selectedExamId);
    if (!currentExam) {
      toast.error('Please select an examination first');
      return;
    }

    setBusy(true);
    try {
      if (editingSchedule) {
        if (!formSubjectId) {
          toast.error('Subject is required');
          setBusy(false);
          return;
        }
        const totalMarks = Number(formTotalMarks);
        const passingMarks = Number(formPassingMarks);
        if (passingMarks > totalMarks) {
          toast.error('Passing marks cannot exceed total marks');
          setBusy(false);
          return;
        }

        const payload: Record<string, any> = {
          examId: selectedExamId,
          sessionId: currentExam.sessionId,
          classId: selectedClassId || currentExam.classId,
          subjectId: formSubjectId,
          examDate: new Date(formDate).toISOString(),
          startTime: formStartTime,
          endTime: formEndTime,
          totalMarks,
          passingMarks,
          theoryMarks: formTheoryMarks ? Number(formTheoryMarks) : undefined,
          practicalMarks: formPracticalMarks ? Number(formPracticalMarks) : undefined,
          instructions: formInstructions.trim() || undefined,
        };

        await api.patch(`/exam-schedules/${editingSchedule._id}`, payload);
        toast.success('Exam schedule updated');
        setFormOpen(false);
        loadSchedules();
      } else {
        if (selectedClasses.length === 0) {
          toast.error('No classes selected');
          setBusy(false);
          return;
        }

        // PRE-VALIDATION: Check for existing schedules on the same date to avoid 409 conflicts
        const normalizeDate = (isoString: string) => {
          try {
            return new Intl.DateTimeFormat('en-CA', {
              timeZone: SCHOOL_TIMEZONE, // canonical application timezone
              year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(new Date(isoString));
          } catch { return isoString.split('T')[0]; }
        };
        
        const targetDate = formDate;
        const conflicts = schedules.filter(
          (s) => selectedClasses.includes(String(s.classId)) && s.examDate && normalizeDate(s.examDate) === targetDate
        );

        if (conflicts.length > 0) {
          const conflictMessages = conflicts.map(c => {
            const className = classes.find(cls => cls._id === c.classId)?.name || 'Unknown Class';
            const subjectName = c.subjectName || 'Unknown Subject';
            return `${className} — ${subjectName}`;
          });
          
          toast.error(
            <div className="flex flex-col gap-1">
              <span className="font-bold">Cannot Save Exam Day</span>
              <span>The following classes are already scheduled on this date:</span>
              <ul className="list-disc pl-4 text-xs mt-1">
                {conflictMessages.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
              <span className="mt-1 font-semibold text-xs text-red-500">Resolve these rows before saving.</span>
            </div>,
            { duration: 6000 }
          );
          setBusy(false);
          return;
        }

        const promises = selectedClasses.map(async (clsId) => {
          const conf = classConfigs[clsId];
          if (!conf || !conf.subjectId) throw new Error(`Missing subject selection for one of the classes.`);
          
          const totalMarks = Number(conf.totalMarks);
          const passingMarks = Number(conf.passingMarks);
          if (passingMarks > totalMarks) throw new Error('Passing marks cannot exceed total marks');

          return api.post('/exam-schedules', {
            examId: selectedExamId,
            sessionId: currentExam.sessionId,
            classId: clsId,
            subjectId: conf.subjectId,
            examDate: new Date(formDate).toISOString(),
            startTime: conf.startTime,
            endTime: conf.endTime,
            totalMarks,
            passingMarks,
            theoryMarks: conf.theoryMarks ? Number(conf.theoryMarks) : undefined,
            practicalMarks: conf.practicalMarks ? Number(conf.practicalMarks) : undefined,
            instructions: conf.instructions.trim() || undefined,
          });
        });

        await Promise.all(promises);
        toast.success('Exam Day saved successfully');
        setFormOpen(false);
        loadSchedules();
      }
      
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/exam-schedules/${deleteTarget._id}`);
      toast.success('Schedule deleted');
      setDeleteTarget(null);
      loadSchedules();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const openPrint = async () => {
    try {
      const params = new URLSearchParams({ examId: selectedExamId });
      if (selectedClassId && selectedClassId !== 'all') params.set('classId', selectedClassId);
      const res = await api.get<ApiDataResponse<PrintableScheduleData>>(`/exam-schedules/printable?${params}`);
      setPrintData(res.data.data);
      setPrintModalOpen(true);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Subject-wise Exam Schedule"
        description="Configure dates, examination timings, passing marks, and generate professional printable timetables."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={openPrint} disabled={schedules.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Print Schedule
            </Button>
            <Button size="sm" onClick={openCreate} disabled={!selectedExamId}>
              <Plus className="mr-2 h-4 w-4" /> Add Exam Day
            </Button>
          </div>
        }
      />

      {/* Filter / Scope Selector */}
      <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              <Filter className="h-4 w-4 text-primary" />
              <span>Exam Scope:</span>
            </div>

            <div className="w-64">
              <Select value={selectedExamId} onValueChange={handleExamChange}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Select Examination" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e._id} value={e._id} className="text-xs">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-52">
              <Select value={selectedClassId} onValueChange={(v) => setSelectedClassId(v)}>
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Select Class" />
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
          </div>
        </CardContent>
      </Card>

      {/* MATRIX LOGIC SHARED BETWEEN SCREEN AND PRINT */}
      {(() => {
        // 1. Common time
        const times = schedules.map((s) => `${s.startTime} – ${s.endTime}`);
        const uniqueTimes = Array.from(new Set(times));
        const commonTime = uniqueTimes.length === 1 ? uniqueTimes[0] : null;

        // Helper for date normalization
        const normalizeDate = (isoString: string) => {
          try {
            return new Intl.DateTimeFormat('en-CA', {
              timeZone: SCHOOL_TIMEZONE, // canonical application timezone
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(isoString));
          } catch {
            return isoString.split('T')[0];
          }
        };

        // 2. Class Columns
        const classIdSet = new Set<string>();
        schedules.forEach((s) => classIdSet.add(s.classId));

        let classCols = Array.from(classIdSet).map((id) => {
          const cls = classes.find((c) => c._id === id);
          return { id, name: cls?.name || 'Unknown Class' };
        });

        // Specific Class filter = show only that class column
        if (selectedClassId && selectedClassId !== 'all') {
          classCols = classCols.filter((c) => c.id === selectedClassId);
        }

        classCols.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );

        // 3. Dates (Rows)
        const dateSet = new Set<string>();
        schedules.forEach((s) => {
          if (selectedClassId && selectedClassId !== 'all' && s.classId !== selectedClassId) return;
          const d = normalizeDate(s.examDate);
          dateSet.add(d);
        });
        const dateRows = Array.from(dateSet).sort();

        // 4. Matrix mapping: date -> classId -> ScheduleRow[]
        const matrix: Record<string, Record<string, ScheduleRow[]>> = {};
        schedules.forEach((s) => {
          if (selectedClassId && selectedClassId !== 'all' && s.classId !== selectedClassId) return;
          const d = normalizeDate(s.examDate);
          if (!matrix[d]) matrix[d] = {};
          if (!matrix[d][s.classId]) matrix[d][s.classId] = [];
          matrix[d][s.classId].push(s);
        });

        return (
          <>
            {/* Schedule Table (On-screen Matrix) */}
            {loading ? (
              <div className="flex min-h-[250px] items-center justify-center rounded-2xl border border-dashed border-border/70 p-8">
                <p className="text-sm text-muted-foreground animate-pulse">Loading exam schedules...</p>
              </div>
            ) : schedules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm/40">
                <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground/60" />
                <h3 className="mt-4 text-base font-semibold text-foreground">No subjects scheduled yet</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
                  Schedule subjects for this exam with designated dates, start & end times, and mark criteria.
                </p>
                <Button size="sm" onClick={openCreate} className="mt-5 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Schedule First Subject
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] overflow-hidden shadow-sm">
                {commonTime && (
                  <div className="bg-white/60 p-3 border-b border-[#BFDBFE] text-sm font-semibold text-center text-primary flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4" /> Exam Time: {commonTime}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border/60">
                      <tr>
                        <th className="py-3 px-4 border-r border-border/60 whitespace-nowrap bg-muted/30">Date</th>
                        <th className="py-3 px-4 border-r border-border/60 whitespace-nowrap bg-muted/30">Day</th>
                        {classCols.map((c) => (
                          <th key={c.id} className="py-3 px-4 border-r border-border/60 whitespace-nowrap">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {dateRows.map((date) => {
                        const dObj = new Date(date);
                        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dObj);
                        return (
                          <tr key={date} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4 border-r border-border/60 text-muted-foreground whitespace-nowrap bg-muted/10 font-medium">
                              {formatDate(date)}
                            </td>
                            <td className="py-3 px-4 border-r border-border/60 text-muted-foreground whitespace-nowrap bg-muted/10">
                              {dayName}
                            </td>
                            {classCols.map((c) => {
                              const cellSchedules = matrix[date]?.[c.id] || [];
                              if (cellSchedules.length === 0) {
                                return (
                                  <td key={c.id} className="py-3 px-4 border-r border-border/60 text-center text-muted-foreground/40">
                                    —
                                  </td>
                                );
                              }
                              if (cellSchedules.length === 1) {
                                const row = cellSchedules[0];
                                return (
                                  <td key={c.id} className="py-2 px-3 border-r border-border/60">
                                    <div
                                      className="group relative flex items-center justify-between gap-2 p-2 rounded-md hover:bg-white/80 transition-colors cursor-pointer border border-transparent hover:border-primary/20 hover:shadow-sm"
                                      onClick={() => openEdit(row)}
                                    >
                                      <span className="font-medium text-foreground">{row.subjectName}</span>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-md">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEdit(row);
                                          }}
                                          title="Edit"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-destructive hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTarget(row);
                                          }}
                                          title="Delete"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </td>
                                );
                              }
                              // Conflict
                              return (
                                <td key={c.id} className="py-2 px-3 border-r border-border/60 bg-red-50/50">
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" /> CONFLICT:
                                    </span>
                                    <div className="flex flex-col gap-1">
                                      {cellSchedules.map((row) => (
                                        <div
                                          key={row._id}
                                          className="flex items-center justify-between bg-red-100 text-red-800 text-xs px-2 py-1 rounded cursor-pointer hover:bg-red-200 transition-colors border border-red-200"
                                          onClick={() => openEdit(row)}
                                        >
                                          <span className="font-semibold">{row.subjectName}</span>
                                          <Trash2
                                            className="h-3.5 w-3.5 cursor-pointer hover:text-red-900 ml-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteTarget(row);
                                            }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

      {/* Create / Edit Schedule Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={editingSchedule ? "max-w-lg" : "max-w-3xl max-h-[90vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Scheduled Subject' : 'Add Exam Day'}</DialogTitle>
            <DialogDescription>
              {editingSchedule 
                ? 'Update the exam date, timings, maximum and passing marks for this subject.'
                : 'Select an exam date and schedule subjects for multiple classes simultaneously.'}
            </DialogDescription>
          </DialogHeader>

          {editingSchedule ? (
            <form onSubmit={handleSaveSchedule} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedSubject">Subject *</Label>
              <Select value={formSubjectId} onValueChange={setFormSubjectId} disabled={Boolean(editingSchedule)}>
                <SelectTrigger id="schedSubject">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((sub) => (
                    <SelectItem key={sub._id} value={sub._id}>
                      {sub.name} ({sub.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="schedDate">Exam Date *</Label>
                <Input
                  id="schedDate"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schedStart">Start Time *</Label>
                <Input
                  id="schedStart"
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schedEnd">End Time *</Label>
                <Input
                  id="schedEnd"
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="totalMarks">Total Marks *</Label>
                <Input
                  id="totalMarks"
                  type="number"
                  min="1"
                  max="1000"
                  value={formTotalMarks}
                  onChange={(e) => setFormTotalMarks(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="passMarks">Passing Marks *</Label>
                <Input
                  id="passMarks"
                  type="number"
                  min="0"
                  max="1000"
                  value={formPassingMarks}
                  onChange={(e) => setFormPassingMarks(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="thMarks">Theory Marks (Optional)</Label>
                <Input
                  id="thMarks"
                  type="number"
                  min="0"
                  placeholder="e.g. 75"
                  value={formTheoryMarks}
                  onChange={(e) => setFormTheoryMarks(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prMarks">Practical Marks (Optional)</Label>
                <Input
                  id="prMarks"
                  type="number"
                  min="0"
                  placeholder="e.g. 25"
                  value={formPracticalMarks}
                  onChange={(e) => setFormPracticalMarks(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="instructions">Instructions / Hall Requirements</Label>
              <Textarea
                id="instructions"
                rows={2}
                placeholder="e.g. Bring scientific calculator, geometrical instruments allowed..."
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Update Schedule'}
              </Button>
            </DialogFooter>
          </form>
          ) : (
            <form onSubmit={handleSaveSchedule} className="space-y-6">
              {wizardStep === 1 ? (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="schedDate">Exam Date *</Label>
                    <Input
                      id="schedDate"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Select Classes</Label>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedClasses(classes.map(c => c._id))}>
                          Select All
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedClasses([])}>
                          Clear All
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border border-border/70 p-4 rounded-xl max-h-[300px] overflow-y-auto bg-muted/10">
                      {classes.map((cls) => (
                        <label key={cls._id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors">
                          <input 
                            type="checkbox" 
                            className="rounded border-primary/50 text-primary focus:ring-primary h-4 w-4"
                            checked={selectedClasses.includes(cls._id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedClasses([...selectedClasses, cls._id]);
                              else setSelectedClasses(selectedClasses.filter(id => id !== cls._id));
                            }}
                          />
                          <span className="text-sm font-medium">{cls.name}</span>
                        </label>
                      ))}
                      {classes.length === 0 && <p className="text-xs text-muted-foreground col-span-full">No classes available for this session.</p>}
                    </div>
                  </div>

                  <DialogFooter className="pt-2 border-t mt-4">
                    <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                    <Button 
                      type="button" 
                      onClick={() => {
                        if (selectedClasses.length === 0) return toast.error('Please select at least one class');
                        
                        const newConfigs = { ...classConfigs };
                        selectedClasses.forEach(clsId => {
                          if (!newConfigs[clsId]) {
                            newConfigs[clsId] = {
                              subjectId: '',
                              startTime: '09:00',
                              endTime: '12:00',
                              totalMarks: '100',
                              passingMarks: '40',
                              theoryMarks: '',
                              practicalMarks: '',
                              instructions: ''
                            };
                          }
                        });
                        setClassConfigs(newConfigs);
                        setWizardStep(2);
                      }}
                    >
                      Add Selected Classes
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-primary/5 border border-primary/20 p-4 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-primary">Exam Date: {formatDate(formDate)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedClasses.length} class(es) selected</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setWizardStep(1)}>
                      Change Classes
                    </Button>
                  </div>

                  <div className="space-y-4 max-h-[50vh] overflow-y-auto px-1 pb-4">
                    {selectedClasses.map((clsId) => {
                      const cls = classes.find(c => c._id === clsId);
                      const conf = classConfigs[clsId];
                      if (!conf) return null;

                      const clsSubjects = subjects.filter(s => !s.classIds || s.classIds.length === 0 || s.classIds.includes(clsId));

                      return (
                        <div key={clsId} className="border border-border/80 rounded-xl p-5 space-y-4 bg-card shadow-sm relative group transition-all hover:border-primary/30">
                          <div className="flex items-center justify-between border-b border-border/50 pb-3">
                            <h4 className="font-semibold text-foreground flex items-center gap-2">
                              <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-md text-sm">{cls?.name}</span>
                            </h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setSelectedClasses(selectedClasses.filter(id => id !== clsId));
                                const nextConf = { ...classConfigs };
                                delete nextConf[clsId];
                                setClassConfigs(nextConf);
                              }}
                              title="Remove Class"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                              <Label className="text-xs text-muted-foreground">Subject *</Label>
                              <Select 
                                value={conf.subjectId} 
                                onValueChange={(val) => setClassConfigs({ ...classConfigs, [clsId]: { ...conf, subjectId: val } })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select subject" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clsSubjects.map((sub) => (
                                    <SelectItem key={sub._id} value={sub._id}>
                                      {sub.name} ({sub.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Start Time *</Label>
                              <Input 
                                type="time" 
                                className="h-9" 
                                value={conf.startTime} 
                                onChange={(e) => setClassConfigs({ ...classConfigs, [clsId]: { ...conf, startTime: e.target.value } })}
                                required 
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">End Time *</Label>
                              <Input 
                                type="time" 
                                className="h-9" 
                                value={conf.endTime} 
                                onChange={(e) => setClassConfigs({ ...classConfigs, [clsId]: { ...conf, endTime: e.target.value } })}
                                required 
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Total Marks *</Label>
                              <Input 
                                type="number" 
                                className="h-9" 
                                min="1" max="1000" 
                                value={conf.totalMarks} 
                                onChange={(e) => setClassConfigs({ ...classConfigs, [clsId]: { ...conf, totalMarks: e.target.value } })}
                                required 
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Passing Marks *</Label>
                              <Input 
                                type="number" 
                                className="h-9" 
                                min="0" max="1000" 
                                value={conf.passingMarks} 
                                onChange={(e) => setClassConfigs({ ...classConfigs, [clsId]: { ...conf, passingMarks: e.target.value } })}
                                required 
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {selectedClasses.length === 0 && (
                      <div className="text-center p-8 text-muted-foreground border border-dashed rounded-xl bg-muted/20">
                        No classes selected. Go back to add classes.
                      </div>
                    )}
                  </div>
                  
                  <DialogFooter className="pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={busy || selectedClasses.length === 0}>
                      {busy ? 'Saving Schedules...' : 'Save Exam Day'}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Printable Schedule Modal */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Printable Examination Schedule</DialogTitle>
            <DialogDescription>
              Preview the schedule formatted for browser A4 printing.
            </DialogDescription>
          </DialogHeader>

          {printData && (() => {
            const { schedules } = printData;
            if (!schedules || schedules.length === 0) {
              return (
                <div className="p-8 text-center text-muted-foreground">
                  No schedules found for this exam.
                </div>
              );
            }

            // We reuse the exact same matrix calculation logic variables
            // computed above: classCols, dateRows, matrix, commonTime, uniqueTimes
            
            const timeWarning = uniqueTimes.length > 1;

            return (
              <div
                ref={printAreaRef}
                className="p-6 border border-border/80 rounded-xl bg-white text-black space-y-6 print:m-0 print:p-0 print:border-none"
              >
                <style type="text/css" media="print">
                  {`
                    @page { size: ${classCols.length > 4 ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm; }
                  `}
                </style>
                {/* Header */}
                <div className="text-center border-b pb-4">
                  {printData.school?.schoolLogoUrl && (
                    <img
                      src={printData.school.schoolLogoUrl}
                      alt=""
                      className="h-14 mx-auto mb-2 object-contain"
                    />
                  )}
                  <h2 className="text-xl font-bold uppercase tracking-wide">
                    {printData.school?.schoolName || 'School Management System'}
                  </h2>
                  <p className="text-xs text-gray-600 mt-0.5">{printData.school?.address}</p>
                  <div className="mt-3 inline-block bg-gray-100 px-4 py-1.5 rounded-full">
                    <h3 className="text-sm font-semibold uppercase text-gray-800">
                      {printData.exam.name} — Date Sheet
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Session: {printData.session?.name ?? '—'}
                  </p>
                  {commonTime && (
                    <p className="text-xs font-semibold text-gray-700 mt-1">
                      Exam Time: {commonTime}
                    </p>
                  )}
                  {timeWarning && (
                    <p className="text-xs font-bold text-red-600 mt-1">
                      Warning: Exam timings vary. Please refer to detailed schedule.
                    </p>
                  )}
                </div>

                {/* Timetable Matrix */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 text-xs text-center print:text-[11px]">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 p-2 text-left whitespace-nowrap">Date</th>
                        <th className="border border-gray-300 p-2 text-left whitespace-nowrap">Day</th>
                        {classCols.map(c => (
                          <th key={c.id} className="border border-gray-300 p-2 whitespace-nowrap">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dateRows.map(date => {
                        const dObj = new Date(date);
                        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dObj);
                        return (
                          <tr key={date}>
                            <td className="border border-gray-300 p-2 text-left whitespace-nowrap">{formatDate(date)}</td>
                            <td className="border border-gray-300 p-2 text-left">{dayName}</td>
                            {classCols.map(c => {
                              const cellSchedules = matrix[date]?.[c.id] || [];
                              if (cellSchedules.length === 0) {
                                return <td key={c.id} className="border border-gray-300 p-2 font-medium">—</td>;
                              }
                              if (cellSchedules.length === 1) {
                                return (
                                  <td key={c.id} className="border border-gray-300 p-2 font-medium">
                                    {cellSchedules[0].subjectName}
                                  </td>
                                );
                              }
                              // Conflict
                              return (
                                <td key={c.id} className="border border-gray-300 p-2 font-medium text-red-600">
                                  CONFLICT: {cellSchedules.map(r => r.subjectName).join(' / ')}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Instructions */}
                <div className="border border-gray-200 rounded p-3 text-[11px] text-gray-600 space-y-1 mt-6">
                  <p className="font-semibold text-gray-800">General Examination Instructions:</p>
                  <p>1. Students must arrive at the examination room 15 minutes prior to the start time.</p>
                  <p>2. Please bring all necessary stationery. Borrowing from other students is strictly prohibited.</p>
                  <p>3. Mobile phones and unauthorized materials are not allowed in the exam hall.</p>
                </div>

                {/* Signature lines */}
                <div className="flex justify-between pt-10 text-xs font-semibold text-gray-700">
                  <div className="border-t border-gray-400 pt-1 w-44 text-center">Controller of Examinations</div>
                  <div className="border-t border-gray-400 pt-1 w-44 text-center">Principal</div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setPrintModalOpen(false)}>
              Close
            </Button>
            <Button onClick={handleBrowserPrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Schedule Entry"
        description={`Are you sure you want to remove ${deleteTarget?.subjectName} from this exam schedule?`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
      {/* End IIFE for Matrix Scope */}
      </>
      )})()}
    </div>
  );
}
