import { useCallback, useEffect, useState } from 'react';
import { Printer, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw, Loader2, UserCheck, Eye, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatStudentIdentity } from '@/lib/format';

interface ExamOption {
  _id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  requireExamFeeForAdmitCard?: boolean;
}

interface ClassOption {
  _id: string;
  name: string;
}

interface StudentEligibility {
  studentId: string;
  student: {
    _id: string;
    fullName: string;
  };
  fullName: string;
  studentName?: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  caste?: string | null;
  admissionNumber: string;
  rollNumber?: string;
  examRollNumber?: number;
  className?: string;
  sectionName?: string;
  photo?: string | null;
  block?: string;
  seatNumber?: string;
  isEligible: boolean;
  status: 'eligible' | 'pending_fees' | 'overridden';
  statusText: string;
  feeStatus: string;
  remainingFee: number;
  overrideReason?: string | null;
}

interface PrintableAdmitCardData {
  school: {
    name: string;
    address?: string;
    phone?: string;
    logoUrl?: string;
  };
  exam: {
    name: string;
    startDate?: string;
    endDate?: string;
  };
  student: {
    name: string;
    fullName: string;
    fatherName?: string | null;
    guardianName?: string | null;
    gender?: string;
    caste?: string | null;
    admissionNumber: string;
    rollNumber?: string;
    examRollNumber?: number | string;
    class: string;
    section?: string;
    profilePhotoUrl?: string;
  };
  schedule: {
    subjectName: string;
    subjectCode?: string;
    examDate: string;
    startTime: string;
    endTime: string;
    roomNumber?: string;
  }[];
  instructions: string[];
}

export function AdmitCardsPage() {
  const { can, user } = useAuth();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [students, setStudents] = useState<StudentEligibility[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Override dialog
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideStudent, setOverrideStudent] = useState<StudentEligibility | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Print Preview dialog
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printableCards, setPrintableCards] = useState<PrintableAdmitCardData[]>([]);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // Generate Roll Numbers dialog
  const [generateRollModalOpen, setGenerateRollModalOpen] = useState(false);
  const [generateRollLoading, setGenerateRollLoading] = useState(false);
  const [generateMode, setGenerateMode] = useState<'initial' | 'append' | 'regenerate'>('initial');
  const [startExamRollNumber, setStartExamRollNumber] = useState('1000');



  // Load exams and classes on mount
  useEffect(() => {
    (async () => {
      try {
        const [examsRes, classesRes] = await Promise.all([
          api.get<{ data: ExamOption[] }>('/exams'),
          api.get<{ data: ClassOption[] }>('/classes'),
        ]);
        const exList = examsRes.data.data || [];
        const clList = classesRes.data.data || [];
        setExams(exList);
        setClasses(clList);
        if (exList.length > 0) setSelectedExamId(exList[0]._id);
        if (clList.length > 0) setSelectedClassId('all');
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    })();
  }, []);

  const loadEligibility = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const url = selectedClassId === 'all' 
        ? `/exams/admit-cards/students?examId=${selectedExamId}`
        : `/exams/admit-cards/students?examId=${selectedExamId}&classId=${selectedClassId}`;
      const res = await api.get<{
        data: {
          examId: string;
          examName: string;
          requireFeeBeforeAdmitCard: boolean;
          cards: StudentEligibility[];
        } | StudentEligibility[];
      }>(url);
      // Handle both { cards: [...] } and direct array if ever returned
      let cardList = (res.data?.data as any)?.cards || (Array.isArray(res.data?.data) ? res.data?.data : []);
      
      if (selectedClassId === 'all') {
        cardList = [...cardList].sort((a: any, b: any) => {
          const aRoll = a.examRollNumber != null ? Number(a.examRollNumber) : Infinity;
          const bRoll = b.examRollNumber != null ? Number(b.examRollNumber) : Infinity;
          return aRoll - bRoll;
        });
      }

      setStudents(cardList);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedClassId]);

  useEffect(() => {
    loadEligibility();
  }, [loadEligibility]);

  const handleOpenOverride = (item: StudentEligibility) => {
    setOverrideStudent(item);
    setOverrideReason(item.overrideReason || '');
    setOverrideModalOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!overrideStudent || !selectedExamId) return;
    if (!overrideReason.trim()) {
      toast.error('Please specify an official reason for overriding eligibility');
      return;
    }
    setOverrideSaving(true);
    try {
      await api.post('/exams/admit-cards/override', {
        examId: selectedExamId,
        studentId: overrideStudent.studentId || overrideStudent.student?._id,
        reason: overrideReason.trim(),
      });
      toast.success(`Admin override granted for ${overrideStudent.fullName}`);
      setOverrideModalOpen(false);
      loadEligibility();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleRevokeOverride = async (item: StudentEligibility) => {
    const studentName = item.fullName || 'student';
    if (!confirm(`Revoke admin override for ${studentName}?`)) return;
    try {
      await api.delete('/exams/admit-cards/override', {
        data: {
          examId: selectedExamId,
          studentId: item.studentId || item.student?._id,
        },
      });
      toast.success('Admin override revoked');
      loadEligibility();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleGenerateRollNumbers = async () => {
    if (!selectedExamId) return;

    const startNum = parseInt(startExamRollNumber, 10);
    if (generateMode !== 'append' && (isNaN(startNum) || startNum < 1 || startExamRollNumber.includes('.'))) {
      toast.error('Start Exam Roll Number must be a positive integer.');
      return;
    }

    const payload: any = {
      examId: selectedExamId,
      regenerate: generateMode === 'regenerate',
    };

    if (generateMode !== 'append') {
      payload.startExamRollNumber = startNum;
      if (generateMode === 'regenerate') {
        if (!confirm('WARNING: This will replace ALL existing Exam Roll Numbers for this Exam. Are you sure you want to regenerate?')) {
          return;
        }
        payload.regenerate = true;
      }
    }
    // If 'append', payload has no startExamRollNumber and no regenerate flag
    
    setGenerateRollLoading(true);
    try {
      const res = await api.post<{ data: any, message: string }>('/exams/roll-numbers/generate', payload);
      toast.success(res.data?.message || 'Generated Successfully');
      setGenerateRollModalOpen(false);
      loadEligibility();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setGenerateRollLoading(false);
    }
  };



  const handlePrintSingle = async (studentId: string) => {
    setLoadingPrint(true);
    try {
      const res = await api.get<{ data: PrintableAdmitCardData | PrintableAdmitCardData[] }>(
        `/exams/admit-cards/print?examId=${selectedExamId}&studentId=${studentId}`
      );
      const cardData = Array.isArray(res.data.data) ? res.data.data : [res.data.data];
      setPrintableCards(cardData);
      setPrintModalOpen(true);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoadingPrint(false);
    }
  };

  const handlePrintBatch = async () => {
    if (!selectedExamId) return;
    setLoadingPrint(true);
    try {
      const url = selectedClassId === 'all'
        ? `/exams/admit-cards/print?examId=${selectedExamId}`
        : `/exams/admit-cards/print?examId=${selectedExamId}&classId=${selectedClassId}`;
      const res = await api.get<{ data: PrintableAdmitCardData[] }>(url);
      let cardList = res.data.data || [];
      
      if (selectedClassId === 'all') {
        cardList = [...cardList].sort((a, b) => {
          const aRoll = a.student.examRollNumber != null && a.student.examRollNumber !== 'Not Generated' ? Number(a.student.examRollNumber) : Infinity;
          const bRoll = b.student.examRollNumber != null && b.student.examRollNumber !== 'Not Generated' ? Number(b.student.examRollNumber) : Infinity;
          return aRoll - bRoll;
        });
      }

      if (cardList.length === 0) {
        toast.info('No eligible admit cards to print for this class.');
        return;
      }
      setPrintableCards(cardList);
      setPrintModalOpen(true);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoadingPrint(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const fullName = (s.fullName || '').toLowerCase();
    const adm = (s.admissionNumber || '').toLowerCase();
    const roll = (s.rollNumber || '').toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch = fullName.includes(q) || adm.includes(q) || roll.includes(q);

    if (!matchesSearch) return false;
    if (filterStatus === 'eligible') return s.isEligible && s.status !== 'overridden';
    if (filterStatus === 'pending_fees') return !s.isEligible;
    if (filterStatus === 'overridden') return s.status === 'overridden';
    return true;
  });

  const eligibleCount = students.filter((s) => s.isEligible).length;
  const blockedCount = students.filter((s) => !s.isEligible).length;
  const overriddenCount = students.filter((s) => s.status === 'overridden').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admit Cards & Hall Tickets"
        description="Verify fee clearance, grant emergency admin overrides, and generate printable roll number slips."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const hasExisting = students.some(s => s.examRollNumber != null);
                setGenerateMode(hasExisting ? 'append' : 'initial');
                setGenerateRollModalOpen(true);
              }}
              className="text-primary hover:text-primary hover:bg-primary/10"
              disabled={loading || exams.length === 0}
            >
              <CheckCircle2 className="mr-2 h-4 w-4 text-primary" /> Manage Exam Roll Numbers
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintBatch}
              disabled={loading || loadingPrint || eligibleCount === 0}
            >
              <Printer className="mr-2 h-4 w-4" /> Print Eligible Batch ({eligibleCount})
            </Button>
            <Button variant="ghost" size="icon" onClick={loadEligibility} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Overview Cards (Section 32) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          title="ELIGIBLE TO SIT"
          value={`${eligibleCount} / ${students.length}`}
          icon={CheckCircle2}
          tone="primary"
          loading={loading}
          description={`${students.length > 0 ? Math.round((eligibleCount / students.length) * 100) : 0}% of class cleared`}
        />
        <StatCard
          title="BLOCKED (FEES)"
          value={blockedCount}
          icon={XCircle}
          tone="destructive"
          loading={loading}
          description="Due balances"
        />
        <StatCard
          title="ADMIN OVERRIDES"
          value={overriddenCount}
          icon={ShieldCheck}
          tone="warning"
          loading={loading}
          description="Emergency permits"
        />
        <StatCard
          title="TOTAL IN CLASS"
          value={students.length}
          icon={Users}
          tone="default"
          loading={loading}
          description="Class enrollment"
        />
      </div>

      {/* Selectors and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/30 p-4 rounded-lg border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Label className="text-xs mb-1 block">Examination</Label>
            <Select value={selectedExamId} onValueChange={setSelectedExamId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Exam" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((ex) => (
                  <SelectItem key={ex._id} value={ex._id}>{ex.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Label className="text-xs mb-1 block">Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls._id} value={cls._id}>{cls.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Label className="text-xs mb-1 block">Status Filter</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Students</SelectItem>
                <SelectItem value="eligible">Eligible Only</SelectItem>
                <SelectItem value="pending_fees">Blocked (Dues)</SelectItem>
                <SelectItem value="overridden">Overridden</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="w-64">
          <Label className="text-xs mb-1 block">Search Student</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or roll no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
      </div>

      {/* Student Eligibility List */}
      <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3 text-left">Student Information</th>
                <th className="px-4 py-3 text-left">EXAM ROLL NO.</th>
                <th className="px-4 py-3 text-left">Exam Fee Status</th>
                <th className="px-4 py-3 text-left">Admit Card Clearance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Checking fee clearance and eligibility...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    No students found matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((item) => (
                  <tr key={item.studentId || item.student?._id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 border flex items-center justify-center font-bold text-xs text-primary overflow-hidden">
                          {item.photo ? (
                            <img src={item.photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span>{(item.fullName || 'S').slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {formatStudentIdentity(item as any)}
                          </p>
                          {item.fatherName && (
                            <p className="text-xs text-muted-foreground">
                              Father: {item.fatherName}
                            </p>
                          )}
                          {selectedClassId === 'all' && item.className && (
                            <p className="text-xs text-muted-foreground mt-0.5 font-medium text-primary/80">
                              Class: {item.className}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold">{item.examRollNumber ?? 'Not Generated'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              item.feeStatus === 'paid'
                                ? 'default'
                                : item.feeStatus === 'partial'
                                ? 'outline'
                                : 'destructive'
                            }
                            className="text-[10px] uppercase font-semibold"
                          >
                            {item.feeStatus.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'overridden' ? (
                        <div>
                          <Badge className="bg-primary/20 text-primary border-primary/30 flex items-center gap-1 w-fit">
                            <ShieldCheck className="h-3 w-3" /> Overridden by Admin
                          </Badge>
                          {item.overrideReason && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs truncate" title={item.overrideReason}>
                              Note: {item.overrideReason}
                            </p>
                          )}
                        </div>
                      ) : item.isEligible ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3" /> Eligible
                        </Badge>
                      ) : (
                        <div>
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <XCircle className="h-3 w-3" /> Blocked
                          </Badge>
                          <p className="text-[11px] text-red-500 mt-0.5">{item.statusText || 'Exam Fee Pending'}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'overridden' ? (
                          can('admitCards', 'overrideEligibility') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => handleRevokeOverride(item)}
                            >
                              Revoke Override
                            </Button>
                          )
                        ) : !item.isEligible ? (
                          can('admitCards', 'overrideEligibility') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-primary hover:bg-primary/10"
                              onClick={() => handleOpenOverride(item)}
                            >
                              <ShieldAlert className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Override & Allow
                            </Button>
                          )
                        ) : null}

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!item.isEligible}
                          onClick={() => handlePrintSingle(item.studentId || item.student?._id)}
                          className="text-xs"
                          title={!item.isEligible ? 'Fee clearance required before admit card can be issued' : 'Print Admit Card'}
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={generateRollModalOpen} onOpenChange={setGenerateRollModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {generateMode === 'initial' ? 'Generate Exam Roll Numbers' : 'Manage Exam Roll Numbers'}
            </DialogTitle>
            <DialogDescription>
              {generateMode === 'initial' 
                ? 'Round-robin generation across selected classes. New students will be assigned the next available roll number automatically.'
                : 'Existing Exam Roll Numbers found. Choose an action below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {generateMode !== 'initial' && (
              <div className="flex flex-col gap-2 mb-4">
                <Button 
                  variant={generateMode === 'append' ? 'default' : 'outline'} 
                  onClick={() => setGenerateMode('append')}
                  className="justify-start"
                >
                  Append New Students (Keep Existing)
                </Button>
                <Button 
                  variant={generateMode === 'regenerate' ? 'destructive' : 'outline'} 
                  onClick={() => setGenerateMode('regenerate')}
                  className="justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" /> Regenerate All Exam Roll Numbers
                </Button>
              </div>
            )}
            
            {(generateMode === 'initial' || generateMode === 'regenerate') && (
              <div>
                <Label htmlFor="startExamRollNumber" className="text-xs">
                  {generateMode === 'regenerate' ? 'New Start Exam Roll Number *' : 'Start Exam Roll Number *'}
                </Label>
                <Input
                  id="startExamRollNumber"
                  type="number"
                  min="1"
                  step="1"
                  className="mt-1"
                  value={startExamRollNumber}
                  onChange={(e) => setStartExamRollNumber(e.target.value)}
                  placeholder="e.g. 1000"
                />
                {generateMode === 'regenerate' && (
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    This will replace Exam Roll Numbers for this Exam only.
                  </p>
                )}
              </div>
            )}
            
            {generateMode === 'append' && (
              <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
                Participating students without an Exam Roll Number will be assigned numbers starting after the current maximum.
              </div>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setGenerateRollModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleGenerateRollNumbers} 
              disabled={generateRollLoading}
              variant={generateMode === 'regenerate' ? 'destructive' : 'default'}
            >
              {generateRollLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {generateMode === 'initial' ? 'Generate' : generateMode === 'append' ? 'Append' : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Admin Override Modal */}
      <Dialog open={overrideModalOpen} onOpenChange={setOverrideModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" /> Grant Exam Eligibility Override
            </DialogTitle>
            <DialogDescription>
              Emergency administrator action. Allows the student to sit in the examination even if exam fees remain unpaid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
              <p><strong>Student:</strong> {overrideStudent?.fullName} ({overrideStudent?.admissionNumber})</p>
              <p><strong>Pending Balance:</strong> {formatCurrency((overrideStudent?.remainingFee || 0) / 100)}</p>
            </div>
            <div>
              <Label htmlFor="overrideReason" className="text-xs">Reason for Override (Audit Logged) *</Label>
              <Textarea
                id="overrideReason"
                placeholder="e.g., Parent submitted undertaking to clear fees by Friday; Approved by Principal."
                rows={3}
                className="mt-1"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setOverrideModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveOverride} disabled={overrideSaving}>
              {overrideSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Authorize Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable Admit Card Modal / Print View */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <div className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Admit Card Preview</h3>
              <p className="text-xs text-muted-foreground">Ready for high quality browser printing or PDF saving</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print Document
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPrintModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>

          {/* Print Template Body */}
          <div className="p-6 space-y-8 print:p-0 print:m-0" id="admit-card-printable-area">
            {printableCards.map((card, idx) => (
              <div
                key={idx}
                className="admit-card-page border-2 border-dashed border-gray-400 p-6 bg-white text-black rounded-lg shadow-sm print:shadow-none print:border-solid print:border-black print:rounded-none page-break-after"
              >
                {/* Header with School Details */}
                <div className="border-b-2 border-black pb-4 text-center relative">
                  {card.school.logoUrl && (
                    <img
                      src={card.school.logoUrl}
                      alt="Logo"
                      className="absolute left-0 top-0 h-16 w-16 object-contain"
                    />
                  )}
                  <h1 className="text-2xl font-bold uppercase tracking-wide">{card.school.name}</h1>
                  {card.school.address && <p className="text-xs text-gray-600">{card.school.address}</p>}
                  {card.school.phone && <p className="text-xs text-gray-600">Phone: {card.school.phone}</p>}
                  <div className="mt-2 inline-block bg-black text-white px-4 py-1 text-xs font-bold uppercase tracking-widest rounded">
                    EXAMINATION ADMIT CARD / ROLL NUMBER SLIP
                  </div>
                </div>

                {/* Examination Title */}
                <div className="text-center py-2 bg-gray-100 border-b border-gray-300 my-2">
                  <h2 className="text-lg font-bold uppercase text-gray-800">{card.exam.name}</h2>
                </div>

                {/* Student Details & Photo */}
                <div className="flex justify-between items-start gap-4 py-3 border-b border-gray-300">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm flex-1">
                    <div>
                      <span className="font-semibold text-gray-700">Student Name:</span>{' '}
                      <span className="font-bold text-gray-950">{formatStudentIdentity(card.student as any)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Exam Roll No:</span>{' '}
                      <span className="font-bold text-gray-950 font-mono text-base">{card.student.examRollNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Block/Room & Seat:</span>{' '}
                      <span className="font-bold text-gray-950">{(card.student as any).block || 'Unassigned'} - {(card.student as any).seatNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Admission No:</span>{' '}
                      <span className="font-medium text-gray-950">{card.student.admissionNumber}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Class & Section:</span>{' '}
                      <span className="font-bold text-gray-950">{card.student.class} {card.student.section || ''}</span>
                    </div>

                  </div>

                  {/* Student Photo Box */}
                  <div className="w-24 h-28 border-2 border-gray-400 flex flex-col items-center justify-center text-center p-1 bg-gray-50 flex-shrink-0">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Affix Photo Here</span>
                  </div>
                </div>

                {/* Timetable Schedule */}
                <div className="py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">Subject Examination Schedule</h3>
                  <table className="w-full text-left text-xs border border-gray-300">
                    <thead className="bg-gray-100 border-b border-gray-300 font-bold">
                      <tr>
                        <th className="p-2 border-r border-gray-300">Subject</th>
                        <th className="p-2 border-r border-gray-300">Exam Date</th>
                        <th className="p-2 border-r border-gray-300">Timing</th>
                        <th className="p-2">Room / Hall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {card.schedule.map((sch, sIdx) => (
                        <tr key={sIdx} className="hover:bg-gray-50">
                          <td className="p-2 font-semibold border-r border-gray-300">
                            {sch.subjectName} {sch.subjectCode ? `(${sch.subjectCode})` : ''}
                          </td>
                          <td className="p-2 border-r border-gray-300">{formatDate(sch.examDate)}</td>
                          <td className="p-2 border-r border-gray-300">{sch.startTime} - {sch.endTime}</td>
                          <td className="p-2">{sch.roomNumber || 'Assigned Hall'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Exam Rules & Instructions */}
                <div className="py-2 border-t border-gray-300 text-[11px] text-gray-700">
                  <p className="font-bold uppercase text-gray-900 mb-1">Important Instructions for Candidates:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    {card.instructions.map((ins, iIdx) => (
                      <li key={iIdx}>{ins}</li>
                    ))}
                  </ol>
                </div>

                {/* Signatures Footer */}
                <div className="grid grid-cols-3 gap-4 pt-10 mt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-t border-gray-500 w-32 mx-auto pt-1 font-semibold">Student Signature</div>
                  </div>
                  <div>
                    <div className="border-t border-gray-500 w-32 mx-auto pt-1 font-semibold">Class Teacher</div>
                  </div>
                  <div>
                    <div className="border-t border-gray-500 w-36 mx-auto pt-1 font-semibold">Controller of Exams / Principal</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
