import { useCallback, useEffect, useState } from 'react';
import {
  Save,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  ArrowRightToLine,
  Lock,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const FEE_TYPES: Record<string, string> = {
  monthly_tuition: 'Monthly Tuition',
  admission_fee: 'Admission Fee',
  other: 'Other Fee',
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface SessionRow {
  _id: string;
  name: string;
  isActive: boolean;
  isArchived: boolean;
}

interface MatrixClass {
  _id: string;
  name: string;
}

interface MatrixResponse {
  classes: MatrixClass[];
  matrix: {
    classId: string;
    className: string;
    amounts: Record<string, number | null>;
    locked: Record<string, boolean>;
  }[];
}

export function FeeSetupPage() {
  const { can } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [feeType, setFeeType] = useState('monthly_tuition');
  
  const [matrixData, setMatrixData] = useState<MatrixResponse['matrix']>([]);
  // Local state for edits
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canEdit = can('fees', 'edit');
  const canCreate = can('fees', 'create');
  const hasAccess = canEdit || canCreate;

  // Load Sessions
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<SessionRow>>('/academic-sessions?limit=50')
      .then((r) => {
        if (mounted && r.data?.data) {
          const valid = r.data.data.filter((s) => !s.isArchived);
          setSessions(valid);
          const active = valid.find((s) => s.isActive);
          if (active) {
            setSessionId(active._id);
          } else if (valid.length > 0) {
            setSessionId(valid[0]._id);
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const loadMatrix = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: MatrixResponse }>(`/fee-structures/matrix?sessionId=${sessionId}&feeType=${feeType}`);
      setMatrixData(res.data.matrix);
      
      const newEdits: Record<string, Record<string, string>> = {};
      res.data.matrix.forEach(row => {
        newEdits[row.classId] = {};
        Object.entries(row.amounts).forEach(([m, amt]) => {
          newEdits[row.classId][m] = amt !== null ? (amt / 100).toString() : '';
        });
      });
      setEdits(newEdits);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId, feeType]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const handleAmountChange = (classId: string, month: string, val: string) => {
    setEdits(prev => ({
      ...prev,
      [classId]: {
        ...prev[classId],
        [month]: val
      }
    }));
  };

  const handleCopyRight = (classId: string, month: string) => {
    const val = edits[classId]?.[month];
    if (val === undefined) return;
    
    const row = matrixData.find(r => r.classId === classId);
    if (!row) return;

    setEdits(prev => {
      const newRow = { ...prev[classId] };
      const startM = parseInt(month, 10);
      for (let m = startM + 1; m <= 12; m++) {
        if (!row.locked[m.toString()]) {
          newRow[m.toString()] = val;
        }
      }
      return { ...prev, [classId]: newRow };
    });
    toast.success(`Copied to remaining months`);
  };

  const handleApplyToAll = (classId: string, val: string) => {
    const row = matrixData.find(r => r.classId === classId);
    if (!row) return;

    setEdits(prev => {
      const newRow = { ...prev[classId] };
      for (let m = 1; m <= 12; m++) {
        if (!row.locked[m.toString()]) {
          newRow[m.toString()] = val;
        }
      }
      return { ...prev, [classId]: newRow };
    });
    toast.success(`Applied to all unlocked months`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const classFees = matrixData.map(row => {
        const amounts: Record<string, number | null> = {};
        Object.keys(edits[row.classId] || {}).forEach(m => {
          const val = edits[row.classId][m];
          amounts[m] = val.trim() ? Math.round(parseFloat(val) * 100) : null;
        });
        return { classId: row.classId, amounts };
      });

      await api.post('/fee-structures/matrix', {
        sessionId,
        feeType,
        classFees
      });
      
      toast.success('Fee matrix saved successfully');
      setConfirmOpen(false);
      loadMatrix();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const isMonthly = feeType === 'monthly_tuition';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Setup"
        description="Configure class-wise fee structures using the unified matrix."
      />
      <FeesNavHeader />

      <div className="flex flex-col sm:flex-row gap-4 items-end bg-card p-4 rounded-xl border">
        <div className="space-y-1.5 flex-1 max-w-[250px]">
          <Label className="text-xs text-muted-foreground">Academic Session</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="h-9">
              <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select Session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name} {s.isActive && '(Active)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 flex-1 max-w-[250px]">
          <Label className="text-xs text-muted-foreground">Fee Type</Label>
          <Select value={feeType} onValueChange={setFeeType}>
            <SelectTrigger className="h-9">
              <Layers className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Fee Type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FEE_TYPES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex-1 flex justify-end">
          {hasAccess && (
            <Button onClick={() => setConfirmOpen(true)} disabled={loading || saving} className="shadow-sm">
              <Save className="mr-2 h-4 w-4" /> Save Changes
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-[400px] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-foreground sticky left-0 bg-card z-10 border-r min-w-[150px]">
                    Class
                  </th>
                  {isMonthly ? (
                    MONTHS.map(m => (
                      <th key={m} className="px-3 py-3 text-center font-medium text-muted-foreground min-w-[120px]">
                        {m}
                      </th>
                    ))
                  ) : (
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount (PKR)</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {matrixData.map(row => (
                  <tr key={row.classId} className="hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium sticky left-0 bg-card z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {row.className}
                      {isMonthly && hasAccess && (
                         <Button
                           variant="ghost"
                           size="sm"
                           title="Apply Jan value to all months"
                           className="h-6 px-2 text-[10px] ml-2 text-primary/70 hover:text-primary"
                           onClick={() => handleApplyToAll(row.classId, edits[row.classId]?.['1'] || '')}
                         >
                           <ArrowRightToLine className="h-3 w-3 mr-1" /> All
                         </Button>
                      )}
                    </td>
                    {isMonthly ? (
                      MONTHS.map((m, i) => {
                        const monthNum = (i + 1).toString();
                        const isLocked = row.locked[monthNum];
                        return (
                          <td key={m} className="px-3 py-2 text-center group relative">
                            <div className="flex items-center justify-center relative">
                              <Input
                                value={edits[row.classId]?.[monthNum] ?? ''}
                                onChange={(e) => handleAmountChange(row.classId, monthNum, e.target.value)}
                                disabled={isLocked || !hasAccess}
                                className={cn(
                                  "w-[85px] h-8 text-center text-sm font-medium transition-colors",
                                  isLocked && "bg-muted/50 text-muted-foreground/50 border-dashed border-muted cursor-not-allowed",
                                  !isLocked && "focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/50 hover:border-primary/30"
                                )}
                                placeholder="0"
                                type="number"
                                min="0"
                              />
                              {isLocked && (
                                <div className="absolute right-3" title="Invoiced (Locked)">
                                  <Lock className="h-3 w-3 text-muted-foreground/40" />
                                </div>
                              )}
                              {!isLocked && hasAccess && i < 11 && (
                                <button
                                  title="Copy to remaining months"
                                  onClick={() => handleCopyRight(row.classId, monthNum)}
                                  className="absolute -right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground rounded-full p-0.5 hover:bg-primary/90 z-20 shadow-sm"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })
                    ) : (
                      <td className="px-4 py-3">
                        <div className="flex items-center relative w-48">
                          <Input
                            value={edits[row.classId]?.['0'] ?? ''}
                            onChange={(e) => handleAmountChange(row.classId, '0', e.target.value)}
                            disabled={row.locked['0'] || !hasAccess}
                            className={cn(
                              "h-9 font-medium",
                              row.locked['0'] && "bg-muted/50 cursor-not-allowed"
                            )}
                            placeholder="Amount in PKR"
                            type="number"
                            min="0"
                          />
                          {row.locked['0'] && (
                            <Lock className="h-4 w-4 text-muted-foreground/40 absolute right-3" />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {matrixData.length === 0 && (
                  <tr>
                    <td colSpan={isMonthly ? 13 : 2} className="px-4 py-8 text-center text-muted-foreground">
                      No classes found for this session.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save Fee Matrix"
        description="Are you sure you want to save these fee changes? Locked months will not be affected."
        confirmText="Save Matrix"
        onConfirm={handleSave}
        loading={saving}
      />
    </div>
  );
}
