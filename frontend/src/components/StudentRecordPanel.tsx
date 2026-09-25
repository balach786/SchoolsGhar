import { useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiDataResponse, type ApiListResponse } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDate } from '@/lib/format';
import { RevealCard } from '@/components/motion';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Kind = 'attendance' | 'results' | 'fees';
interface RecordRow { _id: string; attendanceDate?: string; status: string; feeTitle?: string; netPayable?: number; amountPaid?: number; remainingBalance?: number }
interface Exam { _id: string; name: string }
interface Result { total: { obtained: number; max: number }; percentage: number | null; grade: string | null; subjects: { subjectId: string; name: string; marksObtained: number | null; maxMarks: number; status: string }[] }
const titles = { attendance: 'Attendance records', results: 'Published results', fees: 'Student fees' };
const modules = { attendance: 'studentAttendance', results: 'results', fees: 'fees' };

/** Loads only the active profile tab; every request retains server-side school and role checks. */
export function StudentRecordPanel({ kind, studentId, sessionId, classId }: { kind: Kind; studentId: string; sessionId: string; classId: string }) {
  const { can } = useAuth();
  const allowed = can(modules[kind]);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!allowed || kind !== 'results') return;
    let cancelled = false;
    setLoading(true); setError('');
    api.get<ApiListResponse<Exam>>('/exams', { params: { sessionId, classId, published: true, limit: 100 } })
      .then(res => { if (!cancelled) { setExams(res.data.data); setExamId(res.data.data[0]?._id ?? ''); } })
      .catch(err => { if (!cancelled) setError(apiErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, kind, sessionId, classId, retry]);

  useEffect(() => {
    if (!allowed || (kind === 'results' && !examId)) return;
    let cancelled = false;
    setLoading(true); setError(''); setResult(null);
    const request = kind === 'results'
      ? api.get<ApiDataResponse<Result>>(`/results/${examId}/students/${studentId}`).then(res => { if (!cancelled) setResult(res.data.data); })
      : api.get<ApiListResponse<RecordRow>>(kind === 'attendance' ? '/student-attendance' : '/student-fees', { params: { studentId, sessionId, page, limit: 20 } }).then(res => { if (!cancelled) { setRows(res.data.data); setTotal(res.data.pagination.total); } });
    request.catch(err => { if (!cancelled) setError(apiErrorMessage(err)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, kind, studentId, sessionId, examId, page, retry]);

  return <RevealCard><CardHeader><CardTitle>{titles[kind]}</CardTitle></CardHeader><CardContent className="space-y-4">
    {!allowed ? <p className="text-sm text-muted-foreground">Your role does not have access to these records.</p> : <>
      {kind === 'results' && exams.length > 0 && <label className="grid gap-2 text-sm">Published exam<select aria-label="Published exam" className="h-10 w-full min-w-0 rounded-lg border bg-background px-3" value={examId} onChange={event => setExamId(event.target.value)}>{exams.map(exam => <option key={exam._id} value={exam._id}>{exam.name}</option>)}</select></label>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading records…</p> : error ? <div role="alert"><p className="mb-3 text-sm">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div> : kind === 'results' ? result ? <>
        <p className="text-sm">Total: {result.total.obtained} / {result.total.max} · {result.percentage === null ? 'Not graded' : `${result.percentage.toFixed(1)}%`} · Grade {result.grade ?? '—'}</p>
        <Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Marks</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{result.subjects.map(subject => <TableRow key={subject.subjectId}><TableCell>{subject.name}</TableCell><TableCell>{subject.marksObtained ?? '—'} / {subject.maxMarks}</TableCell><TableCell>{subject.status}</TableCell></TableRow>)}</TableBody></Table>
      </> : <p className="text-sm text-muted-foreground">No published exams for this class and session.</p> : rows.length ? <>
        <Table><TableHeader><TableRow>{(kind === 'attendance' ? ['Date', 'Status'] : ['Fee', 'Payable', 'Paid', 'Balance', 'Status']).map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row._id}>{kind === 'attendance' ? <TableCell>{formatDate(row.attendanceDate)}</TableCell> : <><TableCell>{row.feeTitle}</TableCell><TableCell>{formatCurrency(row.netPayable)}</TableCell><TableCell>{formatCurrency(row.amountPaid)}</TableCell><TableCell>{formatCurrency(row.remainingBalance)}</TableCell></>}<TableCell className="capitalize">{row.status}</TableCell></TableRow>)}</TableBody></Table>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total} records</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span>{page}</span><Button size="sm" variant="outline" disabled={page * 20 >= total} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>
      </> : <p className="text-sm text-muted-foreground">No {kind === 'attendance' ? 'attendance' : 'fee'} records for this student in this session.</p>}
    </>}
  </CardContent></RevealCard>;
}
