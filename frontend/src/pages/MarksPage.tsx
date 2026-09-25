import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface ExamLite { _id: string; name: string; isPublished: boolean; isArchived: boolean; className?: string }
interface ClassLite { _id: string; name: string; }

interface MatrixColumn {
  scheduleId: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  passingMarks: number;
  canEdit: boolean;
}

interface MatrixCell {
  subjectId: string;
  scheduleId: string;
  attendanceStatus: 'present' | 'absent' | 'pending';
  markObtained: number | null;
  isAbsent: boolean;
}

interface MatrixRow {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  examRollNumber?: number;
  subjects: MatrixCell[];
}

interface ClassMatrixResponse {
  exam: { _id: string; name: string };
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

export function MarksPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const examId = searchParams.get('examId') ?? '';
  const classId = searchParams.get('classId') ?? '';

  const [exams, setExams] = useState<ExamLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [matrix, setMatrix] = useState<ClassMatrixResponse | null>(null);
  
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({}); // Key: "studentId|subjectId"

  const canEditGlobal = can('marks', 'edit');
  const canPublishExams = can('exams', 'publish');
  const selectedExam = exams.find(e => e._id === examId);
  const isLocked = Boolean(selectedExam?.isPublished && !canPublishExams);

  useEffectOnce(() => {
    api.get<ApiListResponse<ExamLite>>('/exams?limit=100').then((r) => {
      setExams(r.data.data.filter((e) => !e.isArchived));
      setLoadingExams(false);
    }).catch(() => setLoadingExams(false));

    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => {
      setClasses(r.data.data);
    }).catch(() => {});
  });

  const loadMatrix = useCallback(async () => {
    if (!examId || !classId) { setMatrix(null); return; }
    setLoadingMatrix(true);
    try {
      const res = await api.get<ApiDataResponse<ClassMatrixResponse>>(`/marks/class-matrix/${examId}/${classId}`);
      
      // Sort rows by exam roll number, then admission number
      const data = res.data.data;
      data.rows.sort((a, b) => {
         if (a.examRollNumber && b.examRollNumber) return a.examRollNumber - b.examRollNumber;
         if (a.examRollNumber) return -1;
         if (b.examRollNumber) return 1;
         return a.admissionNumber.localeCompare(b.admissionNumber);
      });
      
      setMatrix(data);
      setEdits({});
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setMatrix(null);
    } finally {
      setLoadingMatrix(false);
    }
  }, [examId, classId]);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  const dirtyCount = Object.keys(edits).length;

  function setCell(studentId: string, subjectId: string, value: string) {
    const key = `${studentId}|${subjectId}`;
    setEdits((prev) => {
      const next = { ...prev };
      if (value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function saveMarks() {
    if (!matrix) return;
    
    const records = Object.entries(edits).map(([key, val]) => {
       const [studentId, subjectId] = key.split('|');
       return { studentId, subjectId, marksObtained: Number(val) };
    });

    if (records.length === 0) return;

    // Validate max marks
    const invalid = records.some(r => {
        const col = matrix.columns.find(c => c.subjectId === r.subjectId);
        if (!col) return true;
        return r.marksObtained < 0 || r.marksObtained > col.maxMarks;
    });

    if (invalid) {
       return toast.error("Some marks are invalid or exceed the maximum marks for the subject.");
    }
    
    setSaving(true);
    try {
      await api.post(`/marks/class-matrix/${examId}/${classId}/bulk`, { marks: records });
      toast.success('Marks saved successfully');
      await loadMatrix();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Marks Entry"
        description="Select an exam and a class to enter marks."
        crumbs={[{ label: 'Exams', to: '/exams' }, { label: 'Marks' }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate('/exams')}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            {matrix && canEditGlobal && !isLocked && (
              <Button
                size="sm"
                onClick={saveMarks}
                disabled={saving || dirtyCount === 0}
                className="bg-[#0F7E75] hover:bg-[#0C9C8F] text-white rounded-xl shadow-sm"
              >
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Changes {dirtyCount > 0 ? `(${dirtyCount})` : ''}
              </Button>
            )}
          </>
        }
      />

      <div className="filter-toolbar mb-4 flex flex-wrap items-center gap-3 bg-card p-4 border rounded-xl shadow-sm">
        <div className="w-72">
           <Label className="text-xs mb-1.5 block text-muted-foreground font-semibold uppercase tracking-wider">Exam</Label>
           <Select value={examId} onValueChange={(v) => { setSearchParams({ examId: v, classId: '' }); }}>
             <SelectTrigger className="h-9"><SelectValue placeholder="Select an exam" /></SelectTrigger>
             <SelectContent>
               {loadingExams ? <SelectItem value="__none" disabled>Loading...</SelectItem> : exams.map((e) => (
                 <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
               ))}
             </SelectContent>
           </Select>
        </div>
        
        {examId && (
          <div className="w-56">
             <Label className="text-xs mb-1.5 block text-muted-foreground font-semibold uppercase tracking-wider">Class</Label>
             <Select value={classId} onValueChange={(v) => { setSearchParams({ examId, classId: v }); }}>
               <SelectTrigger className="h-9"><SelectValue placeholder="Select a class" /></SelectTrigger>
               <SelectContent>
                 {classes.map((c) => (
                   <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                 ))}
               </SelectContent>
             </Select>
          </div>
        )}

        {selectedExam?.isPublished && (
          <div className="ml-auto mt-6">
            <Badge variant={canPublishExams ? 'outline' : 'default'} className="gap-1">
              {isLocked ? <><Lock className="h-3 w-3" /> Published — locked</> : <><AlertTriangle className="h-3 w-3" /> Published — admin override enabled</>}
            </Badge>
          </div>
        )}
      </div>

      {loadingMatrix && <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>}

      {!loadingMatrix && examId && classId && !matrix && (
        <EmptyState title="Could not load matrix" description="There was an error loading the marks matrix." />
      )}

      {!loadingMatrix && matrix && matrix.columns.length === 0 && (
         <EmptyState title="No scheduled subjects" description="This class has no subjects scheduled for the selected exam." />
      )}

      {!loadingMatrix && matrix && matrix.columns.length > 0 && matrix.rows.length === 0 && (
         <EmptyState title="No students" description="There are no active students in this class." />
      )}

      {!loadingMatrix && matrix && matrix.columns.length > 0 && matrix.rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="max-h-[65vh] overflow-auto relative">
            <Table className="min-w-[800px]">
              <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                <TableRow>
                  <TableHead className="w-20 sticky left-0 bg-background z-20 border-r text-center shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#27272a]">Roll No</TableHead>
                  <TableHead className="w-48 sticky left-[80px] bg-background z-20 border-r shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#27272a]">Student</TableHead>
                  {matrix.columns.map((col) => (
                    <TableHead key={col.subjectId} className="text-center min-w-[120px] bg-background">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <span className="font-semibold text-foreground text-sm line-clamp-1" title={col.subjectName}>{col.subjectName}</span>
                        <div className="flex gap-2 text-[10px] uppercase font-bold text-muted-foreground">
                           <span>Max {col.maxMarks}</span>
                           <span>Pass {col.passingMarks}</span>
                        </div>
                        {!col.canEdit && !canPublishExams && (
                          <Badge variant="secondary" className="text-[9px] px-1 h-4 flex items-center gap-0.5 mt-1 border-dashed">
                             <Lock className="h-2 w-2" /> View Only
                          </Badge>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.rows.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="sticky left-0 bg-background/95 backdrop-blur z-10 border-r shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#27272a]">
                      <span className="font-mono text-xs font-semibold px-2 py-1 bg-muted/60 rounded-md border inline-block min-w-10 text-center">
                        {row.examRollNumber ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="sticky left-[80px] bg-background/95 backdrop-blur z-10 border-r shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#27272a]">
                      <p className="font-medium text-sm leading-tight">{row.fullName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{row.admissionNumber}</p>
                    </TableCell>
                    
                    {matrix.columns.map((col) => {
                      const cell = row.subjects.find(s => s.subjectId === col.subjectId);
                      const key = `${row.studentId}|${col.subjectId}`;
                      
                      const isLockedCell = isLocked || !canEditGlobal || !col.canEdit || !cell || cell.attendanceStatus === 'pending' || cell.isAbsent;
                      const editedVal = edits[key];
                      const val = editedVal !== undefined ? editedVal : (cell?.markObtained !== null && cell?.markObtained !== undefined ? String(cell.markObtained) : '');
                      const isDirty = editedVal !== undefined;
                      const hasPassed = !cell?.isAbsent && cell?.markObtained !== null && cell?.markObtained !== undefined && cell.markObtained >= col.passingMarks;
                      
                      return (
                        <TableCell key={col.subjectId} className="text-center bg-transparent">
                          <div className="flex flex-col items-center justify-center group relative min-h-[44px]">
                            {cell?.attendanceStatus === 'pending' ? (
                               <div className="text-[11px] text-muted-foreground/60 font-medium flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-transparent">
                                 <Lock className="h-3 w-3 opacity-50" /> Pending
                               </div>
                            ) : cell?.isAbsent ? (
                               <Badge variant="destructive" className="h-7 text-[10px] uppercase font-bold tracking-wider px-2 shadow-sm bg-rose-500 hover:bg-rose-600">
                                 ABSENT
                               </Badge>
                            ) : (
                               <div className="relative">
                                 <Input
                                   type="number" min={0} max={col.maxMarks}
                                   className={`h-9 w-20 text-center font-medium shadow-none transition-colors ${
                                     isDirty ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100' : 'bg-transparent hover:bg-muted/30'
                                   } focus-visible:ring-1 focus-visible:ring-[#0F7E75] ${!isLockedCell ? '' : 'opacity-70 cursor-not-allowed'}`}
                                   value={val}
                                   disabled={isLockedCell}
                                   placeholder="—"
                                   onChange={(e) => setCell(row.studentId, col.subjectId, e.target.value)}
                                 />
                                 {cell?.markObtained !== null && cell?.markObtained !== undefined && val !== '' && !isDirty && (
                                   <div className="absolute -right-5 top-1/2 -translate-y-1/2">
                                     {hasPassed
                                       ? <CheckCircle2 className="h-4 w-4 text-emerald-500/80" />
                                       : <AlertTriangle className="h-4 w-4 text-rose-500/80" />}
                                   </div>
                                 )}
                               </div>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground flex justify-between items-center">
            <span>{matrix.rows.length} students in class</span>
            <span className="flex items-center gap-2">
               {dirtyCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>}
            </span>
          </div>
        </div>
      )}

      {matrix && (
         <div className="mt-4 flex gap-4 text-[11px] text-muted-foreground/80 bg-muted/20 p-3 rounded-lg border">
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-rose-500"></div> Absent students are automatically locked.
           </div>
           <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 opacity-60" /> Attendance must be marked before marks unlock.
           </div>
           <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-rose-400 opacity-60" /> Red warning icon indicates a failing mark.
           </div>
         </div>
      )}
    </div>
  );
}
