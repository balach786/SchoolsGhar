import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Medal, Award, Loader2, Users, CheckCircle2, AlertTriangle, TrendingUp, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column } from '@/components/DataTable';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { formatDate, formatStudentIdentity } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface ExamLite { _id: string; name: string; isPublished: boolean; isArchived: boolean; className?: string; examDate?: string | null }
interface RankRow {
  studentId: string; admissionNumber: string; rollNumber: string; examRollNumber?: number | null; fullName: string;
  fatherName?: string | null; guardianName?: string | null; gender?: string; caste?: string | null;
  totalObtained: number; totalMax: number; percentage: number; grade: string; rank: number;
}
interface Summary {
  exam: { _id: string; name: string; isPublished: boolean; examDate: string | null };
  gradeScale: { name: string; boundaries: { minPercentage: number; grade: string; remarks?: string }[] } | null;
  classStrength: number;
  subjects: { subjectId: string; name: string; code: string; maxMarks: number; passMarks: number | null }[];
  students: RankRow[];
}
interface ResultCard {
  exam: { _id: string; name: string; examDate: string | null; isPublished: boolean };
  student: { 
    _id: string; admissionNumber: string; rollNumber: string; examRollNumber?: number | null; fullName: string; 
    fatherName?: string | null; guardianName?: string | null; gender?: string; caste?: string | null;
    className: string; sectionName: string; sessionName: string 
  };
  gradeScale: { name: string; boundaries: { minPercentage: number; grade: string; remarks?: string }[] } | null;
  subjects: { subjectId: string; name: string; code: string; maxMarks: number; passMarks: number; marksObtained: number; status: string }[];
  total: { obtained: number; max: number };
  percentage: number;
  grade: string;
  rank: number;
  classStrength: number;
}

export function ResultsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const examId = searchParams.get('examId') ?? '';
  const isStudent = user?.role === 'student';

  const [exams, setExams] = useState<ExamLite[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ResultCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [me, setMe] = useState<{ _id: string } | null>(null);
  const [tab, setTab] = useState('published');
  const [publishing, setPublishing] = useState(false);

  useEffectOnce(() => {
    api.get<ApiListResponse<ExamLite>>('/exams?limit=100').then((r) => {
      const visible = r.data.data.filter((e) => !e.isArchived);
      setExams(visible);
      // Preselect the first exam when none is in the URL.
      if (!examId && visible.length > 0) setSearchParams({ examId: visible[0]._id }, { replace: true });
    }).catch(() => {});
  });

  useEffect(() => {
    if (isStudent && !me) {
      api.get<ApiDataResponse<{ _id: string }>>('/students/me').then((r) => setMe(r.data.data)).catch(() => {});
    }
  }, [isStudent, me]);

  useEffect(() => {
    if (examId && exams.length > 0) {
      const currentExam = exams.find(e => e._id === examId);
      if (currentExam && !currentExam.isPublished && tab === 'published') {
         setTab('draft');
      }
    }
  }, [examId, exams, tab]);

  const load = useCallback(async () => {
    if (!examId || exams.length === 0) {
       if (!examId) { setSummary(null); setLoading(false); }
       return; 
    }
    
    const currentExam = exams.find(e => e._id === examId);
    if (!currentExam) {
       setSummary(null); setLoading(false);
       return;
    }

    if (tab === 'published' && !currentExam.isPublished) {
       return; // useEffect above will switch to 'draft'
    }

    setLoading(true);
    try {
      const endpoint = tab === 'draft' ? `/results/draft?examId=${examId}` : `/results/exam-summary?examId=${examId}`;
      const res = await api.get<ApiDataResponse<Summary>>(endpoint);
      setSummary(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [examId, tab, exams]);

  useEffect(() => { load(); }, [load]);

  async function openCard(studentId: string) {
    setCardLoading(true);
    setCard(null);
    try {
      const res = await api.get<ApiDataResponse<ResultCard>>(`/results/${examId}/students/${studentId}`);
      setCard(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCardLoading(false);
    }
  }

  // Students: load their own card directly.
  useEffect(() => {
    if (isStudent && me && examId) openCard(me._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, me, examId]);

  const rankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-amber-500 text-white"><Medal className="mr-1 h-3 w-3" /> 1st</Badge>;
    if (rank === 2) return <Badge className="bg-slate-400 text-white"><Medal className="mr-1 h-3 w-3" /> 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-orange-700 text-white"><Medal className="mr-1 h-3 w-3" /> 3rd</Badge>;
    return <span className="text-sm text-muted-foreground">#{rank}</span>;
  };

  const columns: Column<RankRow>[] = [
    { key: 'rank', header: 'Rank', cell: (row) => rankBadge(row.rank) },
    {
      key: 'student', header: 'Student',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{formatStudentIdentity(row as any)}</p>
          <p className="text-xs text-muted-foreground">
            {row.examRollNumber ? `Exam Roll ${row.examRollNumber} · ` : row.rollNumber ? `Roll ${row.rollNumber} · ` : ''}
            {row.admissionNumber}
          </p>
        </div>
      ),
    },
    { key: 'total', header: 'Total', cell: (row) => <span className="text-sm">{row.totalObtained} / {row.totalMax}</span> },
    { key: 'percentage', header: '%', cell: (row) => <span className="text-sm font-medium">{row.percentage.toFixed(2)}%</span> },
    {
      key: 'grade', header: 'Grade',
      cell: (row) => <Badge variant="secondary" className="min-w-12 justify-center">{row.grade}</Badge>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      cell: (row) => tab === 'published' ? <Button size="sm" variant="outline" onClick={() => openCard(row.studentId)}>View card</Button> : null,
    },
  ];

  const handlePublish = async () => {
    if (!examId) return;
    if (!confirm('Are you sure you want to publish these results? This will make them visible to students and become immutable.')) return;
    setPublishing(true);
    try {
      await api.post('/results/publish', { examId });
      toast.success('Results published successfully');
      setExams(prev => prev.map(e => e._id === examId ? { ...e, isPublished: true } : e));
      setTab('published');
    } catch(err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  };

  const printCard = () => window.print();

  const totalStudents = summary?.students.length ?? 0;
  const passedStudents = summary?.students.filter((s) => s.grade !== 'F' && s.percentage >= 33).length ?? 0;
  const failedStudents = totalStudents - passedStudents;
  const avgPercentage = totalStudents > 0
    ? (summary?.students.reduce((acc, s) => acc + s.percentage, 0) ?? 0) / totalStudents
    : 0;
  const highestPercentage = totalStudents > 0
    ? Math.max(...(summary?.students.map((s) => s.percentage) ?? [0]))
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isStudent ? 'My Results' : 'Results & Rankings'}
        description={isStudent
          ? 'Your result cards for published exams.'
          : 'Class rankings, grades, class performance metrics, and printable result cards.'}
        crumbs={[{ label: 'Results' }]}
        actions={
          !isStudent && summary && summary.students.length > 0 ? (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={printCard}>
              <Printer className="mr-2 h-4 w-4" /> Print Overview
            </Button>
          ) : undefined
        }
      />

      {!isStudent && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/60">
          <div className="flex items-center gap-3">
            <Select value={examId} onValueChange={(v) => setSearchParams({ examId: v })}>
              <SelectTrigger className="w-72 bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm"><SelectValue placeholder="Select an exam" /></SelectTrigger>
              <SelectContent>
                {exams.length === 0 && <SelectItem value="__none" disabled>No exams yet</SelectItem>}
                {exams.map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    <div className="flex items-center gap-2">
                      <Badge variant={e.isPublished ? 'default' : 'secondary'} className="h-4 text-[10px] px-1">{e.isPublished ? 'PUB' : 'DRFT'}</Badge>
                      {e.name} · {e.className ?? '—'}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {summary && (
              <Badge variant="outline" className="px-2.5 py-1 text-xs font-normal">
                {summary.classStrength} student{summary.classStrength === 1 ? '' : 's'} · {summary.gradeScale?.name ?? 'Default scale'}
              </Badge>
            )}
          </div>
          
          <Tabs value={tab} onValueChange={setTab} className="w-[400px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="draft">Draft / Calculate</TabsTrigger>
              <TabsTrigger value="published">Published Results</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {!isStudent && tab === 'draft' && summary && (
        <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-xl border border-blue-100">
          <div>
            <h3 className="font-semibold text-blue-900">Draft Results</h3>
            <p className="text-sm text-blue-700 mt-1">Preview current result calculations before publishing. Changes to marks will dynamically reflect here.</p>
          </div>
          {summary.exam.isPublished ? (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Already Published</Badge>
          ) : (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" /> Publish Results
            </Button>
          )}
        </div>
      )}

      {/* Top Performance Summary (Section 31) */}
      {!isStudent && summary && summary.students.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="TOTAL STUDENTS"
            value={totalStudents}
            icon={Users}
            tone="default"
            loading={loading}
            description="Students assessed"
          />
          <StatCard
            title="PASSED"
            value={passedStudents}
            icon={CheckCircle2}
            tone="primary"
            loading={loading}
            description={`${totalStudents > 0 ? Math.round((passedStudents / totalStudents) * 100) : 0}% pass rate`}
          />
          <StatCard
            title="FAILED"
            value={failedStudents}
            icon={AlertTriangle}
            tone={failedStudents > 0 ? 'destructive' : 'default'}
            loading={loading}
            description="Needs remedial"
          />
          <StatCard
            title="CLASS AVERAGE"
            value={`${avgPercentage.toFixed(1)}%`}
            icon={TrendingUp}
            tone="primary"
            loading={loading}
            description="Overall mean score"
          />
          <StatCard
            title="HIGHEST SCORE"
            value={`${highestPercentage.toFixed(1)}%`}
            icon={Award}
            tone="warning"
            loading={loading}
            description="Top class rank"
          />
        </div>
      )}

      {isStudent && exams.length === 0 && !loading && (
        <EmptyState title="No published results yet" description="Your result cards will appear here once an exam is published." />
      )}

      {isStudent && card && (
        <div className="print-area">
          <ResultCardView card={card} />
        </div>
      )}

      {isStudent && cardLoading && <div className="space-y-2"><Skeleton className="h-64 w-full max-w-2xl" /></div>}

      {!isStudent && loading && <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>}

      {!isStudent && !loading && summary && (
        <DataTable
          columns={columns}
          data={summary.students}
          loading={false}
          rowKey={(r) => r.studentId}
          emptyTitle="No marks recorded"
          emptyDescription="Enter marks for this exam first — the ranking appears here."
        />
      )}

      {/* Result card dialog (staff view) */}
      <Dialog open={Boolean(card) && !isStudent} onOpenChange={(o) => !o && setCard(null)}>
        <DialogContent className="max-w-2xl print-area">
          <DialogHeader>
            <DialogTitle className="sr-only">Result card</DialogTitle>
            <DialogDescription className="sr-only">Printable result card</DialogDescription>
          </DialogHeader>
          {cardLoading && <Skeleton className="h-80 w-full" />}
          {!cardLoading && card && (
            <div>
              <ResultCardView card={card} />
              <div className="mt-4 flex justify-end gap-2 print:hidden">
                <Button variant="outline" onClick={() => setCard(null)}>Close</Button>
                <Button onClick={printCard}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print button for student view */}
      {isStudent && card && (
        <div className="mt-4 print:hidden">
          <Button onClick={printCard}><Printer className="mr-1.5 h-4 w-4" /> Print result card</Button>
        </div>
      )}
    </div>
  );
}

function ResultCardView({ card }: { card: ResultCard }) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">{card.exam.name}</h2>
          <p className="text-sm text-muted-foreground">Result card · {formatDate(card.exam.examDate)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{formatStudentIdentity(card.student as any)}</p>
          <p className="text-xs text-muted-foreground">
            {card.student.className} · Section {card.student.sectionName} · {card.student.sessionName}
          </p>
          <p className="text-xs text-muted-foreground">
            {card.student.examRollNumber ? `Exam Roll ${card.student.examRollNumber} · ` : card.student.rollNumber ? `Roll ${card.student.rollNumber} · ` : ''} 
            {card.student.admissionNumber}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Subject</th>
              <th className="py-2 pr-2 text-right font-medium">Obtained</th>
              <th className="py-2 pr-2 text-right font-medium">Max</th>
              <th className="py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((s) => (
              <tr key={s.subjectId} className="border-b last:border-0">
                <td className="py-2 pr-2">{s.name} <span className="text-xs text-muted-foreground">({s.code})</span></td>
                <td className="py-2 pr-2 text-right font-medium">{s.marksObtained}</td>
                <td className="py-2 pr-2 text-right text-muted-foreground">{s.maxMarks}</td>
                <td className="py-2 text-right">
                  <Badge variant={s.status === 'pass' ? 'outline' : s.status === 'absent' ? 'secondary' : 'destructive'}>
                    {s.status}
                  </Badge>
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-3 pr-2">Total</td>
              <td className="py-3 pr-2 text-right">{card.total.obtained}</td>
              <td className="py-3 pr-2 text-right">{card.total.max}</td>
              <td className="py-3 text-right">{card.percentage.toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-3">
          <Badge className="bg-teal-600 px-3 py-1 text-sm text-white">{card.grade}</Badge>
          <span className="text-sm text-muted-foreground">Rank {card.rank} of {card.classStrength}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Award className="h-4 w-4" /> {card.gradeScale?.name ?? 'Default scale'}
        </div>
      </div>
    </div>
  );
}
