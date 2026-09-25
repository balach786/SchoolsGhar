import { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  Plus,
  Receipt,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  FileCheck,
  RotateCcw,
  Sparkles,
  Filter,
  Download,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
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
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, ApiDataResponse, ApiListResponse } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/format';
import { useEffectOnce } from '@/hooks/useEffectOnce';

interface ExamRow {
  _id: string;
  name: string;
  sessionId: string;
  classId: string;
}

interface ClassRow {
  _id: string;
  name: string;
}

interface SectionRow {
  _id: string;
  name: string;
  classId: string;
}

interface ExamFeeConfigRow {
  _id: string;
  examId: string;
  sessionId: string;
  classId: string;
  className?: string;
  amount: number; // paisa
  dueDate: string | null;
  defaultFine: number;
  discountAllowed: boolean;
  scholarshipAllowed: boolean;
  isActive: boolean;
}

interface StudentExamFeeRow {
  _id: string;
  examId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  rollNumber?: string;
  className?: string;
  sectionName?: string;
  originalAmount: number;
  discountAmount: number;
  scholarshipAmount: number;
  fineAmount: number;
  netPayable: number;
  amountPaid: number;
  remainingBalance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'waived';
  dueDate: string | null;
}

interface PrintableReceiptData {
  school: {
    schoolName: string;
    schoolLogoUrl: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  payment: {
    receiptNumber: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    reference: string | null;
    notes: string | null;
  };
  fee: {
    originalAmount: number;
    discountAmount: number;
    scholarshipAmount: number;
    fineAmount: number;
    netPayable: number;
    amountPaid: number;
    remainingBalance: number;
  };
  student: {
    fullName: string;
    admissionNumber: string;
    rollNumber: string;
    className: string;
    sectionName: string;
    sessionName: string;
  };
  exam: {
    name: string;
  };
}

export function ExamFeesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramExamId = searchParams.get('examId') || '';
  const paramClassId = searchParams.get('classId') || '';

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<string>(paramExamId);
  const [selectedClassId, setSelectedClassId] = useState<string>(paramClassId);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'collection' | 'setup'>('collection');

  // Class Fee Config State
  const [feeConfigs, setFeeConfigs] = useState<ExamFeeConfigRow[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configClassId, setConfigClassId] = useState('');
  const [configAmountPKR, setConfigAmountPKR] = useState('1500');
  const [configDueDate, setConfigDueDate] = useState('');
  const [configFinePKR, setConfigFinePKR] = useState('0');
  const [configDiscountAllowed, setConfigDiscountAllowed] = useState(true);
  const [configScholarshipAllowed, setConfigScholarshipAllowed] = useState(true);
  const [configBusy, setConfigBusy] = useState(false);

  // Student Fee Records State
  const [studentFees, setStudentFees] = useState<StudentExamFeeRow[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);

  // Generation State
  const [genBusy, setGenBusy] = useState(false);

  // Payment Collection Modal State
  const [collectTarget, setCollectTarget] = useState<StudentExamFeeRow | null>(null);
  const [paymentAmountPKR, setPaymentAmountPKR] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'online' | 'other'>('cash');
  const [paymentDiscountPKR, setPaymentDiscountPKR] = useState('0');
  const [paymentFinePKR, setPaymentFinePKR] = useState('0');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);

  // Printable Receipt Modal State
  const [receiptData, setReceiptData] = useState<PrintableReceiptData | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptStyle, setReceiptStyle] = useState<'a4' | 'compact'>('compact');

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

  useEffect(() => {
    if (!selectedClassId || selectedClassId === 'all') return;
    api
      .get<ApiListResponse<SectionRow>>(`/sections/lookup?classId=${selectedClassId}`)
      .then((res) => setSections(res.data.data))
      .catch(() => {});
  }, [selectedClassId]);

  // Load class fee configs
  const loadConfigs = useCallback(async () => {
    if (!selectedExamId) return;
    try {
      const res = await api.get<ApiDataResponse<ExamFeeConfigRow[]>>(`/exam-fees?examId=${selectedExamId}`);
      setFeeConfigs(res.data.data);
    } catch {}
  }, [selectedExamId]);

  // Load student exam fees
  const loadStudentFees = useCallback(async () => {
    if (!selectedExamId) return;
    setLoadingFees(true);
    try {
      const params = new URLSearchParams({ examId: selectedExamId, limit: '10000' });
      if (selectedClassId && selectedClassId !== 'all') params.set('classId', selectedClassId);
      if (selectedSectionId && selectedSectionId !== 'all') params.set('sectionId', selectedSectionId);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await api.get<ApiListResponse<StudentExamFeeRow>>(`/exam-fees/students?${params}`);
      setStudentFees(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoadingFees(false);
    }
  }, [selectedExamId, selectedClassId, selectedSectionId, statusFilter]);

  useEffect(() => {
    loadConfigs();
    loadStudentFees();
  }, [loadConfigs, loadStudentFees]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentExam = exams.find((e) => e._id === selectedExamId);
    if (!currentExam) return;

    setConfigBusy(true);
    try {
      await api.post('/exam-fees', {
        examId: selectedExamId,
        sessionId: currentExam.sessionId,
        classId: configClassId,
        amount: Math.round(Number(configAmountPKR) * 100), // convert to paisa
        dueDate: configDueDate ? new Date(configDueDate).toISOString() : undefined,
        defaultFine: Math.round(Number(configFinePKR || '0') * 100),
        discountAllowed: configDiscountAllowed,
        scholarshipAllowed: configScholarshipAllowed,
      });
      toast.success('Exam fee structure configured for class');
      setConfigModalOpen(false);
      loadConfigs();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setConfigBusy(false);
    }
  };

  const handleSyncNewStudents = async () => {
    if (!selectedExamId) {
      toast.error('Select an examination first');
      return;
    }

    setGenBusy(true);
    try {
      const res = await api.post<{ success: boolean; data: { generated: number }, message?: string }>(
        '/exam-fees/sync-students',
        { examId: selectedExamId }
      );
      toast.success(res.data.message || `Synced ${res.data.data.generated} missing student fee record(s)`);
      setActiveTab('collection');
      loadStudentFees();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setGenBusy(false);
    }
  };

  const openCollection = (fee: StudentExamFeeRow) => {
    setCollectTarget(fee);
    setPaymentAmountPKR((fee.remainingBalance / 100).toFixed(0));
    setPaymentMethod('cash');
    setPaymentDiscountPKR('0');
    setPaymentFinePKR('0');
    setPaymentReference('');
    setPaymentNotes('');
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;

    const amount = Math.round(Number(paymentAmountPKR) * 100);
    if (amount <= 0) {
      toast.error('Amount must be positive');
      return;
    }

    setPaymentBusy(true);
    try {
      const res = await api.post<{ success: boolean; data: { payment: { _id: string } } }>('/exam-fees/collect', {
        studentExamFeeId: collectTarget._id,
        amount,
        paymentMethod,
        discount: Math.round(Number(paymentDiscountPKR || '0') * 100),
        fine: Math.round(Number(paymentFinePKR || '0') * 100),
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });

      toast.success('Payment recorded successfully');
      setCollectTarget(null);
      loadStudentFees();

      // Open receipt immediately
      if (res.data.data?.payment?._id) {
        openReceipt(res.data.data.payment._id);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPaymentBusy(false);
    }
  };

  const openReceipt = async (paymentId: string) => {
    try {
      const res = await api.get<ApiDataResponse<PrintableReceiptData>>(`/exam-fees/receipt/${paymentId}`);
      setReceiptData(res.data.data);
      setReceiptModalOpen(true);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const filteredStudentFees = studentFees.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (f.studentName && f.studentName.toLowerCase().includes(q)) ||
      (f.admissionNumber && f.admissionNumber.toLowerCase().includes(q)) ||
      (f.rollNumber && f.rollNumber.toLowerCase().includes(q))
    );
  });

  const expectedTotal = studentFees.reduce((acc, f) => acc + (f.netPayable || 0), 0);
  const collectedTotal = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
  const pendingTotal = studentFees.reduce((acc, f) => acc + (f.remainingBalance || 0), 0);
  const paidCount = studentFees.filter((f) => f.status === 'paid').length;
  const partialCount = studentFees.filter((f) => f.status === 'partial').length;
  const unpaidCount = studentFees.filter((f) => f.status === 'unpaid').length;

  const handleExportCsv = () => {
    if (studentFees.length === 0) {
      toast.error('No fee records to export');
      return;
    }
    const headers = ['Student Name', 'Admission No', 'Roll No', 'Class', 'Section', 'Net Payable', 'Amount Paid', 'Remaining', 'Status', 'Due Date'];
    const rows = studentFees.map((f) => [
      `"${f.studentName || ''}"`,
      `"${f.admissionNumber || ''}"`,
      `"${f.rollNumber || ''}"`,
      `"${f.className || ''}"`,
      `"${f.sectionName || ''}"`,
      f.netPayable,
      f.amountPaid,
      f.remainingBalance,
      `"${f.status}"`,
      `"${f.dueDate ? formatDate(f.dueDate) : ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Exam_Fees_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exam fees exported to CSV');
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Exam Fees Management"
        description="Dedicated examination fee configuration, fee generation, partial payments, and independent receipt issuance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleSyncNewStudents} disabled={genBusy || !selectedExamId}>
              <RotateCcw className={`mr-1.5 h-3.5 w-3.5 text-primary ${genBusy ? 'animate-spin' : ''}`} /> Sync New Students
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setActiveTab('collection')}>
              <Receipt className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Collect Payment
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleExportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* 6 Top Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard title="EXPECTED" value={formatMoney(expectedTotal)} icon={Receipt} loading={loadingFees} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="COLLECTED" value={formatMoney(collectedTotal)} icon={Wallet} tone="success" loading={loadingFees} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="PENDING" value={formatMoney(pendingTotal)} icon={Clock} tone="warning" loading={loadingFees} valueClassName="text-lg sm:text-xl xl:text-xl" />
        <StatCard title="PAID STUDENTS" value={paidCount} icon={CheckCircle2} tone="success" loading={loadingFees} />
        <StatCard title="PARTIAL" value={partialCount} icon={AlertCircle} tone="warning" loading={loadingFees} />
        <StatCard title="UNPAID" value={unpaidCount} icon={Wallet} tone="destructive" loading={loadingFees} />
      </div>

      {/* Scope Selector */}
      <Card className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              <Filter className="h-4 w-4 text-primary" />
              <span>Exam Scope:</span>
            </div>

            <div className="w-64">
              <Select
                value={selectedExamId}
                onValueChange={(val) => {
                  setSelectedExamId(val);
                  setSearchParams({ examId: val });
                }}
              >
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
                  <SelectValue placeholder="All Classes" />
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

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="grid w-full grid-cols-2 max-w-sm rounded-xl p-1">
          <TabsTrigger value="collection" className="rounded-lg text-xs">Fee Records & Collection</TabsTrigger>
          <TabsTrigger value="setup" className="rounded-lg text-xs">Class Fee Setup</TabsTrigger>
        </TabsList>

        {/* TAB 1: Fee Collection & Student Records */}
        <TabsContent value="collection" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 max-w-sm w-full">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search student by name or admission number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => loadStudentFees()} className="h-9">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {loadingFees ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed p-8">
              <p className="text-sm text-muted-foreground animate-pulse">Loading student exam fees...</p>
            </div>
          ) : filteredStudentFees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-10 text-center bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm/40">
              <Wallet className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <h3 className="mt-3 text-base font-semibold">No fee records found</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                No exam fees have been generated for this examination scope yet.
              </p>
              <Button size="sm" onClick={handleSyncNewStudents} disabled={genBusy || !selectedExamId} className="mt-4">
                <RotateCcw className={`mr-2 h-4 w-4 ${genBusy ? 'animate-spin' : ''}`} /> Sync New Students
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b border-border/60">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Class / Sec</th>
                      <th className="py-3 px-4 text-right">Original Fee</th>
                      <th className="py-3 px-4 text-right">Net Payable</th>
                      <th className="py-3 px-4 text-right">Paid</th>
                      <th className="py-3 px-4 text-right">Remaining</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredStudentFees.map((row) => (
                      <tr key={row._id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-foreground">{row.studentName}</p>
                          <p className="text-xs text-muted-foreground">
                            Adm: {row.admissionNumber} · Roll: {row.rollNumber || '—'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {row.className} - {row.sectionName}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono">{formatMoney(row.originalAmount)}</td>
                        <td className="py-3 px-4 text-right text-xs font-semibold font-mono">
                          {formatMoney(row.netPayable)}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono text-emerald-600">
                          {formatMoney(row.amountPaid)}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-bold font-mono">
                          {formatMoney(row.remainingBalance)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant={
                              row.status === 'paid'
                                ? 'default'
                                : row.status === 'partial'
                                ? 'outline'
                                : 'destructive'
                            }
                            className="capitalize text-[11px]"
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {row.status !== 'paid' ? (
                            <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => openCollection(row)}>
                              <Wallet className="mr-1 h-3 w-3" /> Collect
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Class Fee Setup */}
        <TabsContent value="setup" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Configured Class Exam Fees</h3>
              <p className="text-xs text-muted-foreground">
                Class-wise exam fee configurations assigned during exam creation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feeConfigs.map((cfg) => (
              <Card key={cfg._id} className="border-border/70 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                setConfigClassId(cfg.classId);
                setConfigAmountPKR((cfg.amount / 100).toString());
                setConfigFinePKR((cfg.defaultFine / 100).toString());
                setConfigDueDate(cfg.dueDate ? cfg.dueDate.slice(0, 10) : '');
                setConfigDiscountAllowed(cfg.discountAllowed);
                setConfigScholarshipAllowed(cfg.scholarshipAllowed);
                setConfigModalOpen(true);
              }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold">{cfg.className}</CardTitle>
                    <Badge variant="default">{formatMoney(cfg.amount)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Due Date:</span>
                    <span className="font-medium text-foreground">{cfg.dueDate ? formatDate(cfg.dueDate) : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Default Late Fine:</span>
                    <span className="font-medium text-foreground">{formatMoney(cfg.defaultFine)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount Allowed:</span>
                    <span className="font-medium text-foreground">{cfg.discountAllowed ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scholarship Allowed:</span>
                    <span className="font-medium text-foreground">{cfg.scholarshipAllowed ? 'Yes' : 'No'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Class Fee Setup Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Class Exam Fee</DialogTitle>
            <DialogDescription>Set fee amount and terms for a specific class for this exam.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <div className="h-9 px-3 py-2 text-sm border rounded-md bg-muted/50 font-medium">
                {classes.find(c => c._id === configClassId)?.name || 'Unknown Class'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cfgAmount">Exam Fee (PKR) *</Label>
                <Input
                  id="cfgAmount"
                  type="number"
                  min="0"
                  value={configAmountPKR}
                  onChange={(e) => setConfigAmountPKR(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfgFine">Default Fine (PKR)</Label>
                <Input
                  id="cfgFine"
                  type="number"
                  min="0"
                  value={configFinePKR}
                  onChange={(e) => setConfigFinePKR(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfgDue">Due Date</Label>
              <Input
                id="cfgDue"
                type="date"
                value={configDueDate}
                onChange={(e) => setConfigDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cfgDisc" className="text-xs">
                  Allow Student Fee Discounts
                </Label>
                <Switch
                  id="cfgDisc"
                  checked={configDiscountAllowed}
                  onCheckedChange={setConfigDiscountAllowed}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="cfgSchol" className="text-xs">
                  Allow Scholarship Exemptions
                </Label>
                <Switch
                  id="cfgSchol"
                  checked={configScholarshipAllowed}
                  onCheckedChange={setConfigScholarshipAllowed}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setConfigModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={configBusy}>
                {configBusy ? 'Saving...' : 'Save Structure'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Modal */}
      <Dialog open={Boolean(collectTarget)} onOpenChange={(open) => !open && setCollectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collect Exam Fee Payment</DialogTitle>
            <DialogDescription>
              Record student payment. Supports partial payments and generates dedicated exam fee receipt.
            </DialogDescription>
          </DialogHeader>

          {collectTarget && (
            <form onSubmit={handleCollectPayment} className="space-y-4">
              <div className="rounded-lg border border-border/80 p-3 bg-muted/40 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">{collectTarget.studentName}</span>
                  <span>Adm: {collectTarget.admissionNumber}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Net Payable: {formatMoney(collectTarget.netPayable)}</span>
                  <span>Already Paid: {formatMoney(collectTarget.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-primary pt-1 border-t border-border/60">
                  <span>Remaining Balance:</span>
                  <span>{formatMoney(collectTarget.remainingBalance)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payAmount">Payment Amount (PKR) *</Label>
                  <Input
                    id="payAmount"
                    type="number"
                    min="1"
                    value={paymentAmountPKR}
                    onChange={(e) => setPaymentAmountPKR(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payMethod">Payment Method *</Label>
                  <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                    <SelectTrigger id="payMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Debit/Credit Card</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payDisc">Discount (PKR)</Label>
                  <Input
                    id="payDisc"
                    type="number"
                    min="0"
                    value={paymentDiscountPKR}
                    onChange={(e) => setPaymentDiscountPKR(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payFine">Fine (PKR)</Label>
                  <Input
                    id="payFine"
                    type="number"
                    min="0"
                    value={paymentFinePKR}
                    onChange={(e) => setPaymentFinePKR(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payRef">Reference / Transaction ID</Label>
                <Input
                  id="payRef"
                  placeholder="e.g. Bank slip # or check number"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payNotes">Notes</Label>
                <Textarea
                  id="payNotes"
                  rows={2}
                  placeholder="Optional remarks..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setCollectTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={paymentBusy}>
                  {paymentBusy ? 'Processing...' : 'Confirm & Issue Receipt'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Printable Receipt Modal */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Exam Fee Receipt</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant={receiptStyle === 'compact' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReceiptStyle('compact')}
                  className="h-7 text-xs"
                >
                  Compact Slip
                </Button>
                <Button
                  variant={receiptStyle === 'a4' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReceiptStyle('a4')}
                  className="h-7 text-xs"
                >
                  A4 Receipt
                </Button>
              </div>
            </div>
          </DialogHeader>

          {receiptData && (
            <div className={`p-6 border border-border/80 rounded-xl bg-white text-black print:m-0 print:p-0 print:border-none ${receiptStyle === 'compact' ? 'max-w-md mx-auto text-xs' : 'text-sm'}`}>
              {/* Header */}
              <div className="text-center border-b pb-3">
                {receiptData.school?.schoolLogoUrl && (
                  <img
                    src={receiptData.school.schoolLogoUrl}
                    alt=""
                    className="h-10 mx-auto mb-1 object-contain"
                  />
                )}
                <h2 className="font-bold uppercase tracking-wider text-base">
                  {receiptData.school?.schoolName || 'School Management System'}
                </h2>
                <p className="text-[11px] text-gray-500">{receiptData.school?.address}</p>
                <div className="mt-2 inline-block bg-gray-100 px-3 py-1 rounded">
                  <h3 className="font-extrabold uppercase tracking-widest text-xs">EXAM FEE RECEIPT</h3>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 my-3 py-2 border-b text-[11px]">
                <div>
                  <p>
                    <span className="font-semibold">Receipt No:</span>{' '}
                    <span className="font-mono font-bold">{receiptData.payment.receiptNumber}</span>
                  </p>
                  <p>
                    <span className="font-semibold">Date:</span> {formatDate(receiptData.payment.paymentDate)}
                  </p>
                  <p>
                    <span className="font-semibold">Exam:</span> {receiptData.exam.name}
                  </p>
                </div>
                <div>
                  <p>
                    <span className="font-semibold">Student:</span> {receiptData.student.fullName}
                  </p>
                  <p>
                    <span className="font-semibold">Admission No:</span> {receiptData.student.admissionNumber}
                  </p>
                  <p>
                    <span className="font-semibold">Class:</span> {receiptData.student.className} - {receiptData.student.sectionName}
                  </p>
                </div>
              </div>

              {/* Financial Breakdown Table */}
              <table className="w-full border-collapse border border-gray-300 text-[11px] my-3">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-1.5 text-left">Description</th>
                    <th className="border border-gray-300 p-1.5 text-right">Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 p-1.5">Original Exam Fee</td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono">
                      {(receiptData.fee.originalAmount / 100).toFixed(2)}
                    </td>
                  </tr>
                  {receiptData.fee.discountAmount > 0 && (
                    <tr>
                      <td className="border border-gray-300 p-1.5">Discount Allowed</td>
                      <td className="border border-gray-300 p-1.5 text-right font-mono text-emerald-600">
                        -{(receiptData.fee.discountAmount / 100).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {receiptData.fee.fineAmount > 0 && (
                    <tr>
                      <td className="border border-gray-300 p-1.5">Late Fine</td>
                      <td className="border border-gray-300 p-1.5 text-right font-mono">
                        +{(receiptData.fee.fineAmount / 100).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border border-gray-300 p-1.5">Net Payable Amount</td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono">
                      {(receiptData.fee.netPayable / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold text-emerald-800">
                    <td className="border border-gray-300 p-1.5">Amount Paid This Receipt</td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono">
                      {(receiptData.payment.amount / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="font-semibold text-gray-800">
                    <td className="border border-gray-300 p-1.5">Remaining Balance</td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono">
                      {(receiptData.fee.remainingBalance / 100).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-between items-center text-[10px] text-gray-500 pt-2">
                <span>Method: {receiptData.payment.paymentMethod.replace('_', ' ').toUpperCase()}</span>
                {receiptData.payment.reference && <span>Ref: {receiptData.payment.reference}</span>}
              </div>

              {/* Signature */}
              <div className="flex justify-between pt-10 text-[10px] font-semibold text-gray-700">
                <div className="border-t border-gray-400 pt-1 w-32 text-center">Student / Depositor</div>
                <div className="border-t border-gray-400 pt-1 w-32 text-center">Authorized Signature</div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setReceiptModalOpen(false)}>
              Close
            </Button>
            <Button onClick={handleBrowserPrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
