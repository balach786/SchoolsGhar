import { useCallback, useEffect, useState } from 'react';
import {
  Settings2,
  Percent,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  Loader2,
  Info,
  ShieldCheck,
  Tag,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FeesNavHeader } from '@/components/finance/FeesNavHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatCurrency, toPaisa, formatStudentIdentity } from '@/lib/format';
import { useFeeSettings, FeeSettingsState } from '@/hooks/useFeeSettings';
import { useAuth } from '@/context/AuthContext';

interface ClassRow {
  _id: string;
  name: string;
}

interface StudentLite {
  _id: string;
  fullName: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  caste?: string | null;
  admissionNumber: string;
  rollNumber?: string;
  className?: string;
}

interface FeeDiscountRow {
  _id: string;
  name: string;
  discountType: 'fixed' | 'percentage';
  value: number; // For fixed: paisa. For percentage: bps.
  valueBps?: number;
  applyTo: 'student' | 'class' | 'all';
  classId?: string;
  studentId?: string;
  isActive: boolean;
  className?: string;
  studentName?: string;
  admissionNumber?: string;
}

export function FeeSettingsPage() {
  const { can } = useAuth();
  const { settings, loading: settingsLoading, refresh: refreshSettings } = useFeeSettings();

  // Local Form State for School Settings
  const [formSettings, setFormSettings] = useState<FeeSettingsState>(settings);
  const [savingSettings, setSavingSettings] = useState(false);

  // Discounts Management
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(true);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<FeeDiscountRow | null>(null);
  const [discountBusy, setDiscountBusy] = useState(false);

  // Classes & Students for discount targeting
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Form fields for discount modal
  const [discName, setDiscName] = useState('');
  const [discType, setDiscType] = useState<'percentage' | 'fixed'>('percentage');
  const [discValueInput, setDiscValueInput] = useState('');
  const [discApplyTo, setDiscApplyTo] = useState<'all' | 'class' | 'student'>('all');
  const [discClassId, setDiscClassId] = useState('');
  const [discStudentId, setDiscStudentId] = useState('');

  const canManage = can('fees', 'edit') || can('fees', 'create');

  // Sync settings when fetched
  useEffect(() => {
    if (settings) {
      setFormSettings(settings);
    }
  }, [settings]);

  // Load Classes
  useEffect(() => {
    let mounted = true;
    api
      .get<ApiListResponse<ClassRow>>('/classes/lookup')
      .then((r) => {
        if (mounted && r.data?.data) {
          setClasses(r.data.data);
          if (r.data.data.length > 0) setDiscClassId(r.data.data[0]._id);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Search Students when targeting student
  useEffect(() => {
    if (discApplyTo !== 'student') return;
    let mounted = true;
    const timeout = setTimeout(() => {
      const q = studentSearch.trim();
      api
        .get<ApiListResponse<StudentLite>>(`/students?limit=25${q ? `&search=${encodeURIComponent(q)}` : ''}`)
        .then((r) => {
          if (mounted && r.data?.data) {
            setStudents(r.data.data);
            if (!discStudentId && r.data.data.length > 0) {
              setDiscStudentId(r.data.data[0]._id);
            }
          }
        })
        .catch(() => {});
    }, 300);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [studentSearch, discApplyTo]);

  // Load Discounts List
  const loadDiscounts = useCallback(async () => {
    setDiscountsLoading(true);
    try {
      const res = await api.get<ApiListResponse<FeeDiscountRow>>('/fee-discounts');
      setDiscounts(res.data.data);
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDiscountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  // Save School Settings Handler
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.patch('/fee-settings', {
        dueDate: formSettings.dueDate,
        lateFee: formSettings.lateFee,
        otherFee: formSettings.otherFee,
        discount: formSettings.discount,
        admissionFee: formSettings.admissionFee,
      });

      toast.success('Fee settings saved successfully! Historical invoices remain immutable.');
      refreshSettings();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  }

  // Open Create / Edit Discount Modal
  function openCreateDiscount() {
    setEditingDiscount(null);
    setDiscName('');
    setDiscType('percentage');
    setDiscValueInput('10');
    setDiscApplyTo('all');
    setDiscClassId(classes[0]?._id || '');
    setDiscStudentId('');
    setDiscountModalOpen(true);
  }

  function openEditDiscount(d: FeeDiscountRow) {
    setEditingDiscount(d);
    setDiscName(d.name);
    setDiscType(d.discountType);
    setDiscValueInput(
      d.discountType === 'percentage'
        ? String((d.valueBps || d.value) / 100)
        : String(d.value / 100)
    );
    setDiscApplyTo(d.applyTo);
    setDiscClassId(d.classId || (classes[0]?._id ?? ''));
    setDiscStudentId(d.studentId || '');
    setDiscountModalOpen(true);
  }

  // Save Discount Handler
  async function handleSaveDiscount(e: React.FormEvent) {
    e.preventDefault();
    if (!discName.trim()) {
      toast.error('Discount name is required');
      return;
    }

    const numericVal = parseFloat(discValueInput);
    if (isNaN(numericVal) || numericVal <= 0) {
      toast.error('Please enter a valid positive discount value');
      return;
    }

    let value: number;
    let valueBps: number | undefined;

    if (discType === 'percentage') {
      if (numericVal > 100) {
        toast.error('Percentage discount cannot exceed 100%');
        return;
      }
      valueBps = Math.round(numericVal * 100); // 10% -> 1000 bps
      value = valueBps;
    } else {
      value = toPaisa(numericVal);
    }

    setDiscountBusy(true);
    try {
      const payload: Record<string, any> = {
        name: discName.trim(),
        discountType: discType,
        value,
        applyTo: discApplyTo,
        classId: discApplyTo === 'class' ? discClassId : undefined,
        studentId: discApplyTo === 'student' ? discStudentId : undefined,
      };

      if (editingDiscount) {
        await api.patch(`/fee-discounts/${editingDiscount._id}`, payload);
        toast.success('Discount rule updated successfully');
      } else {
        await api.post('/fee-discounts', payload);
        toast.success('Discount rule created successfully');
      }
      setDiscountModalOpen(false);
      loadDiscounts();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDiscountBusy(false);
    }
  }

  // Delete Discount Handler
  async function handleDeleteDiscount(id: string) {
    if (!confirm('Are you sure you want to delete this discount rule?')) return;
    try {
      await api.delete(`/fee-discounts/${id}`);
      toast.success('Discount deleted');
      loadDiscounts();
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Fee Settings & Rules"
        description="Configure school financial rules (due date, late fees, other fees, admission rules) and multi-tier discounts"
      />

      <FeesNavHeader activeTab="settings" />

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-10">
          <TabsTrigger value="settings" className="text-xs font-semibold gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            School Financial Rules
          </TabsTrigger>
          <TabsTrigger value="discounts" className="text-xs font-semibold gap-1.5">
            <Percent className="h-3.5 w-3.5" />
            Discount Rules Ledger
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: SCHOOL FINANCIAL RULES ── */}
        <TabsContent value="settings" className="space-y-8">
          <form onSubmit={handleSaveSettings} className="space-y-8">
            
            {/* Section: Invoice Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground border-b border-border/40 pb-2">Invoice Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Due Date Setting */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Monthly Due Date Rule
                    </CardTitle>
                    <Switch
                      checked={formSettings.dueDate.enabled}
                      onCheckedChange={(checked) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          dueDate: { ...prev.dueDate, enabled: checked },
                        }))
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <CardDescription className="text-xs">
                    Assigns automatic due date on newly generated monthly invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default Monthly Due Day</Label>
                    <Input
                      type="number"
                      min="1"
                      max="28"
                      value={formSettings.dueDate.defaultMonthlyDueDay}
                      disabled={!formSettings.dueDate.enabled || !canManage}
                      onChange={(e) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          dueDate: {
                            ...prev.dueDate,
                            defaultMonthlyDueDay: Number(e.target.value) || 10,
                          },
                        }))
                      }
                      className="h-9 text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      e.g. 10th of every month. Invoices will record this date as an immutable snapshot.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Late Fee Assessment */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-600" />
                      Late Fee & Grace Period
                    </CardTitle>
                    <Switch
                      checked={formSettings.lateFee.enabled}
                      onCheckedChange={(checked) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          lateFee: { ...prev.lateFee, enabled: checked },
                        }))
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <CardDescription className="text-xs">
                    Fine assessed on overdue invoices after grace period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fine Amount (PKR)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formSettings.lateFee.lateFeeAmount / 100}
                        disabled={!formSettings.lateFee.enabled || !canManage}
                        onChange={(e) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            lateFee: {
                              ...prev.lateFee,
                              lateFeeAmount: toPaisa(e.target.value),
                            },
                          }))
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Grace Period (Days)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formSettings.lateFee.gracePeriodDays}
                        disabled={!formSettings.lateFee.enabled || !canManage}
                        onChange={(e) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            lateFee: {
                              ...prev.lateFee,
                              gracePeriodDays: Number(e.target.value) || 0,
                            },
                          }))
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Late fees are assessed atomically once past grace days and permanently snapshotted.
                  </p>
                </CardContent>
              </Card>
              </div>
            </div>
            
            {/* Section: Additional Charges */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground border-b border-border/40 pb-2">Additional Charges</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Other Fee Setting */}
                <Card className="border-border/70 shadow-xs">
                  <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Tag className="h-4 w-4 text-emerald-600" />
                      Other Auxiliary Fee
                    </CardTitle>
                    <Switch
                      checked={formSettings.otherFee.enabled}
                      onCheckedChange={(checked) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          otherFee: { ...prev.otherFee, enabled: checked },
                        }))
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <CardDescription className="text-xs">
                    Custom charge attached automatically to monthly invoices (e.g. Lab, Sports, Activity).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fee Label / Name</Label>
                      <Input
                        value={formSettings.otherFee.feeName}
                        disabled={!formSettings.otherFee.enabled || !canManage}
                        onChange={(e) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            otherFee: { ...prev.otherFee, feeName: e.target.value },
                          }))
                        }
                        placeholder="e.g. Lab & Sports Charge"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Default Amount (PKR)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formSettings.otherFee.defaultAmount / 100}
                        disabled={!formSettings.otherFee.enabled || !canManage}
                        onChange={(e) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            otherFee: {
                              ...prev.otherFee,
                              defaultAmount: toPaisa(e.target.value),
                            },
                          }))
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
                </Card>

                {/* Admission Fee & Re-Admission Control */}
                <Card className="border-border/70 shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                        Admission Fee Control
                      </CardTitle>
                      <Switch
                        checked={formSettings.admissionFee.enabled}
                        onCheckedChange={(checked) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            admissionFee: { ...prev.admissionFee, enabled: checked },
                          }))
                        }
                        disabled={!canManage}
                      />
                    </div>
                    <CardDescription className="text-xs">
                      Enforces backend database-backed admission fee eligibility.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-1">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border/70">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-semibold">Allow Re-Admission Fee</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Requires an explicit StudentHistory re-admission event.
                        </p>
                      </div>
                      <Switch
                        checked={formSettings.admissionFee.allowReAdmission}
                        disabled={!formSettings.admissionFee.enabled || !canManage}
                        onCheckedChange={(checked) =>
                          setFormSettings((prev) => ({
                            ...prev,
                            admissionFee: {
                              ...prev.admissionFee,
                              allowReAdmission: checked,
                            },
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Section: Discount Policy */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground border-b border-border/40 pb-2">Discount Policy</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Discounts & Anti-Stacking */}
                <Card className="border-border/70 shadow-xs md:col-span-2">
                  <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Percent className="h-4 w-4 text-amber-500" />
                      Discounts & Anti-Stacking
                    </CardTitle>
                    <Switch
                      checked={formSettings.discount.enabled}
                      onCheckedChange={(checked) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          discount: { ...prev.discount, enabled: checked },
                        }))
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <CardDescription className="text-xs">
                    Enforces strict 3-tier discount priority: Student &gt; Class &gt; All Students.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border/70">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold">Allow Discount Stacking</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Default: False. If disabled, only the highest-priority single discount applies.
                      </p>
                    </div>
                    <Switch
                      checked={formSettings.discount.allowDiscountStacking}
                      disabled={!formSettings.discount.enabled || !canManage}
                      onCheckedChange={(checked) =>
                        setFormSettings((prev) => ({
                          ...prev,
                          discount: {
                            ...prev.discount,
                            allowDiscountStacking: checked,
                          },
                        }))
                      }
                    />
                  </div>
                </CardContent>
                </Card>
              </div>
            </div>

            {canManage && (
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={savingSettings}
                  className="gap-2 bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white shadow-sm"
                >
                  {savingSettings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save All School Financial Settings
                </Button>
              </div>
            )}
          </form>
        </TabsContent>

        {/* ── TAB 2: DISCOUNT RULES LEDGER ── */}
        <TabsContent value="discounts" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                <strong>3-Tier Priority System:</strong> Student-Specific (Priority 1) &gt; Class-Specific (Priority 2) &gt; All Students (Priority 3).
                Percentage discounts use basis points (1% = 100 bps) with integer precision.
              </span>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={openCreateDiscount}
                className="gap-1.5 bg-primary text-primary-foreground text-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Discount Rule
              </Button>
            )}
          </div>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border/60 text-muted-foreground uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Discount Name</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Value</th>
                      <th className="px-4 py-3 font-semibold">Applied To</th>
                      <th className="px-4 py-3 font-semibold">Priority</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {discounts.length > 0 ? (
                      discounts.map((d) => {
                        const isPerc = d.discountType === 'percentage';
                        const bps = d.valueBps || d.value;
                        return (
                          <tr key={d._id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-semibold text-foreground">{d.name}</td>
                            <td className="px-4 py-3 capitalize">{d.discountType}</td>
                            <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">
                              {isPerc ? `${(bps / 100).toFixed(2)}% (${bps} bps)` : formatCurrency(d.value)}
                            </td>
                            <td className="px-4 py-3">
                              {d.applyTo === 'all' && (
                                <Badge variant="secondary" className="text-[10px]">
                                  All Students
                                </Badge>
                              )}
                              {d.applyTo === 'class' && (
                                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                                  Class: {d.className || d.classId}
                                </Badge>
                              )}
                              {d.applyTo === 'student' && (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                                  Student: {d.studentName || d.studentId}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={
                                  d.applyTo === 'student'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                                    : d.applyTo === 'class'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                                }
                              >
                                {d.applyTo === 'student' ? 'P1 (Highest)' : d.applyTo === 'class' ? 'P2 (Class)' : 'P3 (Global)'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={d.isActive ? 'default' : 'secondary'}
                                className={d.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]' : 'text-[10px]'}
                              >
                                {d.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {canManage && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDiscount(d)}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteDiscount(d._id)}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          {discountsLoading ? 'Loading discount rules...' : 'No discount rules defined. Click "Add Discount Rule" to create one.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Discount Modal */}
      <Dialog open={discountModalOpen} onOpenChange={setDiscountModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveDiscount} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {editingDiscount ? 'Edit Discount Rule' : 'Create Discount Rule'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Discounts automatically apply to monthly invoices based on priority (Student &gt; Class &gt; All).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs">Discount Rule Name</Label>
                <Input
                  required
                  placeholder="e.g. Sibling Concession, Merit Scholarship"
                  value={discName}
                  onChange={(e) => setDiscName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount Type</Label>
                  <Select value={discType} onValueChange={(v: any) => setDiscType(v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (PKR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {discType === 'percentage' ? 'Percentage Rate (%)' : 'Amount (PKR)'}
                  </Label>
                  <Input
                    type="number"
                    step={discType === 'percentage' ? '0.1' : '1'}
                    min="0.01"
                    max={discType === 'percentage' ? '100' : '1000000'}
                    required
                    placeholder={discType === 'percentage' ? 'e.g. 10' : 'e.g. 1000'}
                    value={discValueInput}
                    onChange={(e) => setDiscValueInput(e.target.value)}
                    className="h-9 text-xs"
                  />
                  {discType === 'percentage' && discValueInput && (
                    <p className="text-[10px] text-muted-foreground">
                      Stored as {Math.round(parseFloat(discValueInput || '0') * 100)} basis points
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Target Audience</Label>
                <Select value={discApplyTo} onValueChange={(v: any) => setDiscApplyTo(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Students (Priority 3 - Global)</SelectItem>
                    <SelectItem value="class">Specific Class (Priority 2)</SelectItem>
                    <SelectItem value="student">Specific Student (Priority 1 - Top)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {discApplyTo === 'class' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Target Class</Label>
                  <Select value={discClassId} onValueChange={setDiscClassId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {discApplyTo === 'student' && (
                <div className="space-y-2">
                  <Label className="text-xs">Search & Select Student</Label>
                  <Input
                    placeholder="Type student name or admission number..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Select value={discStudentId} onValueChange={setDiscStudentId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select student from results" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {formatStudentIdentity(s as any)} ({s.admissionNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDiscountModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={discountBusy} className="gap-1.5">
                {discountBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingDiscount ? 'Update Rule' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
