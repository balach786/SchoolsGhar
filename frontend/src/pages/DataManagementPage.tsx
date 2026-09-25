import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Database,
  Users,
  GraduationCap,
  Wallet,
  ClipboardCheck,
  Award,
  Layers,
  History,
  
  Download,
  FileSpreadsheet,
  CalendarClock,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExportFilterCard } from '@/components/dataTransfer/ExportFilterCard';

import { DataHistoryViewer } from '@/components/dataTransfer/DataHistoryViewer';
import { api, apiErrorMessage } from '@/lib/api';
import { toast } from '@/components/ui/sonner';

export function DataManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'students';

  // Common reference options for filters
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [sections, setSections] = useState<{ value: string; label: string }[]>([]);
  const [sessions, setSessions] = useState<{ value: string; label: string }[]>([]);
  const [exams, setExams] = useState<{ value: string; label: string; classId?: string }[]>([]);
  const [subjects, setSubjects] = useState<{ value: string; label: string; classId?: string }[]>([]);

  // Marks sheet selection state
  const [marksExamId, setMarksExamId] = useState('');
  const [marksSubjectId, setMarksSubjectId] = useState('');
  const [marksSectionId, setMarksSectionId] = useState('');
  const [marksFormat, setMarksFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [downloadingMarks, setDownloadingMarks] = useState(false);

  useEffect(() => {
    // Fetch common options on mount
    (async () => {
      try {
        const [clsRes, secRes, sesRes, exRes, subRes] = await Promise.all([
          api.get('/classes/lookup').catch(() => ({ data: { data: [] } })),
          api.get('/sections/lookup').catch(() => ({ data: { data: [] } })),
          api.get('/academic-sessions/lookup').catch(() => ({ data: { data: [] } })),
          api.get('/exams?limit=100').catch(() => ({ data: { data: [] } })),
          api.get('/subjects?limit=100').catch(() => ({ data: { data: [] } })),
        ]);

        const cls = (clsRes.data.data || []).map((c: any) => ({ value: c._id, label: c.name }));
        const sec = (secRes.data.data || []).map((s: any) => ({ value: s._id, label: s.name }));
        const ses = (sesRes.data.data || []).map((s: any) => ({ value: s._id, label: s.name }));
        const ex = (exRes.data.data || []).map((e: any) => ({ value: e._id, label: e.name, classId: e.classId }));
        const sub = (subRes.data.data || []).map((s: any) => ({ value: s._id, label: s.name, classId: s.classId }));

        setClasses(cls);
        setSections(sec);
        setSessions(ses);
        setExams(ex);
        setSubjects(sub);

        if (ex.length > 0) setMarksExamId(ex[0].value);
        if (sub.length > 0) setMarksSubjectId(sub[0].value);
      } catch (err) {
        console.error('Failed to load filter metadata', err);
      }
    })();
  }, []);



  const handleDownloadMarksSheet = async () => {
    if (!marksExamId || !marksSubjectId) {
      toast.error('Please select both an Exam and a Subject');
      return;
    }
    setDownloadingMarks(true);
    try {
      const params = new URLSearchParams({
        examId: marksExamId,
        subjectId: marksSubjectId,
        format: marksFormat,
      });
      if (marksSectionId && marksSectionId !== 'all') params.append('sectionId', marksSectionId);

      const res = await api.get(`/data-transfer/export/marks?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Marks_Sheet_${marksFormat.toUpperCase()}.${marksFormat}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Pre-filled marks sheet downloaded');
    } catch (err: any) {
      toast.error(apiErrorMessage(err) || 'Failed to download marks sheet');
    } finally {
      setDownloadingMarks(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Data Exports Center"
        crumbs={[{ label: 'Data Management' }]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/80 text-xs font-medium shadow-sm hover:bg-muted/50"
              onClick={() => setSearchParams({ tab: 'history' })}
            >
              <History className="mr-1.5 h-3.5 w-3.5 text-primary" /> View History
            </Button>
          </div>
        }
      />

      {/* Main Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setSearchParams({ tab: val })}
        className="space-y-6"
      >
        <TabsList className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-1.5 rounded-2xl border border-border/70 flex flex-wrap h-auto gap-1 shadow-sm">
          <TabsTrigger value="students" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Users className="mr-1.5 h-3.5 w-3.5" /> Students
          </TabsTrigger>
          <TabsTrigger value="staff" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Staff & Teachers
          </TabsTrigger>
          <TabsTrigger value="fees" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Wallet className="mr-1.5 h-3.5 w-3.5" /> Fees & Finance
          </TabsTrigger>
          <TabsTrigger value="attendance" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Attendance
          </TabsTrigger>
          <TabsTrigger value="exams" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Award className="mr-1.5 h-3.5 w-3.5" /> Exams & Marks
          </TabsTrigger>
          <TabsTrigger value="academic" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Academic Setup
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <History className="mr-1.5 h-3.5 w-3.5" /> Transfer History
          </TabsTrigger>
        </TabsList>

        {/* 1. STUDENTS TAB */}
        <TabsContent value="students" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 border-border/70 shadow-sm rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
              <ExportFilterCard
                title="Export Students"
                description="Download verified student lists filtered by session, class, section, status, and admission dates."
                module="students"
                fields={[
                  { id: 'sessionId', label: 'Session', type: 'select', options: sessions },
                  { id: 'classId', label: 'Class', type: 'select', options: classes },
                  { id: 'sectionId', label: 'Section', type: 'select', options: sections },
                  {
                    id: 'status',
                    label: 'Status',
                    type: 'select',
                    options: [
                      { value: 'active', label: 'Active Students' },
                      { value: 'archived', label: 'Archived Students' },
                      { value: 'all', label: 'All Students' },
                    ],
                    defaultValue: 'active',
                  },
                  {
                    id: 'gender',
                    label: 'Gender',
                    type: 'select',
                    options: [
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                    ],
                  },
                  { id: 'admissionDateFrom', label: 'Admission From', type: 'date' },
                ]}
              />
            </Card>

          </div>
        </TabsContent>

        {/* 2. STAFF TAB */}
        <TabsContent value="staff" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 border-border/60 shadow-xs rounded-2xl">
              <ExportFilterCard
                title="Export Staff & Faculty"
                description="Generate staff rosters including teachers, accountants, and administrative staff."
                module="staff"
                fields={[
                  {
                    id: 'role',
                    label: 'Staff Role',
                    type: 'select',
                    options: [
                      { value: 'teacher', label: 'Teachers' },
                      { value: 'accountant', label: 'Accountants' },
                      { value: 'receptionist', label: 'Receptionists' },
                    ],
                  },
                  {
                    id: 'status',
                    label: 'Status',
                    type: 'select',
                    options: [
                      { value: 'active', label: 'Active Staff' },
                      { value: 'archived', label: 'Archived Staff' },
                    ],
                    defaultValue: 'active',
                  },
                ]}
              />
            </Card>

          </div>
        </TabsContent>

        {/* 3. FEES TAB */}
        <TabsContent value="fees" className="space-y-6">
          <div className="space-y-4">
            <ExportFilterCard
              title="Export Monthly Tuition Fees"
              description="Export isolated student tuition ledgers by billing month, class, section, and payment status."
              module="fees"
              fields={[
                { id: 'sessionId', label: 'Session', type: 'select', options: sessions },
                { id: 'classId', label: 'Class', type: 'select', options: classes },
                { id: 'sectionId', label: 'Section', type: 'select', options: sections },
                {
                  id: 'month',
                  label: 'Billing Month',
                  type: 'select',
                  options: [
                    { value: '1', label: 'January' },
                    { value: '2', label: 'February' },
                    { value: '3', label: 'March' },
                    { value: '4', label: 'April' },
                    { value: '5', label: 'May' },
                    { value: '6', label: 'June' },
                    { value: '7', label: 'July' },
                    { value: '8', label: 'August' },
                    { value: '9', label: 'September' },
                    { value: '10', label: 'October' },
                    { value: '11', label: 'November' },
                    { value: '12', label: 'December' },
                  ],
                },
                {
                  id: 'status',
                  label: 'Payment Status',
                  type: 'select',
                  options: [
                    { value: 'paid', label: 'Paid' },
                    { value: 'partial', label: 'Partial' },
                    { value: 'unpaid', label: 'Unpaid' },
                  ],
                },
              ]}
            />

            <ExportFilterCard
              title="Export Exam Fees"
              description="Export isolated exam fee receipts and dues. Never contaminates tuition fee sheets."
              module="examFees"
              fields={[
                { id: 'examId', label: 'Exam', type: 'select', options: exams },
                { id: 'classId', label: 'Class', type: 'select', options: classes },
                {
                  id: 'status',
                  label: 'Status',
                  type: 'select',
                  options: [
                    { value: 'paid', label: 'Paid' },
                    { value: 'partial', label: 'Partial' },
                    { value: 'unpaid', label: 'Unpaid' },
                  ],
                },
              ]}
            />
          </div>
        </TabsContent>

        {/* 4. ATTENDANCE TAB */}
        <TabsContent value="attendance" className="space-y-6">
          <ExportFilterCard
            title="Export Student Attendance"
            description="Download daily or periodic student attendance registers with present, absent, and late tags."
            module="attendance"
            fields={[
              { id: 'classId', label: 'Class', type: 'select', options: classes },
              { id: 'sectionId', label: 'Section', type: 'select', options: sections },
              { id: 'startDate', label: 'From Date', type: 'date' },
              { id: 'endDate', label: 'To Date', type: 'date' },
              {
                id: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { value: 'present', label: 'Present' },
                  { value: 'absent', label: 'Absent' },
                  { value: 'late', label: 'Late' },
                  { value: 'leave', label: 'On Leave' },
                ],
              },
            ]}
          />
        </TabsContent>

        {/* 5. EXAMS & MARKS TAB (Sections 26 & 72 Pre-filled Marks Workflow) */}
        <TabsContent value="exams" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pre-filled Marks Sheet Generator */}
            <Card className="border-border/70 shadow-sm rounded-2xl overflow-hidden bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
              <CardHeader className="bg-primary/5 pb-4 border-b border-border/60">
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Download Marks Entry Sheet
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Generates an Excel sheet pre-populated with student roll numbers and names. Teachers only enter Obtained Marks or Absent.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Exam</Label>
                    <Select value={marksExamId} onValueChange={setMarksExamId}>
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
                        <SelectValue placeholder="Select Exam" />
                      </SelectTrigger>
                      <SelectContent>
                        {exams.map((e) => (
                          <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Subject</Label>
                    <Select value={marksSubjectId} onValueChange={setMarksSubjectId}>
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
                        <SelectValue placeholder="Select Subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Section (Optional)</Label>
                    <Select value={marksSectionId || 'all'} onValueChange={setMarksSectionId}>
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
                        <SelectValue placeholder="All Sections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sections</SelectItem>
                        {sections.map((sec) => (
                          <SelectItem key={sec.value} value={sec.value}>{sec.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Format</Label>
                    <Select value={marksFormat} onValueChange={(v: any) => setMarksFormat(v)}>
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                        <SelectItem value="csv">CSV (.csv)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t">

                  <Button
                    type="button"
                    size="sm"
                    className="bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl shadow-sm text-xs font-semibold"
                    onClick={handleDownloadMarksSheet}
                    disabled={downloadingMarks || !marksExamId || !marksSubjectId}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download Pre-filled Sheet
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results Export Card */}
            <ExportFilterCard
              title="Export Exam Results & Rankings"
              description="Download final calculated class result sheets with student positions, percentages, and pass/fail statuses."
              module="results"
              fields={[
                { id: 'examId', label: 'Exam', type: 'select', options: exams },
                { id: 'classId', label: 'Class', type: 'select', options: classes },
                { id: 'sectionId', label: 'Section', type: 'select', options: sections },
              ]}
              showTemplateButton={false}
            />
          </div>
        </TabsContent>

        {/* 6. ACADEMIC SETUP TAB */}
        <TabsContent value="academic" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 border-border/70 shadow-sm rounded-2xl bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
              <ExportFilterCard
                title="Export Academic Structure"
                description="Export all Classes, Sections, and Subjects configured for your school in multiple tabs."
                module="academic"
                fields={[]}
              />
            </Card>

          </div>
        </TabsContent>

        {/* 7. HISTORY TAB */}
        <TabsContent value="history" className="space-y-6">
          <DataHistoryViewer />
        </TabsContent>
      </Tabs>

    </div>
  );
}
