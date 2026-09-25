import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MoreHorizontal, Pencil, Archive, ArchiveRestore, Eye, Download, Users, BadgeCheck, User, GraduationCap, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { initials, formatStudentIdentity } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionLite { _id: string; name: string; classId: string }
interface StudentRow {
  _id: string; admissionNumber: string; rollNumber: string; fullName: string;
  fatherName?: string | null; caste?: string | null; guardianName?: string | null;
  profilePhotoUrl: string | null; gender: string; sessionId: string; classId: string; sectionId: string;
  className: string; sectionName: string; sessionName: string; isActive: boolean; isArchived: boolean;
}

export function StudentsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<StudentRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [gender, setGender] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<{ total: number; active: number; male: number; female: number }>({
    total: 0,
    active: 0,
    male: 0,
    female: 0,
  });
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<StudentRow | null>(null);
  const [pendingDuesWarning, setPendingDuesWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = can('students', 'edit');
  const canCreate = can('students', 'create');
  const canArchive = can('students', 'archive');

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => {
      const all = r.data.data.filter((s) => !s.isArchived);
      setSessions(all);
      setSessionId(all.find((s) => s.isActive)?._id ?? '');
    }).catch(() => {});
    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => setClasses(r.data.data)).catch(() => {});
    api.get<ApiListResponse<SectionLite>>('/sections/lookup').then((r) => setSections(r.data.data)).catch(() => {});
  });

  // 300ms search input debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sessionId) params.set('sessionId', sessionId);
      if (classId) params.set('classId', classId);
      if (sectionId) params.set('sectionId', sectionId);
      if (gender) params.set('gender', gender);
      if (status) params.set('status', status);
      const res = await api.get<ApiListResponse<StudentRow>>(`/students?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      if ((res.data as any).summary) {
        setSummary((res.data as any).summary);
      }
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, debouncedSearch, sessionId, classId, sectionId, gender, status]);

  useEffect(() => { load(); }, [load]);

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }));

  const columns: Column<StudentRow>[] = [
    {
      key: 'student', header: 'Student',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(row.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium" title={formatStudentIdentity(row)}>{formatStudentIdentity(row)}</p>
            <p className="truncate text-xs text-muted-foreground">{row.admissionNumber}</p>
          </div>
        </div>
      ),
    },
    { key: 'roll', header: 'Roll', cell: (row) => <span className="text-sm">{row.rollNumber || '—'}</span> },
    { key: 'caste', header: 'Caste', cell: (row) => <span className="text-sm">{row.caste || '—'}</span>, className: 'hidden md:table-cell' },
    {
      key: 'class', header: 'Class',
      cell: (row) => (
        <div className="leading-tight">
          <p className="text-sm">{row.className}</p>
          <p className="text-xs text-muted-foreground">Section {row.sectionName} · {row.sessionName}</p>
        </div>
      ),
    },
    {
      key: 'gender', header: 'Gender',
      cell: (row) => <Badge variant="outline" className="capitalize">{row.gender}</Badge>,
    },
    {
      key: 'status', header: 'Status',
      cell: (row) => row.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>,
    },
    {
      key: 'actions', header: '', headerClassName: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Record actions" variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Student actions</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/students/${row._id}`)}>
              <Eye className="h-4 w-4" /> View profile
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/students/${row._id}?edit=1`)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
            )}
            {canArchive && (
              <>
                <DropdownMenuSeparator />
                {row.isArchived ? (
                  <DropdownMenuItem className="cursor-pointer" onClick={() => {
                    api.post(`/students/${row._id}/restore`).then(() => { toast.success('Student restored'); load(); }).catch((e) => toast.error(apiErrorMessage(e)));
                  }}>
                    <ArchiveRestore className="h-4 w-4" /> Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer text-destructive" onClick={() => setArchiveTarget(row)}>
                    <Archive className="h-4 w-4" /> Archive
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const sessionClasses = classes.filter((c) => c.sessionId === sessionId);
  const classSections = sections.filter((s) => s.classId === classId);
  const hasFilters = search || classId || sectionId || gender || status;

  const [exporting, setExporting] = useState(false);

  const handleExportFiltered = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'xlsx' });
      if (sessionId) params.append('sessionId', sessionId);
      if (classId) params.append('classId', classId);
      if (sectionId) params.append('sectionId', sectionId);
      if (gender) params.append('gender', gender);
      if (status) params.append('status', status);

      const res = await api.get(`/data-transfer/export/students?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Students_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Filtered student list exported');
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalCount = summary.total || pagination.total || data.length;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Students Directory"
        description="Comprehensive student records, admissions, rosters, and academic tracking."
        crumbs={[{ label: 'Students' }]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/80 hover:bg-muted/50 transition-all font-medium text-xs shadow-sm"
              onClick={handleExportFiltered}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              {exporting ? 'Exporting...' : 'Export View'}
            </Button>
            {canCreate && (
              <>

                <Button
                  onClick={() => navigate('/students/new')}
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all"
                >
                  <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" /> Admit Student
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Total Enrolled" value={totalCount} icon={Users} tone="primary" loading={loading} />
        <StatCard title="Active Learners" value={summary.active} icon={BadgeCheck} tone="success" loading={loading} />
        <StatCard title="Boys" value={summary.male} icon={User} tone="navy" loading={loading} />
        <StatCard title="Girls" value={summary.female} icon={GraduationCap} tone="gold" loading={loading} />
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] p-3 shadow-sm flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Name, admission no, roll no…"
            className="pl-9 h-9 text-xs rounded-xl bg-background/50 border-border/60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sessionId || undefined} onValueChange={(v) => { setSessionId(v); setClassId(''); setSectionId(''); resetPage(); }}>
          <SelectTrigger className="w-full lg:w-40 h-9 text-xs rounded-xl"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={classId || undefined} onValueChange={(v) => { setClassId(v); setSectionId(''); resetPage(); }}>
          <SelectTrigger className="w-full lg:w-36 h-9 text-xs rounded-xl"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            {sessionClasses.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sectionId || undefined} onValueChange={(v) => { setSectionId(v); resetPage(); }}>
          <SelectTrigger className="w-full lg:w-36 h-9 text-xs rounded-xl"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            {classSections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={gender || undefined} onValueChange={(v) => { setGender(v); resetPage(); }}>
          <SelectTrigger className="w-full lg:w-32 h-9 text-xs rounded-xl"><SelectValue placeholder="Gender" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status || undefined} onValueChange={(v) => { setStatus(v); resetPage(); }}>
          <SelectTrigger className="w-full lg:w-36 h-9 text-xs rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-9 rounded-xl hover:bg-muted/70 text-muted-foreground"
            onClick={() => {
              setSearch('');
              setClassId('');
              setSectionId('');
              setGender('');
              setStatus('');
              const activeSession = sessions.find((s) => s.isActive);
              setSessionId(activeSession?._id ?? '');
              resetPage();
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* ── Students Table ── */}
      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          pagination={pagination}
          rowKey={(r) => r._id}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
          onLimitChange={(limit) => setPagination((p) => ({ ...p, limit, page: 1 }))}
          onRowClick={(row) => navigate(`/students/${row._id}`)}
          emptyTitle="No students found"
          emptyDescription="Adjust filters or admit a new student."
        />
      </div>



      <ConfirmDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) { setArchiveTarget(null); setPendingDuesWarning(null); } }}
        title="Archive this student?"
        description={
          pendingDuesWarning
            ? `⚠️ Outstanding dues detected: ${pendingDuesWarning}. Archiving will hide ${archiveTarget?.fullName} from active academic lists, but fee records will be preserved. Proceed?`
            : `${archiveTarget?.fullName} (${archiveTarget?.admissionNumber}) will be hidden. Academic history is preserved.`
        }
        confirmLabel={pendingDuesWarning ? "Archive with dues" : "Archive"}
        destructive loading={busy}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          try {
            await api.post(`/students/${archiveTarget._id}/archive`, { confirmWithDues: !!pendingDuesWarning });
            toast.success('Student archived');
            setArchiveTarget(null);
            setPendingDuesWarning(null);
            load();
          } catch (err: any) {
            const code = err?.response?.data?.error?.code;
            const details = err?.response?.data?.error?.details;
            if (code === 'STUDENT_HAS_PENDING_DUES' && details?.pendingBalanceRs) {
              setPendingDuesWarning(`Rs ${details.pendingBalanceRs}`);
              toast.error(err.response.data.error.message || 'Student has outstanding fees');
            } else {
              toast.error(apiErrorMessage(err));
            }
          } finally { setBusy(false); }
        }} />
    </div>
  );
}
