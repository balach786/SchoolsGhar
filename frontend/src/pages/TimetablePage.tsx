import { useCallback, useEffect, useState, useMemo } from 'react';
import { Clock, Printer, Save, Plus, Trash2, CalendarDays, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { useEffectOnce } from '@/hooks/useEffectOnce';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface SessionLite { _id: string; name: string; isActive: boolean; isArchived: boolean }
interface ClassLite { _id: string; name: string; sessionId: string }
interface SectionLite { _id: string; name: string; classId: string }
interface SubjectLite { _id: string; name: string; code: string; classIds: string[]; }
interface TeacherLite { _id: string; fullName: string; employeeId: string; isActive: boolean; isArchived: boolean }

interface Period {
  _id: string; sessionId: string; classId: string; sectionId: string | null;
  dayOfWeek: number; periodNumber: number; startTime: string; endTime: string;
  subjectId: string | null; subjectName: string | null;
  teacherId: string | null; teacherName: string | null;
  isBreak: boolean;
}

interface CommonPeriod {
  periodNumber: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  hasInconsistentTimes?: boolean;
}

interface MatrixCell {
  _id?: string;
  subjectId: string | null;
  teacherId: string | null;
  isBreak: boolean;
  isDirty?: boolean;
  isDeleted?: boolean;
}

const DAY_NAMES: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const DAY_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

export function TimetablePage() {
  const { can } = useAuth();
  const canCreate = can('timetables', 'create');
  const canEdit = can('timetables', 'edit');
  const canPrint = can('timetables', 'print');

  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);

  const [classes, setClasses] = useState<ClassLite[]>([]);
  const [sections, setSections] = useState<SectionLite[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selected column keys: "classId|sectionId" or "classId|"
  const [selectedColKeys, setSelectedColKeys] = useState<string[]>([]);
  const [commonPeriods, setCommonPeriods] = useState<CommonPeriod[]>([]);
  
  // Matrix map: classKey -> periodNumber -> CellData
  const [matrix, setMatrix] = useState<Record<string, Record<number, MatrixCell>>>({});

  const isMatrixDirty = () => {
    for (const colKey of selectedColKeys) {
      if (matrix[colKey]) {
        for (const pNum of Object.keys(matrix[colKey])) {
          if (matrix[colKey][Number(pNum)]?.isDirty) return true;
        }
      }
    }
    return false;
  };

  const handleSessionChange = (newVal: string) => {
    if (isMatrixDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSessionId(newVal);
  };

  const handleDayChange = (newVal: string) => {
    if (isMatrixDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    setDayOfWeek(Number(newVal));
  };

  const handleSelectedColKeysChange = (newKeys: string[]) => {
    const removedKeys = selectedColKeys.filter(k => !newKeys.includes(k));
    let hasDirtyRemoved = false;
    for (const k of removedKeys) {
      if (matrix[k]) {
        for (const p of Object.values(matrix[k])) {
          if (p.isDirty) hasDirtyRemoved = true;
        }
      }
    }
    if (hasDirtyRemoved && !window.confirm("You have unsaved changes in the columns you are removing. Discard them?")) return;
    setSelectedColKeys(newKeys);
  };

  // Flatten classes/sections for multi-select
  const colEntities = useMemo(() => {
    const list: { key: string; classId: string; sectionId: string | null; label: string }[] = [];
    classes.forEach(c => {
      const cSections = sections.filter(s => s.classId === c._id);
      if (cSections.length === 0) {
        list.push({ key: `${c._id}|`, classId: c._id, sectionId: null, label: c.name });
      } else {
        cSections.forEach(s => {
          list.push({ key: `${c._id}|${s._id}`, classId: c._id, sectionId: s._id, label: `${c.name} - ${s.name}` });
        });
      }
    });
    return list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [classes, sections]);

  useEffectOnce(() => {
    api.get<ApiListResponse<SessionLite>>('/academic-sessions/lookup').then((r) => {
      const list = r.data.data;
      setSessions(list);
      const active = list.find((s) => s.isActive) ?? list[0];
      if (active) setSessionId(active._id);
    }).catch(() => {});
    api.get<ApiListResponse<TeacherLite>>('/teachers?limit=100').then((r) => {
      setTeachers(r.data.data.filter((t) => t.isActive && !t.isArchived));
    }).catch(() => {});
  });

  useEffect(() => {
    if (!sessionId) { setClasses([]); setSections([]); setSubjects([]); return; }
    Promise.all([
      api.get<ApiListResponse<ClassLite>>(`/classes/lookup?sessionId=${sessionId}`),
      api.get<ApiListResponse<SectionLite>>(`/sections/lookup`),
      api.get<ApiListResponse<SubjectLite>>(`/subjects?sessionId=${sessionId}&limit=500`)
    ]).then(([cRes, sRes, subRes]) => {
      setClasses(cRes.data.data);
      // Backend guarantees sections are scoped per class.
      setSections(sRes.data.data);
      setSubjects(subRes.data.data);
    }).catch(() => {});
  }, [sessionId]);

  const loadDay = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await api.get<ApiDataResponse<Period[]>>(`/timetables?sessionId=${sessionId}&dayOfWeek=${dayOfWeek}`);
      const data = res.data.data ?? [];
      
      const newMatrix: Record<string, Record<number, MatrixCell>> = {};
      const cpMap = new Map<number, CommonPeriod>();
      
      data.forEach(p => {
        const colKey = `${p.classId}|${p.sectionId || ''}`;
        if (!newMatrix[colKey]) newMatrix[colKey] = {};
        newMatrix[colKey][p.periodNumber] = {
          _id: p._id,
          subjectId: p.subjectId,
          teacherId: p.teacherId,
          isBreak: p.isBreak,
          isDirty: false
        };
        if (!cpMap.has(p.periodNumber)) {
          cpMap.set(p.periodNumber, {
            periodNumber: p.periodNumber,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak,
            hasInconsistentTimes: false
          });
        } else {
          const cp = cpMap.get(p.periodNumber)!;
          if (cp.startTime !== p.startTime || cp.endTime !== p.endTime) {
            cp.hasInconsistentTimes = true;
          }
        }
      });
      
      setMatrix(newMatrix);
      setCommonPeriods(Array.from(cpMap.values()).sort((a,b) => a.periodNumber - b.periodNumber));
      
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [sessionId, dayOfWeek]);

  useEffect(() => { loadDay(); }, [loadDay]);

  const updateCell = (colKey: string, pNum: number, data: Partial<MatrixCell>) => {
    setMatrix(prev => {
      const col = prev[colKey] || {};
      const existing = col[pNum] || { subjectId: null, teacherId: null, isBreak: false };
      return { ...prev, [colKey]: { ...col, [pNum]: { ...existing, ...data, isDirty: true, isDeleted: false } } };
    });
  };

  const clearCell = (colKey: string, pNum: number) => {
    setMatrix(prev => {
      const col = prev[colKey] || {};
      const existing = col[pNum];
      if (!existing) return prev;
      return { ...prev, [colKey]: { ...col, [pNum]: { ...existing, subjectId: null, teacherId: null, isBreak: false, isDirty: true, isDeleted: true } } };
    });
  };

  const markRowBreak = (pNum: number, isBreak: boolean) => {
    setCommonPeriods(prev => prev.map(p => p.periodNumber === pNum ? { ...p, isBreak } : p));
    setMatrix(prev => {
      const next = { ...prev };
      selectedColKeys.forEach(colKey => {
        if (!next[colKey]) next[colKey] = {};
        const existing = next[colKey][pNum] || { subjectId: null, teacherId: null, isBreak: false };
        if (isBreak) {
          next[colKey] = { ...next[colKey], [pNum]: { ...existing, subjectId: null, teacherId: null, isBreak: true, isDirty: true, isDeleted: false } };
        } else {
          if (existing.isBreak) {
            next[colKey] = { ...next[colKey], [pNum]: { ...existing, isBreak: false, isDirty: true } };
          }
        }
      });
      return next;
    });
  };

  const updateCommonPeriod = (pNum: number, data: Partial<CommonPeriod>) => {
    setCommonPeriods(prev => prev.map(p => p.periodNumber === pNum ? { ...p, ...data, hasInconsistentTimes: false } : p));
    // Updating time marks applicable cells in this row as dirty
    setMatrix(prev => {
      const next = { ...prev };
      selectedColKeys.forEach(colKey => {
        if (next[colKey]?.[pNum] && !next[colKey][pNum].isDeleted) {
          const cell = next[colKey][pNum];
          if (cell._id || cell.subjectId || cell.isBreak) {
            next[colKey] = { ...next[colKey], [pNum]: { ...cell, isDirty: true } };
          }
        }
      });
      return next;
    });
  };

  const removeCommonPeriod = (pNum: number) => {
    setCommonPeriods(prev => prev.filter(p => p.periodNumber !== pNum));
    setMatrix(prev => {
      const next = { ...prev };
      selectedColKeys.forEach(colKey => {
        if (next[colKey]?.[pNum]) {
          next[colKey] = { ...next[colKey], [pNum]: { ...next[colKey][pNum], isDirty: true, isDeleted: true } };
        }
      });
      return next;
    });
  };

  const addCommonPeriod = () => {
    const nextNum = commonPeriods.length > 0 ? Math.max(...commonPeriods.map(p => p.periodNumber)) + 1 : 1;
    setCommonPeriods([...commonPeriods, { periodNumber: nextNum, startTime: '08:00', endTime: '08:45', isBreak: false }]);
  };

  const saveMatrix = async () => {
    setSaving(true);
    const results: { column: string; success: boolean; error?: string }[] = [];

    try {
      const colPromises = selectedColKeys.map(async colKey => {
        const entity = colEntities.find(e => e.key === colKey);
        if (!entity) return;
        const dirtyCells = Object.entries(matrix[colKey] || {}).filter(([_, cell]) => cell.isDirty);
        if (dirtyCells.length === 0) {
          results.push({ column: entity.label, success: true });
          return;
        }

        const toDelete = dirtyCells.filter(([_, cell]) => cell.isDeleted && cell._id).map(([_, cell]) => cell._id!);
        const toUpdate = dirtyCells.filter(([_, cell]) => !cell.isDeleted && cell._id);
        const toCreate = dirtyCells.filter(([_, cell]) => !cell.isDeleted && !cell._id);

        try {
          if (toDelete.length > 0) {
            await api.delete('/timetables/periods', { data: { periodIds: toDelete } });
          }

          for (const [pNumStr, cell] of toUpdate) {
            const pNum = Number(pNumStr);
            const cp = commonPeriods.find(p => p.periodNumber === pNum);
            if (!cp) continue;
            await api.patch(`/timetables/periods/${cell._id}`, {
              dayOfWeek, periodNumber: pNum, startTime: cp.startTime, endTime: cp.endTime,
              subjectId: cell.isBreak ? null : cell.subjectId || null,
              teacherId: cell.isBreak ? null : cell.teacherId || null,
              isBreak: cell.isBreak
            });
          }

          const periodsToCreate = toCreate.map(([pNumStr, cell]) => {
            const pNum = Number(pNumStr);
            const cp = commonPeriods.find(p => p.periodNumber === pNum)!;
            if (cp && (cell.subjectId || cell.isBreak)) {
              return {
                dayOfWeek, periodNumber: pNum, startTime: cp.startTime, endTime: cp.endTime,
                subjectId: cell.isBreak ? null : cell.subjectId || null,
                teacherId: cell.isBreak ? null : cell.teacherId || null,
                isBreak: cell.isBreak
              };
            }
            return null;
          }).filter(Boolean);

          if (periodsToCreate.length > 0) {
            await api.post('/timetables', {
              sessionId, classId: entity.classId, sectionId: entity.sectionId || undefined, periods: periodsToCreate
            });
          }
          results.push({ column: entity.label, success: true });
        } catch(err: any) {
          results.push({ column: entity.label, success: false, error: err.response?.data?.error || err.message || 'Unknown error' });
        }
      });

      await Promise.allSettled(colPromises);
      
      const successes = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success);
      
      if (failures.length === 0) {
        toast.success(`Matrix saved successfully`);
      } else {
        toast.error(
          <div className="flex flex-col gap-1">
            <span className="font-bold">Partial Save Result</span>
            <span>Saved: {successes} column(s)</span>
            <span>Failed: {failures.length} column(s)</span>
            <ul className="list-disc pl-4 text-xs mt-1 font-medium">
              {failures.map((f, i) => <li key={i}>{f.column}: {f.error}</li>)}
            </ul>
          </div>,
          { duration: 8000 }
        );
      }
      
      loadDay();
    } finally { setSaving(false); }
  };

  const printMatrix = () => {
    if (!sessionId) return;
    const sName = sessions.find(s => s._id === sessionId)?.name || '';
    const dayName = DAY_NAMES[dayOfWeek];
    const columns = selectedColKeys.map(key => colEntities.find(e => e.key === key)).filter(Boolean) as typeof colEntities;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Timetable - ${dayName}</title>
      <style>
        @page { size: A4 landscape; margin: 1cm; }
        body{font-family:system-ui,sans-serif;color:#111;padding:24px;font-size:12px;margin:0}
        h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:0 0 16px;font-weight:500;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #000;padding:6px;text-align:center;vertical-align:middle}
        th{background:#f4f4f5}
        .time{font-size:11px;color:#444}
        .break{background:#fafafa;font-style:italic;color:#666}
        @media print{ body{padding:0} }
      </style></head><body>
      <h1>${sName}</h1>
      <h2>Day: ${dayName}</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 100px;">Time</th>
            ${columns.map(c => `<th>${c.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${commonPeriods.map(cp => {
            if (cp.isBreak) {
              return `<tr>
                <td><div class="time">${cp.startTime} – ${cp.endTime}</div></td>
                <td colspan="${columns.length}" class="break">BREAK</td>
              </tr>`;
            }
            return `<tr>
              <td><div class="time">${cp.startTime} – ${cp.endTime}</div></td>
              ${columns.map(c => {
                const cell = matrix[c.key]?.[cp.periodNumber];
                if (!cell || cell.isDeleted) return `<td>—</td>`;
                if (cell.isBreak) return `<td class="break">Break</td>`;
                const sub = subjects.find(s => s._id === cell.subjectId);
                const teacher = teachers.find(t => t._id === cell.teacherId);
                return `<td>
                  <div style="font-weight:bold">${sub?.name || '—'}</div>
                  <div style="font-size:11px;color:#555">${teacher?.fullName || '—'}</div>
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onload = () => { w.print(); };
  };

  const printWeekly = (colKey: string) => {
    if (!sessionId) return;
    const entity = colEntities.find(e => e.key === colKey);
    if (!entity) return;
    
    // For weekly print we use the existing printable endpoint which aggregates all days
    // Alternatively, we can just trigger window.open to the existing endpoint if we format it right.
    const url = entity.sectionId 
      ? `/timetables/print?sessionId=${sessionId}&classId=${entity.classId}&sectionId=${entity.sectionId}`
      : `/timetables/print?sessionId=${sessionId}&classId=${entity.classId}`;

    api.get<ApiDataResponse<any>>(url).then(res => {
      const p = res.data.data;
      const subHeader = p.sectionName ? `${p.className} · Section ${p.sectionName}` : p.className;
      const rows = (p.days ?? []).map((d: any) => `
        <h3>${d.dayName}</h3>
        <table><thead><tr><th>#</th><th>Time</th><th>Subject</th><th>Teacher</th></tr></thead><tbody>
        ${d.periods.map((per: any) => `<tr><td>${per.periodNumber}</td><td>${per.startTime} – ${per.endTime}</td><td>${per.isBreak ? '<em>Break</em>' : per.subjectName ?? '—'}</td><td>${per.teacherName ?? '—'}</td></tr>`).join('')}
        </tbody></table>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Timetable - ${p.className}</title>
        <style>
          body{font-family:system-ui,sans-serif;color:#111;padding:24px;max-width:800px;margin:0 auto}
          h1{font-size:20px;margin:0 0 2px} h2{font-size:15px;margin:0 0 16px;font-weight:500;color:#555}
          h3{font-size:14px;margin:18px 0 6px}
          table{width:100%;border-collapse:collapse;font-size:13px}
          th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
          th{background:#f4f4f5}
          @media print{ body{padding:0} }
        </style></head><body>
        <h1>${p.sessionName} — Timetable</h1>
        <h2>${subHeader}</h2>
        ${rows}
        </body></html>`;
      const w = window.open('', '_blank');
      if (!w) { toast.error('Pop-up blocked'); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      w.onload = () => { w.print(); };
    }).catch(err => toast.error('Failed to load weekly print view: ' + apiErrorMessage(err)));
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Timetable" description="Day-wise multi-class matrix timetable configuration."
        crumbs={[{ label: 'Classes & Roster' }, { label: 'Timetable' }]}
        actions={
          <div className="flex items-center gap-2">
            {canPrint && <Button variant="outline" onClick={printMatrix} disabled={selectedColKeys.length === 0}><Printer className="h-4 w-4" /> Print Matrix</Button>}
            {canEdit && <Button onClick={saveMatrix} disabled={saving || selectedColKeys.length === 0}><Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Timetable'}</Button>}
          </div>
        } />

      <div className="flex flex-wrap items-center gap-4 rounded-md border p-4 bg-muted/20">
        <div className="w-48">
          <Label className="mb-1.5 block">Academic Session</Label>
          <Select value={sessionId} onValueChange={handleSessionChange}>
            <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
            <SelectContent>
              {sessions.map(s => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label className="mb-1.5 block">Day</Label>
          <Select value={String(dayOfWeek)} onValueChange={handleDayChange}>
            <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map(d => <SelectItem key={d} value={String(d)}>{DAY_NAMES[d]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[250px]">
          <Label className="mb-1.5 block">Selected Classes</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal truncate">
                {selectedColKeys.length === 0 ? "Select classes..." : `${selectedColKeys.length} class(es) selected`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <div className="p-2 border-b flex justify-between items-center bg-muted/30">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSelectedColKeysChange(colEntities.map(e => e.key))}>Select All</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSelectedColKeysChange([])}>Clear</Button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2 flex flex-col gap-2">
                {colEntities.map(e => (
                  <label key={e.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <Checkbox 
                      checked={selectedColKeys.includes(e.key)} 
                      onCheckedChange={(c) => {
                        if (c) handleSelectedColKeysChange([...selectedColKeys, e.key]);
                        else handleSelectedColKeysChange(selectedColKeys.filter(k => k !== e.key));
                      }} 
                    />
                    <span className="text-sm">{e.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-md">Loading matrix...</div>
      ) : selectedColKeys.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border border-dashed rounded-md">Please select at least one class to configure.</div>
      ) : (
        <div className="overflow-x-auto border rounded-md shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 font-semibold w-[220px] min-w-[220px] border-r">Time / Period</th>
                {selectedColKeys.map(colKey => {
                  const label = colEntities.find(e => e.key === colKey)?.label || '';
                  return (
                    <th key={colKey} className="p-3 font-semibold min-w-[200px] border-r text-center">
                      <div className="flex flex-col gap-1 items-center">
                        <span>{label}</span>
                        {canPrint && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => printWeekly(colKey)}>
                            <CalendarDays className="h-3 w-3 mr-1"/> Weekly Print
                          </Button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {commonPeriods.map((cp, idx) => (
                <tr key={cp.periodNumber} className={cp.isBreak ? "bg-muted/20" : ""}>
                  <td className="p-3 border-r align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">P {cp.periodNumber}</Badge>
                        <div className="flex items-center gap-1">
                          <Checkbox id={`break-${cp.periodNumber}`} checked={cp.isBreak} onCheckedChange={(c) => markRowBreak(cp.periodNumber, c === true)} />
                          <Label htmlFor={`break-${cp.periodNumber}`} className="text-xs cursor-pointer">Break</Label>
                        </div>
                      </div>
                      {cp.hasInconsistentTimes && (
                        <div className="text-[10px] text-red-600 flex items-center bg-red-50 p-1 rounded font-medium">
                          <AlertTriangle className="h-3 w-3 mr-1 inline" />
                          Period {cp.periodNumber} has inconsistent times across classes.
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Input type="time" className="h-7 text-xs px-1 w-full" value={cp.startTime} onChange={(e) => updateCommonPeriod(cp.periodNumber, { startTime: e.target.value })} />
                        <span className="text-muted-foreground">-</span>
                        <Input type="time" className="h-7 text-xs px-1 w-full" value={cp.endTime} onChange={(e) => updateCommonPeriod(cp.periodNumber, { endTime: e.target.value })} />
                      </div>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500" onClick={() => removeCommonPeriod(cp.periodNumber)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </td>
                  {cp.isBreak ? (
                    <td colSpan={selectedColKeys.length} className="p-3 text-center text-muted-foreground tracking-widest font-medium">
                      --------------- B R E A K ---------------
                    </td>
                  ) : (
                    selectedColKeys.map(colKey => {
                      const cell = matrix[colKey]?.[cp.periodNumber];
                      const isEmpty = !cell || cell.isDeleted;
                      const entity = colEntities.find(e => e.key === colKey);
                      
                      const validSubjects = entity ? subjects.filter(s => s.classIds.includes(entity.classId)) : [];
                      const validTeachers = teachers;

                      return (
                        <td key={colKey} className="p-2 border-r align-top relative group">
                          <div className="flex flex-col gap-2 h-full">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Subject</Label>
                              <Select value={isEmpty ? '' : (cell.subjectId || '')} onValueChange={(v) => updateCell(colKey, cp.periodNumber, { subjectId: v, teacherId: null })}>
                                <SelectTrigger className="h-7 text-xs border-dashed focus:ring-1"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {validSubjects.map(s => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Teacher</Label>
                              <Select disabled={!cell?.subjectId} value={isEmpty ? '' : (cell.teacherId || '')} onValueChange={(v) => updateCell(colKey, cp.periodNumber, { teacherId: v })}>
                                <SelectTrigger className="h-7 text-xs border-dashed focus:ring-1"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {validTeachers.map(t => <SelectItem key={t._id} value={t._id}>{t.fullName}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {!isEmpty && (
                              <Button variant="ghost" className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 bg-background shadow-sm border rounded-full transition-opacity" onClick={() => clearCell(colKey, cp.periodNumber)}>
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <div className="p-3 border-t bg-muted/10">
              <Button variant="outline" size="sm" onClick={addCommonPeriod} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1"/> Add Period Slot</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
