import { useCallback, useEffect, useState } from 'react';
import {
  FileText, Download, Printer, TrendingUp, TrendingDown, DollarSign,
  Award, BarChart3, Users, CheckCircle2, XCircle, Percent, Scale, RefreshCw
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

interface ExamOption {
  _id: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

interface ClassOption {
  _id: string;
  name: string;
}

export function ExamReportsPage() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('summary');

  // Report states
  const [summaryData, setSummaryData] = useState<any>(null);
  const [feeData, setFeeData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [subjectData, setSubjectData] = useState<any[]>([]);
  const [classResultsData, setClassResultsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    })();
  }, []);

  const loadReportData = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      if (activeTab === 'summary') {
        const res = await api.get(`/exams/reports/summary?examId=${selectedExamId}`);
        setSummaryData(res.data.data);
      } else if (activeTab === 'fees') {
        const classParam = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
        const res = await api.get(`/exams/reports/fees?examId=${selectedExamId}${classParam}`);
        setFeeData(res.data.data);
      } else if (activeTab === 'financial') {
        const res = await api.get(`/exams/reports/financial-summary?examId=${selectedExamId}`);
        setFinancialData(res.data.data);
      } else if (activeTab === 'subjects') {
        const classParam = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
        const res = await api.get(`/exams/reports/subjects?examId=${selectedExamId}${classParam}`);
        setSubjectData(res.data.data || []);
      } else if (activeTab === 'classResults') {
        const classParam = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
        const res = await api.get(`/exams/reports/class-results?examId=${selectedExamId}${classParam}`);
        setClassResultsData(res.data.data || []);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedClassId, activeTab]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const handleDownloadCsv = async (endpoint: string, filename: string) => {
    try {
      const res = await api.get(endpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Reports & Analytics"
        description="Comprehensive audit-grade examination summaries, subject performances, fee reconciliations, and financial net balances."
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Report
            </Button>
            <Button variant="ghost" size="icon" onClick={loadReportData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Filter Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/30 p-4 rounded-lg border print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <Label className="text-xs mb-1 block">Select Examination</Label>
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

          {(activeTab === 'fees' || activeTab === 'subjects' || activeTab === 'classResults') && (
            <div className="w-52">
              <Label className="text-xs mb-1 block">Class Scope</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls._id} value={cls._id}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 border print:hidden">
          <TabsTrigger value="summary">Exam Summary</TabsTrigger>
          <TabsTrigger value="financial">Net Financial Balance</TabsTrigger>
          <TabsTrigger value="fees">Fee Collection</TabsTrigger>
          <TabsTrigger value="subjects">Subject Analytics</TabsTrigger>
          <TabsTrigger value="classResults">Merit & Class Results</TabsTrigger>
        </TabsList>

        {/* 1. Exam Summary Tab */}
        <TabsContent value="summary" className="space-y-6">
          {loading || !summaryData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Enrolled</p>
                      <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                        {summaryData.totalStudents || 0}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Assigned Candidates</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Users className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Admit Cards Issued</p>
                      <h3 className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
                        {summaryData.admitCardsIssued || 0}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Fee cleared or overridden</p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall Pass Rate</p>
                      <h3 className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 mt-1">
                        {summaryData.passRate ? `${summaryData.passRate.toFixed(1)}%` : '—'}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{summaryData.passedCount ?? 0} Passed / {summaryData.failedCount ?? 0} Failed</p>
                    </div>
                    <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-500">
                      <Percent className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Exam Balance</p>
                      <h3 className={`text-2xl font-bold tracking-tight mt-1 ${
                        (summaryData.netBalance ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                      }`}>
                        {formatCurrency(summaryData.netBalance ?? 0)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Fees - Direct Expenses</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Scale className="h-6 w-6" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Status and Configuration Metadata */}
              <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-base border-b pb-2">Examination Operational Specifications</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs">Exam Status:</span>
                    <Badge variant={summaryData.exam?.status === 'published' ? 'default' : 'secondary'} className="mt-1">
                      {summaryData.exam?.status || 'draft'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Fee Clearance Required:</span>
                    <span className="font-semibold mt-1 block">
                      {summaryData.exam?.requireExamFeeForAdmitCard ? 'Yes (Strict)' : 'No (Open)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Scheduled Subjects:</span>
                    <span className="font-semibold mt-1 block">{summaryData.subjectCount || 0} papers</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Classes Included:</span>
                    <span className="font-semibold mt-1 block">{summaryData.classCount || 0} classes</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* 2. Net Financial Balance Tab */}
        <TabsContent value="financial" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Net Exam Financial Performance</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadCsv(`/exams/reports/financial-summary/export?examId=${selectedExamId}`, `exam-financial-${selectedExamId}.csv`)}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          {loading || !financialData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Exam Fees Billed</p>
                    <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
                      {formatCurrency(financialData.totalBilled || 0)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Collected: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(financialData.totalCollected || 0)}</strong>
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Exam Expenses</p>
                    <h3 className="text-2xl font-bold tracking-tight text-rose-600 mt-1">
                      {formatCurrency(financialData.totalExpenses || 0)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {financialData.expenseCount || 0} recorded vouchers / items
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Isolated Balance</p>
                      <Badge variant={(financialData.netBalance ?? 0) >= 0 ? 'default' : 'destructive'} className="text-[10px]">
                        {(financialData.netBalance ?? 0) >= 0 ? 'SURPLUS' : 'DEFICIT'}
                      </Badge>
                    </div>
                    <h3 className={`text-2xl font-bold tracking-tight mt-1 ${
                      (financialData.netBalance ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                    }`}>
                      {formatCurrency(financialData.netBalance || 0)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Profit Margin: <strong>{financialData.margin ? `${financialData.margin.toFixed(1)}%` : '0.0%'}</strong>
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown Table */}
              <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-muted/40 font-semibold text-sm">
                  Expense Breakdown by Category
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 border-b text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Category</th>
                      <th className="px-4 py-2.5 text-center">Vouchers</th>
                      <th className="px-4 py-2.5 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {financialData.expenseCategories?.length > 0 ? (
                      financialData.expenseCategories.map((cat: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-medium">{cat.category}</td>
                          <td className="px-4 py-2.5 text-center text-muted-foreground">{cat.count}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(cat.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                          No operational expenses recorded for this exam.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* 3. Fee Collection Tab */}
        <TabsContent value="fees" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Exam Fee Collection & Clearance</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const classParam = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
                handleDownloadCsv(`/exams/reports/fees/export?examId=${selectedExamId}${classParam}`, `exam-fees-${selectedExamId}.csv`);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          {loading || !feeData ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Total Billed</p>
                    <h3 className="text-xl font-bold mt-1">{formatCurrency(feeData.totalBilled || 0)}</h3>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Collected</p>
                    <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {formatCurrency(feeData.totalCollected || 0)}
                    </h3>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Pending Dues</p>
                    <h3 className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(feeData.totalPending || 0)}</h3>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Collection Rate</p>
                    <h3 className="text-xl font-bold text-blue-600 mt-1">
                      {feeData.collectionRate ? `${feeData.collectionRate.toFixed(1)}%` : '0%'}
                    </h3>
                  </CardContent>
                </Card>
              </div>

              {/* Students Fee Roster */}
              <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-muted/40 font-semibold text-sm">
                  Student Fee Clearance Ledger
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 border-b text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Student</th>
                      <th className="px-4 py-2.5 text-left">Class</th>
                      <th className="px-4 py-2.5 text-right">Fee</th>
                      <th className="px-4 py-2.5 text-right">Paid</th>
                      <th className="px-4 py-2.5 text-right">Due</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {feeData.students?.length > 0 ? (
                      feeData.students.map((st: any, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">
                            {st.name} <span className="text-xs text-muted-foreground">({st.admissionNumber})</span>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{st.className}</td>
                          <td className="px-4 py-2.5 text-right">{formatCurrency(st.totalFee)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatCurrency(st.paidAmount)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-amber-600 font-medium">
                            {formatCurrency(st.dueAmount)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge
                              variant={st.status === 'paid' ? 'default' : st.status === 'partial' ? 'outline' : 'destructive'}
                              className="text-[10px] uppercase font-semibold"
                            >
                              {st.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                          No student fee records found for this selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* 4. Subject Analytics Tab */}
        <TabsContent value="subjects" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Subject-wise Academic Performance</h3>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Subject</th>
                    <th className="px-4 py-3 text-center">Appeared</th>
                    <th className="px-4 py-3 text-center">Absent</th>
                    <th className="px-4 py-3 text-right">Max Marks</th>
                    <th className="px-4 py-3 text-right">Highest</th>
                    <th className="px-4 py-3 text-right">Lowest</th>
                    <th className="px-4 py-3 text-right">Average</th>
                    <th className="px-4 py-3 text-center">Pass %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subjectData.length > 0 ? (
                    subjectData.map((sub: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-semibold">{sub.subjectName}</td>
                        <td className="px-4 py-3 text-center">{sub.appearedCount}</td>
                        <td className="px-4 py-3 text-center text-rose-600 font-medium">{sub.absentCount}</td>
                        <td className="px-4 py-3 text-right">{sub.maxMarks}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{sub.highestMarks}</td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">{sub.lowestMarks}</td>
                        <td className="px-4 py-3 text-right font-medium">{sub.averageMarks?.toFixed(1) || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={sub.passPercentage >= 75 ? 'default' : 'secondary'} className="font-semibold">
                            {sub.passPercentage ? `${sub.passPercentage.toFixed(1)}%` : '0%'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        No marks recorded for this examination yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* 5. Class Merit & Consolidated Results Tab */}
        <TabsContent value="classResults" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Consolidated Class Merit List</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const classParam = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
                handleDownloadCsv(`/exams/reports/class-results/export?examId=${selectedExamId}${classParam}`, `class-merit-list-${selectedExamId}.csv`);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Export Merit CSV
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="rounded-lg border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-center">Rank</th>
                    <th className="px-4 py-3 text-left">Student Info</th>
                    <th className="px-4 py-3 text-left">Class</th>
                    <th className="px-4 py-3 text-right">Marks Obtained</th>
                    <th className="px-4 py-3 text-right">Percentage</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {classResultsData.length > 0 ? (
                    classResultsData.map((res: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold font-mono text-sm ${
                            res.rank === 1 ? 'text-amber-500' : res.rank === 2 ? 'text-slate-400' : res.rank === 3 ? 'text-amber-700' : 'text-muted-foreground'
                          }`}>
                            #{res.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{res.studentName}</p>
                          <p className="text-xs text-muted-foreground">Roll: {res.rollNumber || '—'} • Adm: {res.admissionNumber}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{res.className}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {res.obtainedMarks} / {res.totalMarks}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {res.percentage?.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className="font-bold">{res.grade}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={res.status === 'passed' ? 'default' : 'destructive'} className="text-[10px] uppercase font-bold">
                            {res.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        No results calculated or published for this examination yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
