import { useCallback, useEffect, useState, useMemo } from 'react';
import { Users, Loader2, RefreshCw, Download, Edit } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface ExamOption {
  _id: string;
  name: string;
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
  admissionNumber: string;
  examRollNumber?: number;
  className?: string;
  block?: string;
}

interface SeatingBlock {
  name: string;
  occupiedSeats: number;
  rollStart: number | null;
  rollEnd: number | null;
  classes: string[];
}

export function SeatingPlanPage() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  const [students, setStudents] = useState<StudentEligibility[]>([]);
  const [loading, setLoading] = useState(false);

  // Manage Seating Plan dialog
  const [seatingPlanModalOpen, setSeatingPlanModalOpen] = useState(false);
  const [seatingPlanLoading, setSeatingPlanLoading] = useState(false);
  const [seatingPlanBlock, setSeatingPlanBlock] = useState('');
  const [seatingPlanSelectedIds, setSeatingPlanSelectedIds] = useState<Set<string>>(new Set());
  const [seatingPlanOriginalBlock, setSeatingPlanOriginalBlock] = useState<string | null>(null);
  const [seatingPlanRangeStart, setSeatingPlanRangeStart] = useState('');
  const [seatingPlanRangeEnd, setSeatingPlanRangeEnd] = useState('');

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
          cards: StudentEligibility[];
        } | StudentEligibility[];
      }>(url);
      
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

  const openEditBlock = (block: SeatingBlock) => {
    const studentIdsInBlock = students
      .filter(s => s.block === block.name)
      .map(s => s.studentId || s.student?._id)
      .filter(Boolean) as string[];
      
    setSeatingPlanBlock(block.name);
    setSeatingPlanOriginalBlock(block.name);
    setSeatingPlanSelectedIds(new Set(studentIdsInBlock));
    setSeatingPlanRangeStart(block.rollStart ? String(block.rollStart) : '');
    setSeatingPlanRangeEnd(block.rollEnd ? String(block.rollEnd) : '');
    setSeatingPlanModalOpen(true);
  };

  const handleAssignSeatingPlan = async () => {
    if (!selectedExamId) return;
    if (!seatingPlanBlock.trim()) {
      toast.error('Block/Room name is required.');
      return;
    }
    if (seatingPlanSelectedIds.size === 0) {
      toast.error('Please select at least one student to assign.');
      return;
    }

    setSeatingPlanLoading(true);
    try {
      const res = await api.post<{ message: string }>('/exams/seating-plan/assign', {
        examId: selectedExamId,
        block: seatingPlanBlock.trim(),
        originalBlock: seatingPlanOriginalBlock,
        studentIds: Array.from(seatingPlanSelectedIds),
      });
      toast.success(res.data?.message || 'Seating plan updated successfully');
      setSeatingPlanModalOpen(false);
      setSeatingPlanBlock('');
      setSeatingPlanOriginalBlock(null);
      setSeatingPlanSelectedIds(new Set());
      await loadEligibility();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSeatingPlanLoading(false);
    }
  };

  const seatingBlocks = useMemo(() => {
    const blocksMap = new Map<string, SeatingBlock>();
    
    students.forEach(s => {
      const blockName = s.block;
      if (blockName && blockName !== 'Unassigned') {
        if (!blocksMap.has(blockName)) {
          blocksMap.set(blockName, {
            name: blockName,
            occupiedSeats: 0,
            rollStart: null,
            rollEnd: null,
            classes: [],
          });
        }
        
        const b = blocksMap.get(blockName)!;
        b.occupiedSeats += 1;
        
        if (s.className && !b.classes.includes(s.className)) {
          b.classes.push(s.className);
        }
        
        if (s.examRollNumber != null) {
          const roll = Number(s.examRollNumber);
          if (!isNaN(roll)) {
            if (b.rollStart === null || roll < b.rollStart) b.rollStart = roll;
            if (b.rollEnd === null || roll > b.rollEnd) b.rollEnd = roll;
          }
        }
      }
    });
    
    return Array.from(blocksMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const handleExportCSV = () => {
    if (seatingBlocks.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Examination', 'Block / Room', 'Classes', 'Occupied Seats', 'Start Roll No.', 'End Roll No.'];
    const examName = exams.find(e => e._id === selectedExamId)?.name || 'Unknown Exam';
    
    const rows = seatingBlocks.map(b => [
      `"${examName}"`,
      `"${b.name}"`,
      `"${b.classes.length > 0 ? b.classes.join(', ') : 'Mixed'}"`,
      b.occupiedSeats,
      b.rollStart ?? '',
      b.rollEnd ?? ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `seating_plan_${examName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seating Plan"
        description="View and manage examination seating blocks and arrangements."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={loading || seatingBlocks.length === 0}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSeatingPlanBlock('');
                setSeatingPlanOriginalBlock(null);
                setSeatingPlanSelectedIds(new Set());
                setSeatingPlanRangeStart('');
                setSeatingPlanRangeEnd('');
                setSeatingPlanModalOpen(true);
              }}
              className="text-primary hover:text-primary hover:bg-primary/10"
              disabled={loading || exams.length === 0}
            >
              <Users className="mr-2 h-4 w-4 text-primary" /> Manage Seating Plan
            </Button>
            <Button variant="ghost" size="icon" onClick={loadEligibility} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Selectors */}
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
        </div>
      </div>

      {/* Seating Blocks Grid */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          Loading seating plan...
        </div>
      ) : seatingBlocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-12 text-center bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm/40">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-semibold text-foreground">No Seating Blocks Found</h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            There are no assigned seating blocks for the selected criteria.
          </p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-muted/50 z-10 whitespace-nowrap">Block / Room</th>
                  <th className="px-4 py-3 text-left font-semibold">Classes</th>
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Occupied Seats</th>
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Start Roll No.</th>
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">End Roll No.</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {seatingBlocks.map((block) => (
                  <tr key={block.name} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium sticky left-0 bg-card z-10 whitespace-nowrap border-r sm:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] sm:shadow-none">{block.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{block.classes.length > 0 ? block.classes.join(', ') : 'Mixed'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-primary">{block.occupiedSeats}</td>
                    <td className="px-4 py-3 text-center font-mono">{block.rollStart ?? '-'}</td>
                    <td className="px-4 py-3 text-center font-mono">{block.rollEnd ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEditBlock(block)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manage Seating Plan Modal */}
      <Dialog open={seatingPlanModalOpen} onOpenChange={setSeatingPlanModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Seating Plan</DialogTitle>
            <DialogDescription>
              Assign students with generated Exam Roll Numbers to a Block/Room. Select students and enter the Block name.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div>
              <Label htmlFor="assignBlock" className="text-sm font-medium">Block / Room Name *</Label>
              <Input
                id="assignBlock"
                className="mt-1 max-w-sm"
                value={seatingPlanBlock}
                onChange={(e) => setSeatingPlanBlock(e.target.value)}
                placeholder="e.g. Hall A, Room 101"
              />
            </div>
            
            <div className="border rounded-md">
              <div className="bg-muted p-2 flex justify-between items-center text-sm">
                <span className="font-medium text-muted-foreground">{seatingPlanSelectedIds.size} selected</span>
                <div className="flex gap-2 items-center">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const allEligible = students
                        .filter(s => s.examRollNumber != null)
                        .map(s => s.studentId || s.student?._id);
                      if (seatingPlanSelectedIds.size === allEligible.length && allEligible.length > 0) {
                        setSeatingPlanSelectedIds(new Set());
                      } else {
                        setSeatingPlanSelectedIds(new Set(allEligible));
                      }
                    }}
                  >
                    {seatingPlanSelectedIds.size > 0 ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              </div>

              {/* Range Selection */}
              <div className="bg-muted/50 p-2 border-b flex items-end gap-3 text-sm">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Start Roll No</Label>
                  <Input 
                    type="number" 
                    className="h-7 w-24 text-xs" 
                    placeholder="e.g. 1000"
                    value={seatingPlanRangeStart}
                    onChange={(e) => setSeatingPlanRangeStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">End Roll No</Label>
                  <Input 
                    type="number" 
                    className="h-7 w-24 text-xs" 
                    placeholder="e.g. 1020"
                    value={seatingPlanRangeEnd}
                    onChange={(e) => setSeatingPlanRangeEnd(e.target.value)}
                  />
                </div>
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="h-7 text-xs"
                  onClick={() => {
                    const start = parseInt(seatingPlanRangeStart, 10);
                    const end = parseInt(seatingPlanRangeEnd, 10);
                    if (isNaN(start) || isNaN(end) || start > end) {
                      toast.error("Please enter a valid roll number range");
                      return;
                    }
                    const rangeIds = students
                      .filter(s => s.examRollNumber != null && s.examRollNumber >= start && s.examRollNumber <= end)
                      .map(s => s.studentId || s.student?._id);
                    
                    if (rangeIds.length === 0) {
                      toast.info("No students found in that range");
                      return;
                    }
                    
                    const newSet = new Set(seatingPlanSelectedIds);
                    rangeIds.forEach(id => newSet.add(id));
                    setSeatingPlanSelectedIds(newSet);
                    toast.success(`Selected ${rangeIds.length} students in range`);
                  }}
                >
                  Select Range
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-10"></th>
                      <th className="px-3 py-2 text-left">Exam Roll No</th>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Current Block</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.filter(s => s.examRollNumber != null).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          No students have Exam Roll Numbers generated yet.
                        </td>
                      </tr>
                    ) : (
                      students
                        .filter(s => s.examRollNumber != null)
                        .map(item => {
                          const sid = item.studentId || item.student?._id;
                          return (
                            <tr key={sid} className="hover:bg-muted/50 cursor-pointer" onClick={() => {
                              const newSet = new Set(seatingPlanSelectedIds);
                              if (newSet.has(sid)) newSet.delete(sid);
                              else newSet.add(sid);
                              setSeatingPlanSelectedIds(newSet);
                            }}>
                              <td className="px-3 py-2 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={seatingPlanSelectedIds.has(sid)}
                                  readOnly
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono font-medium">{item.examRollNumber}</td>
                              <td className="px-3 py-2">
                                {item.fullName} 
                                <span className="text-xs text-muted-foreground ml-2">({item.className})</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {item.block === 'Unassigned' ? 'Unassigned' : item.block || 'Unassigned'}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setSeatingPlanModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignSeatingPlan} disabled={seatingPlanLoading || seatingPlanSelectedIds.size === 0}>
              {seatingPlanLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign Selected ({seatingPlanSelectedIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
