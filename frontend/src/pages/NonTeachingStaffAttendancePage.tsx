import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Download } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDate, todayISO } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface StaffLite { _id: string; fullName: string; employeeId: string; designation: string; isActive: boolean; isArchived: boolean }
interface Row {
  _id: string; staffId: string; staffName: string; employeeId: string; designation: string;
  attendanceDate: string; status: 'present' | 'absent' | 'late' | 'leave';
}

const STATUS_LABEL: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave' };
const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  present: 'success', absent: 'destructive', late: 'warning', leave: 'muted',
};

export function NonTeachingStaffAttendancePage() {
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leave: 0, late: 0 });

  const canCreate = can('nonTeachingAttendance', 'create');
  const canExport = can('nonTeachingAttendance', 'export');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get<ApiListResponse<Row> & { data: { summary?: any } }>(`/non-teaching-attendance?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      setSummary(res.data.summary || { present: 0, absent: 0, leave: 0, late: 0 });
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setLoading(false); }
  }, [pagination.page, pagination.limit, from, to]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/non-teaching-attendance/download?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `non-teaching-staff-attendance-${todayISO()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(apiErrorMessage(err, 'Export failed')); } finally { setExporting(false); }
  };

  const columns: Column<Row>[] = [
    {
      key: 'attendanceDate', header: 'Date',
      cell: (row) => <span className="whitespace-nowrap text-sm">{formatDate(row.attendanceDate)}</span>,
    },
    {
      key: 'staff', header: 'Staff Member',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.staffName}</p>
          <p className="text-[11px] text-muted-foreground font-mono">ID: {row.employeeId} · {row.designation}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      cell: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Non-Teaching Staff Attendance"
        description="Daily attendance records for non-teaching staff (Accountants, Receptionists, Support, etc.)."
        crumbs={[{ label: 'Attendance' }, { label: 'Non-Teaching Staff' }]}
        actions={canCreate ? (
          <Button onClick={() => setMarkOpen(true)} className="gap-1.5 rounded-xl font-semibold">
            <CalendarCheck className="h-4 w-4" /> Mark Daily Attendance
          </Button>
        ) : undefined}
      />

      <div className="filter-toolbar mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm shadow-sm">
            <span className="font-semibold text-emerald-800">Present</span>
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-900">{summary.present}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm shadow-sm">
            <span className="font-semibold text-rose-800">Absent</span>
            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-900">{summary.absent}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm shadow-sm">
            <span className="font-semibold text-slate-800">Leave</span>
            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-900">{summary.leave}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm shadow-sm">
            <span className="font-semibold text-amber-800">Late</span>
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">{summary.late}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {canExport && (
            <Button variant="outline" onClick={exportCsv} disabled={exporting} className="h-9">
              <Download className="h-4 w-4 mr-1.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      <DataTable columns={columns} data={data} loading={loading} pagination={pagination} rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        emptyTitle="No non-teaching staff attendance records"
        emptyDescription="Mark attendance to see records here." />

      {markOpen && (
        <MarkStaffDialog
          open={markOpen}
          onOpenChange={setMarkOpen}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}

function MarkStaffDialog({ open, onOpenChange, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [date, setDate] = useState(todayISO());
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffectOnce(() => {
    // Fetch ONLY active non-teaching staff directly from backend
    api.get<ApiListResponse<StaffLite>>('/staff?staffType=non_teaching&status=active&limit=500').then((r) => {
      const active = r.data.data;
      setStaff(active);
      setStatuses(Object.fromEntries(active.map((t) => [t._id, 'present'])));
    }).catch(() => {});
  });

  useEffect(() => { if (open) setDate(todayISO()); }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/non-teaching-attendance/bulk', {
        attendanceDate: date, overwrite,
        records: staff.map((t) => ({ staffId: t._id, status: statuses[t._id] ?? 'present' })),
      });
      toast.success(`Attendance marked for ${staff.length} staff member(s)`);
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error(apiErrorMessage(err, 'Could not mark attendance')); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark non-teaching staff attendance</DialogTitle>
          <DialogDescription>Set each staff member's status for the day, then save.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Staff Member</span><span>Status</span>
          </div>
          <div className="max-h-72 divide-y overflow-y-auto">
            {staff.length === 0 && !busy && (
              <div className="p-4 text-center text-sm text-muted-foreground">No active non-teaching staff found in directory.</div>
            )}
            {staff.map((t) => (
              <div key={t._id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
                <div className="leading-tight">
                  <p className="text-sm font-medium">{t.fullName}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">ID: {t.employeeId} · {t.designation}</p>
                </div>
                <Select value={statuses[t._id] ?? 'present'} onValueChange={(v) => setStatuses((prev) => ({ ...prev, [t._id]: v }))}>
                  <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="leave">Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="t-overwrite" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
          <Label htmlFor="t-overwrite" className="text-sm font-normal">
            Overwrite attendance already marked for this date
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || staff.length === 0}>{busy ? 'Saving…' : 'Save attendance'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
