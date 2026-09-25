import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Plus, Pencil, Archive, ArchiveRestore, Search, Users, Layers, FileSpreadsheet, Download, Eye, Loader2, School, UploadCloud, CalendarRange, MoreHorizontal, UserCheck, History } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ImportWizardModal } from '@/components/dataTransfer/ImportWizardModal';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { initials } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { AssignSubstituteModal } from '@/components/classes/AssignSubstituteModal';
import { ManageClassTeacherModal } from '@/components/classes/ManageClassTeacherModal';
import { ActiveSubstitutesModal } from '@/components/classes/ActiveSubstitutesModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface SessionRow { _id: string; name: string; isActive: boolean; isArchived: boolean }

interface ClassRow {
  _id: string; name: string; code: string; sessionId: string;
  studentCount: number; sectionCount: number; isArchived: boolean;
  classTeacherId?: string | null;
  classTeacherName?: string | null;
}

interface StudentRow {
  _id: string;
  admissionNumber: string;
  rollNumber: string;
  fullName: string;
  profilePhotoUrl: string | null;
  gender: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  sessionName: string;
  guardianName?: string;
  guardianPhone?: string;
  phone?: string;
  isActive: boolean;
  isArchived: boolean;
}

const schema = z.object({
  name: z.string().trim().min(1, 'Class name required').max(60),
  code: z.string().trim().max(20).optional(),
  sessionId: z.string().min(1, 'Select a session'),
});
type FormValues = z.infer<typeof schema>;

export function ClassesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState<ClassRow[]>([]);
  const [summary, setSummary] = useState<{ totalStudents: number; totalSections: number } | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [search, setSearch] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ClassRow | null>(null);
  const [substituteTarget, setSubstituteTarget] = useState<ClassRow | null>(null);
  const [manageTeacherTarget, setManageTeacherTarget] = useState<ClassRow | null>(null);
  const [substituteHistoryTarget, setSubstituteHistoryTarget] = useState<ClassRow | null>(null);

  // Class Student Sheet state
  const [selectedClassForSheet, setSelectedClassForSheet] = useState<ClassRow | null>(null);
  const [classStudents, setClassStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');
  const [exportingSheet, setExportingSheet] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importContextClass, setImportContextClass] = useState<ClassRow | null>(null);

  const canEdit = can('classes', 'edit');
  const canCreate = can('classes', 'create');

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionRow>>('/academic-sessions/lookup').then((r) => {
      const activeSessions = r.data.data.filter((s) => !s.isArchived);
      setSessions(activeSessions);
      const active = activeSessions.find((s) => s.isActive);
      if (active) {
        setSessionId(active._id);
      }
      setSessionReady(true);
    }).catch(() => {
      setSessionReady(true);
    });
  });

  const load = useCallback(async () => {
    if (!sessionReady) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (sessionId) params.set('sessionId', sessionId);
      const res = await api.get<ApiListResponse<ClassRow> & { summary?: { totalStudents: number; totalSections: number } }>(`/classes?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionReady, pagination.page, pagination.limit, search, sessionId]);

  useEffect(() => { load(); }, [load]);

  // Load students whenever a class is selected for the sheet
  useEffect(() => {
    if (!selectedClassForSheet) {
      setClassStudents([]);
      setSheetSearch('');
      return;
    }
    setLoadingStudents(true);
    api
      .get<ApiListResponse<StudentRow>>(`/students?classId=${selectedClassForSheet._id}&limit=200`)
      .then((res) => setClassStudents(res.data.data))
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoadingStudents(false));
  }, [selectedClassForSheet]);

  const filteredStudents = classStudents.filter((s) => {
    if (!sheetSearch) return true;
    const q = sheetSearch.toLowerCase();
    return (
      s.fullName?.toLowerCase().includes(q) ||
      s.rollNumber?.toLowerCase().includes(q) ||
      s.admissionNumber?.toLowerCase().includes(q) ||
      s.sectionName?.toLowerCase().includes(q) ||
      s.guardianName?.toLowerCase().includes(q)
    );
  });

  const handleExportClassSheet = async () => {
    if (!selectedClassForSheet) return;
    setExportingSheet(true);
    try {
      const res = await api.get(`/data-transfer/export/students?classId=${selectedClassForSheet._id}&format=xlsx`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedClassForSheet.name.replace(/\s+/g, '_')}_Student_Sheet.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedClassForSheet.name} sheet exported successfully!`);
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Export failed');
    } finally {
      setExportingSheet(false);
    }
  };

  const columns: Column<ClassRow>[] = [
    {
      key: 'name', header: 'Class',
      cell: (row) => (
        <div className="leading-tight group cursor-pointer" onClick={() => setSelectedClassForSheet(row)}>
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
            {row.name}
            <span className="text-[10px] font-normal text-muted-foreground group-hover:text-primary/80">· Click to view sheet</span>
          </p>
          {row.code && <p className="text-xs text-muted-foreground">{row.code}</p>}
        </div>
      ),
    },
    {
      key: 'students', header: 'Enrolled Strength',
      cell: (row) => (
        <button
          onClick={() => setSelectedClassForSheet(row)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>{row.studentCount} Students · View Sheet</span>
        </button>
      ),
    },
    {
      key: 'classTeacher', header: 'Class Teacher',
      cell: (row) => (
        <span className="text-sm font-medium text-muted-foreground">{row.classTeacherName ?? '—'}</span>
      ),
    },
    {
      key: 'sections', header: 'Sections',
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> {row.sectionCount}
        </span>
      ),
    },
    {
      key: 'actions', header: '', headerClassName: 'w-48 text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs rounded-xl gap-1 border-border/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium"
            onClick={() => setSelectedClassForSheet(row)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Class Sheet
          </Button>
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => { setEditing(row); setFormOpen(true); }} title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setArchiveTarget(row)} title="Archive">
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Class Teacher</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setManageTeacherTarget(row)}>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Assign / Change / Unassign
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Temporary Substitutes</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setSubstituteTarget(row)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Substitute
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSubstituteHistoryTarget(row)}>
                    <History className="h-4 w-4 mr-2" />
                    View History & Cancel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      ),
    },
  ];

  const totalClasses = pagination.total || data.length;
  const totalStudents = summary?.totalStudents ?? data.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const totalSections = summary?.totalSections ?? data.reduce((sum, c) => sum + (c.sectionCount || 0), 0);
  const activeSessionName = sessions.find((s) => s.isActive)?.name || 'Current Term';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Classes"
        description="Grade levels, sections, and student capacity."
        crumbs={[{ label: 'Classes & Roster' }, { label: 'Classes' }]}
        actions={
          <div className="flex items-center gap-2">

            {canCreate && (
              <Button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all"
              >
                <Plus className="mr-1.5 h-4 w-4 stroke-[2.5]" /> Add Class
              </Button>
            )}
          </div>
        }
      />

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Total Classes" value={totalClasses} icon={School} tone="primary" loading={loading} />
        <StatCard title="Enrolled Students" value={totalStudents} icon={Users} tone="success" loading={loading} />
        <StatCard title="Total Sections" value={totalSections} icon={Layers} tone="gold" loading={loading} />
        <StatCard title="Active Session" value={activeSessionName || 'None'} icon={CalendarRange} tone="navy" loading={loading} />
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] p-3 shadow-sm flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search classes…"
            className="pl-9 h-9 text-xs rounded-xl bg-background/50 border-border/60"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          />
        </div>
        <Select value={sessionId || undefined} onValueChange={(v) => { setSessionId(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-56 h-9 text-xs rounded-xl"><SelectValue placeholder="All sessions" /></SelectTrigger>
          <SelectContent>
            {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}{s.isActive ? ' (active)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          pagination={pagination}
          rowKey={(r) => r._id}
          onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
          onRowClick={(row) => setSelectedClassForSheet(row)}
          emptyTitle="No classes found"
          emptyDescription="Add your first class for the selected session."
        />
      </div>

      <ClassFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} sessions={sessions} onSaved={load} />

      <ConfirmDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}
        title="Archive this class?" description={`"${archiveTarget?.name}" will be hidden. Its students and records are preserved.`}
        confirmLabel="Archive" destructive loading={busy}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          try {
            await api.post(`/classes/${archiveTarget._id}/archive`);
            toast.success('Class archived');
            setArchiveTarget(null);
            load();
          } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
        }} />

      <AssignSubstituteModal
        open={!!substituteTarget}
        onOpenChange={(o) => !o && setSubstituteTarget(null)}
        classId={substituteTarget?._id || null}
        className={substituteTarget?.name || ''}
      />

      <ManageClassTeacherModal
        open={!!manageTeacherTarget}
        onOpenChange={(o) => !o && setManageTeacherTarget(null)}
        classId={manageTeacherTarget?._id || null}
        className={manageTeacherTarget?.name || ''}
        currentTeacherId={data.find(c => c._id === manageTeacherTarget?._id)?.classTeacherId}
        currentTeacherName={data.find(c => c._id === manageTeacherTarget?._id)?.classTeacherName}
        onAssigned={load}
      />

      <ActiveSubstitutesModal
        open={!!substituteHistoryTarget}
        onOpenChange={(o) => !o && setSubstituteHistoryTarget(null)}
        classId={substituteHistoryTarget?._id || null}
        className={substituteHistoryTarget?.name || ''}
      />

      {/* ── Class Student Roster Sheet Dialog ── */}
      <Dialog open={Boolean(selectedClassForSheet)} onOpenChange={(o) => !o && setSelectedClassForSheet(null)}>
        <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] p-0 overflow-hidden flex flex-col rounded-3xl border-border/80 shadow-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
                  <School className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <span>{selectedClassForSheet?.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-primary/15 text-primary border border-primary/25">
                      Class Register Sheet
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Official student roster, roll numbers, admission records, and enrollment ledger for this class.
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs gap-1.5 border-border/80 hover:bg-muted/50 transition-all font-medium"
                onClick={handleExportClassSheet}
                disabled={exportingSheet || classStudents.length === 0}
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                {exportingSheet ? 'Exporting...' : 'Export Sheet'}
              </Button>
              {can('students', 'create') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs gap-1.5 border-border/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-all font-semibold"
                  onClick={() => {
                    setImportContextClass(selectedClassForSheet);
                    setImportModalOpen(true);
                  }}
                >
                  <UploadCloud className="h-3.5 w-3.5 text-primary" />
                  Import Excel / Sheet
                </Button>
              )}
              {canCreate && (
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs rounded-xl gap-1.5 shadow-sm font-semibold"
                  onClick={() => navigate(`/students/new?classId=${selectedClassForSheet?._id}`)}
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" /> Admit to Class
                </Button>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3.5 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search student name, roll no, admission ID…"
                className="pl-8 h-8 text-xs rounded-xl bg-background"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Showing {filteredStudents.length} of {classStudents.length} Students</span>
            </div>
          </div>

          {/* Sheet Body Table */}
          <div className="flex-1 overflow-y-auto p-6 max-h-[60vh]">
            {loadingStudents ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Loading class student sheet...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">No students found</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sheetSearch ? 'No students matched your search query.' : `No students have been enrolled in ${selectedClassForSheet?.name} yet.`}
                  </p>
                </div>
                {can('students', 'create') && !sheetSearch && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setImportContextClass(selectedClassForSheet);
                        setImportModalOpen(true);
                      }}
                      className="rounded-xl text-xs border-primary/30 text-primary hover:bg-primary/10 font-semibold gap-1.5"
                    >
                      <UploadCloud className="h-3.5 w-3.5" /> Import from Sheet (Excel / Google Sheet)
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/students/new?classId=${selectedClassForSheet?._id}`)}
                      className="rounded-xl text-xs bg-primary text-primary-foreground font-semibold"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Admit First Student
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border/70 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3.5 py-3 w-12 text-center">#</th>
                      <th className="px-3.5 py-3">Roll No</th>
                      <th className="px-3.5 py-3">Admission ID</th>
                      <th className="px-3.5 py-3">Student Name</th>
                      <th className="px-3.5 py-3">Gender</th>
                      <th className="px-3.5 py-3">Section</th>
                      <th className="px-3.5 py-3">Father / Guardian</th>
                      <th className="px-3.5 py-3">Contact</th>
                      <th className="px-3.5 py-3 text-center">Status</th>
                      <th className="px-3.5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredStudents.map((s, idx) => (
                      <tr
                        key={s._id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => navigate(`/students/${s._id}`)}
                      >
                        <td className="px-3.5 py-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="px-3.5 py-3 font-mono font-bold text-foreground">
                          {s.rollNumber ? (
                            <span className="px-2 py-0.5 rounded-md bg-muted font-bold text-foreground">
                              {s.rollNumber}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-muted-foreground">{s.admissionNumber}</td>
                        <td className="px-3.5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7 ring-1 ring-border/50">
                              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                {initials(s.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{s.fullName}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-3">
                          <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5">
                            {s.gender}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-3 font-medium text-foreground">
                          {s.sectionName ? `Section ${s.sectionName}` : '—'}
                        </td>
                        <td className="px-3.5 py-3 text-muted-foreground">
                          {s.guardianName || '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-muted-foreground">
                          {s.phone || s.guardianPhone || '—'}
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          {s.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-primary hover:bg-primary/10 rounded-lg font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/students/${s._id}`);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> Profile
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Click any student row to view full student details, academic records, and fee history.
            </p>
            <Button variant="outline" size="sm" className="rounded-xl text-xs font-medium" onClick={() => setSelectedClassForSheet(null)}>
              Close Sheet
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportWizardModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        module="students"
        moduleLabel={importContextClass ? `Students (${importContextClass.name})` : 'Students'}
        additionalParams={{
          classId: importContextClass?._id || '',
          className: importContextClass?.name || '',
        }}
        onSuccess={() => {
          load();
          if (selectedClassForSheet) {
            setLoadingStudents(true);
            api
              .get<ApiListResponse<StudentRow>>(`/students?classId=${selectedClassForSheet._id}&limit=200`)
              .then((res) => setClassStudents(res.data.data))
              .catch(() => {})
              .finally(() => setLoadingStudents(false));
          }
        }}
      />
    </div>
  );
}

function ClassFormDialog({ open, onOpenChange, editing, sessions, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: ClassRow | null;
  sessions: SessionRow[]; onSaved: () => void;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', sessionId: '' },
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      reset(editing
        ? { name: editing.name, code: editing.code, sessionId: editing.sessionId }
        : { name: '', code: '', sessionId: sessions.find((s) => s.isActive)?._id ?? '' });
    }
  }, [open, editing, reset, sessions]);

  const onSubmit = async (values: FormValues) => {
    setBusy(true);
    try {
      const payload = { ...values };
      if (editing) { await api.patch(`/classes/${editing._id}`, payload); toast.success('Class updated'); }
      else { await api.post('/classes', payload); toast.success('Class created'); }
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit class' : 'Add class'}</DialogTitle>
          <DialogDescription>Classes live inside an academic session.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Class name</Label>
            <Input id="c-name" placeholder="Grade 5" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-code">Code</Label>
              <Input id="c-code" placeholder="G5" {...register('code')} />
            </div>
            <div className="space-y-1.5">
              <Label>Session</Label>
              <Select value={watch('sessionId') || undefined} onValueChange={(v) => setValue('sessionId', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.sessionId && <p className="text-xs text-destructive">{errors.sessionId.message}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create class'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
