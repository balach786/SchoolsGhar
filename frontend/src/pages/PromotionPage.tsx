import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Users, CheckCircle2, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiListResponse, ApiDataResponse } from '@/lib/api';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionLite { _id: string; name: string; classId: string }
interface PreviewStudent { _id: string; fullName: string; admissionNumber: string; rollNumber: string; gender: string; isActive: boolean }
interface PreviewData { total: number; students: PreviewStudent[] }

export function PromotionPage() {
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [sections, setSections] = useState<SectionLite[]>([]);

  // Real loaded flag — sectionless detection only valid after fetch completes (correction #22)
  const [dataLoaded, setDataLoaded] = useState(false);

  const [src, setSrc] = useState({ sessionId: '', classId: '', sectionId: '' });
  const [dst, setDst] = useState({ sessionId: '', classId: '', sectionId: '' });

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [result, setResult] = useState<{ total: number; promoted: number; skipped: number } | null>(null);

  useEffectOnce(() => {
    let sessionsLoaded = false;
    let classesLoaded = false;
    let sectionsLoaded = false;

    const checkAllLoaded = () => {
      if (sessionsLoaded && classesLoaded && sectionsLoaded) setDataLoaded(true);
    };

    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => {
      const all = r.data.data.filter((s) => !s.isArchived);
      setSessions(all);
      const active = all.find((s) => s.isActive)?._id ?? '';
      const next = all.find((s) => !s.isActive)?._id ?? active;
      setSrc((p) => ({ ...p, sessionId: active }));
      setDst((p) => ({ ...p, sessionId: next }));
    }).catch(() => {}).finally(() => { sessionsLoaded = true; checkAllLoaded(); });

    api.get<ApiListResponse<ClassLite>>('/classes/lookup').then((r) => setClasses(r.data.data)).catch(() => {}).finally(() => { classesLoaded = true; checkAllLoaded(); });
    api.get<ApiListResponse<SectionLite>>('/sections/lookup').then((r) => setSections(r.data.data)).catch(() => {}).finally(() => { sectionsLoaded = true; checkAllLoaded(); });
  });

  const srcClasses = classes.filter((c) => c.sessionId === src.sessionId);
  const dstClasses = classes.filter((c) => c.sessionId === dst.sessionId);
  const srcSections = sections.filter((s) => s.classId === src.classId);
  const dstSections = sections.filter((s) => s.classId === dst.classId);

  // Sectionless detection: only after data is loaded (correction #22)
  const srcIsSectionless = dataLoaded && src.classId !== '' && srcSections.length === 0;
  const dstIsSectionless = dataLoaded && dst.classId !== '' && dstSections.length === 0;

  // canPreview: section required only if class has sections; also same-session exclusion (correction #23)
  const canPreview = src.sessionId && src.classId
    && (srcIsSectionless || src.sectionId)
    && dst.sessionId && dst.classId
    && (dstIsSectionless || dst.sectionId)
    && src.sessionId !== dst.sessionId
    && dataLoaded;

  // Destination session excludes source session (correction #23)
  const dstSessionOptions = sessions.filter((s) => s._id !== src.sessionId);

  // When source session changes, clear dst if it became same (correction #23)
  useEffect(() => {
    if (dst.sessionId && dst.sessionId === src.sessionId) {
      setDst({ sessionId: '', classId: '', sectionId: '' });
      setPreview(null);
      setResult(null);
    }
  }, [src.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreview = useCallback(async () => {
    if (!canPreview) return;
    setLoading(true);
    setResult(null);
    setSelected(new Set());
    try {
      const params: Record<string, string> = {
        sessionId: src.sessionId,
        classId: src.classId,
        toSessionId: dst.sessionId,
        toClassId: dst.classId,
      };
      if (src.sectionId) params.sectionId = src.sectionId;
      if (dst.sectionId) params.toSectionId = dst.sectionId;

      const res = await api.get<ApiDataResponse<PreviewData>>('/promotions/preview', { params });
      setPreview(res.data.data);
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [canPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (canPreview) loadPreview();
  }, [src, dst, canPreview, loadPreview]);

  const allSelected = preview ? selected.size === preview.students.length : false;

  const toggleAll = () => {
    if (!preview) return;
    setSelected(allSelected ? new Set() : new Set(preview.students.map((s) => s._id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const promote = async () => {
    setPromoting(true);
    try {
      const res = await api.post<ApiDataResponse<{ total: number; promoted: number; skipped: number }>>('/promotions', {
        source: {
          sessionId: src.sessionId,
          classId: src.classId,
          sectionId: src.sectionId || null,
        },
        destination: {
          sessionId: dst.sessionId,
          classId: dst.classId,
          sectionId: dst.sectionId || null,
        },
        studentIds: Array.from(selected),
      });
      setResult(res.data.data);
      toast.success(`Promoted ${res.data.data.promoted} student(s)`);
      setConfirmOpen(false);
      loadPreview();
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setConfirmOpen(false);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Student Promotion"
        description="Move students to a new class, section or session. Historical records are never modified."
        crumbs={[{ label: 'Classes & Roster' }, { label: 'Student Promotion' }]}
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source session</p>
            <Select value={src.sessionId || undefined} onValueChange={(v) => { setSrc({ sessionId: v, classId: '', sectionId: '' }); setPreview(null); setResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
              <SelectContent>{sessions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source class</p>
            <Select value={src.classId || undefined} onValueChange={(v) => { setSrc((p) => ({ ...p, classId: v, sectionId: '' })); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>{srcClasses.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source section</p>
            {srcIsSectionless ? (
              <Select disabled>
                <SelectTrigger><SelectValue placeholder="No sections" /></SelectTrigger>
                <SelectContent><SelectItem value="__none" disabled>No sections</SelectItem></SelectContent>
              </Select>
            ) : (
              <Select value={src.sectionId || undefined} onValueChange={(v) => setSrc((p) => ({ ...p, sectionId: v }))}>
                <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>{srcSections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-center md:px-2">
          <ArrowRight className="h-5 w-5 rotate-90 text-primary md:rotate-0" />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destination session</p>
            <Select value={dst.sessionId || undefined} onValueChange={(v) => { setDst({ sessionId: v, classId: '', sectionId: '' }); setPreview(null); setResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
              <SelectContent>{dstSessionOptions.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destination class</p>
            <Select value={dst.classId || undefined} onValueChange={(v) => { setDst((p) => ({ ...p, classId: v, sectionId: '' })); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>{dstClasses.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destination section</p>
            {dstIsSectionless ? (
              <Select disabled>
                <SelectTrigger><SelectValue placeholder="No sections" /></SelectTrigger>
                <SelectContent><SelectItem value="__none" disabled>No sections</SelectItem></SelectContent>
              </Select>
            ) : (
              <Select value={dst.sectionId || undefined} onValueChange={(v) => setDst((p) => ({ ...p, sectionId: v }))}>
                <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>{dstSections.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {result && (
        <Card className="mb-4 border-success/40">
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div>
              <p className="font-semibold">Promotion complete</p>
              <p className="text-sm text-muted-foreground">
                {result.promoted} of {result.total} student(s) promoted
                {result.skipped > 0 ? ` · ${result.skipped} already in destination (skipped)` : ''}.
                Historical records preserved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Eligible students</CardTitle>
            <CardDescription>
              {preview ? `${preview.total} student(s) in the source class/section.` : 'Select source and destination to preview.'}
            </CardDescription>
          </div>
          {preview && preview.total > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selected.size} selected</Badge>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
              <Button size="sm" disabled={selected.size === 0 || promoting} onClick={() => setConfirmOpen(true)}>
                {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Promote {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible students…
            </div>
          ) : !preview ? (
            <EmptyState title="Nothing to preview yet" description="Choose the source and destination above." />
          ) : preview.total === 0 ? (
            <EmptyState title="No students in source" description="The selected source class/section has no active students." />
          ) : (
            <div className="overflow-x-auto thin-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label="Select all" />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission #</TableHead>
                    <TableHead>Roll #</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.students.map((s) => (
                    <TableRow key={s._id} className={selected.has(s._id) ? 'bg-primary/5' : undefined}>
                      <TableCell>
                        <input type="checkbox" checked={selected.has(s._id)} onChange={() => toggleOne(s._id)} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label={`Select ${s.fullName}`} />
                      </TableCell>
                      <TableCell className="font-medium">{s.fullName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.admissionNumber}</TableCell>
                      <TableCell className="text-sm">{s.rollNumber || '—'}</TableCell>
                      <TableCell className="capitalize text-xs">{s.gender}</TableCell>
                      <TableCell>
                        {s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Promote ${selected.size} student(s)?`}
        description="Students move to the destination class/section/session. Old attendance, marks, results and fees stay attached to their original session records."
        confirmLabel="Promote students"
        loading={promoting}
        onConfirm={promote}
      />
    </div>
  );
}
