import { useEffect, useState } from 'react';
import { CreditCard, Plus, Check, Loader2, Edit3, Landmark, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface PaymentMethod {
  _id: string;
  name: string;
  type: string;
  accountTitle: string;
  accountNumber: string;
  bankName?: string;
  branchCode?: string;
  iban?: string;
  instructions?: string;
  isActive: boolean;
  displayOrder: number;
}

export function PlatformPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMethods = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ success: boolean; data: PaymentMethod[] }>('/platform/payment-methods');
      if (res.data?.success) setMethods(res.data.data);
    } catch (err) {
      toast.error('Failed to load payment methods', { description: apiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const openCreateModal = () => {
    setEditingMethod(null);
    setName('Bank Transfer (Meezan Bank)');
    setType('bank');
    setAccountTitle('SmartSchool SaaS Solutions');
    setAccountNumber('01020304050607');
    setBankName('Meezan Bank Ltd');
    setIban('PK00MEZN0001020304050607');
    setInstructions('Please mention your school name or slug in transfer remarks.');
    setModalOpen(true);
  };

  const openEditModal = (m: PaymentMethod) => {
    setEditingMethod(m);
    setName(m.name);
    setType(m.type);
    setAccountTitle(m.accountTitle);
    setAccountNumber(m.accountNumber);
    setBankName(m.bankName || '');
    setIban(m.iban || '');
    setInstructions(m.instructions || '');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingMethod) {
        await api.put(`/platform/payment-methods/${editingMethod._id}`, {
          name,
          type,
          accountTitle,
          accountNumber,
          bankName,
          iban,
          instructions,
        });
        toast.success('Payment method updated');
      } else {
        await api.post('/platform/payment-methods', {
          name,
          type,
          accountTitle,
          accountNumber,
          bankName,
          iban,
          instructions,
        });
        toast.success('Payment method created');
      }
      setModalOpen(false);
      fetchMethods();
    } catch (err) {
      toast.error('Failed to save payment method', { description: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: PaymentMethod) => {
    try {
      await api.put(`/platform/payment-methods/${m._id}`, {
        isActive: !m.isActive,
      });
      toast.success(`Payment method ${m.isActive ? 'deactivated' : 'activated'}`);
      fetchMethods();
    } catch (err) {
      toast.error('Failed to update status', { description: apiErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Payment Accounts & Methods</h1>
          <p className="text-muted-foreground text-xs mt-1">
            Configure official receiving accounts shown to schools on their billing page.
          </p>
        </div>
        <Button onClick={openCreateModal} size="sm" className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Payment Method
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {methods.map((m) => (
            <Card key={m._id} className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {m.type === 'bank' ? (
                        <Landmark className="w-4 h-4 text-primary" />
                      ) : (
                        <Wallet className="w-4 h-4 text-success" />
                      )}
                      <CardTitle className="text-base font-bold text-foreground">{m.name}</CardTitle>
                    </div>
                    <Badge
                      onClick={() => toggleActive(m)}
                      className={`cursor-pointer text-[10px] ${
                        m.isActive
                          ? 'bg-emerald-500/10 text-success border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {m.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-lg bg-background border border-border space-y-1.5 font-mono">
                    <div>
                      <span className="text-muted-foreground text-[11px] block font-sans">Account Title:</span>
                      <strong className="text-foreground">{m.accountTitle}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px] block font-sans">Account Number:</span>
                      <strong className="text-success select-all">{m.accountNumber}</strong>
                    </div>
                    {m.iban && (
                      <div>
                        <span className="text-muted-foreground text-[11px] block font-sans">IBAN:</span>
                        <span className="text-foreground select-all">{m.iban}</span>
                      </div>
                    )}
                    {m.bankName && (
                      <div>
                        <span className="text-muted-foreground text-[11px] block font-sans">Bank:</span>
                        <span className="text-foreground font-sans">{m.bankName}</span>
                      </div>
                    )}
                  </div>
                  {m.instructions && (
                    <p className="text-[11px] text-muted-foreground pt-1 italic">{m.instructions}</p>
                  )}
                </CardContent>
              </div>
              <CardFooter className="pt-3 border-t border-border flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(m)}
                  className="border-border bg-background text-foreground hover:text-foreground text-xs h-7 px-2.5"
                >
                  <Edit3 className="w-3 h-3 mr-1" /> Edit Account
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 pt-1 text-xs">
            <div className="space-y-1">
              <Label className="text-foreground">Method Display Name *</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bank Transfer (Meezan Bank)"
                className="bg-background border-border text-foreground text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground">Account Type</Label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background text-foreground text-xs px-3 focus:outline-none focus:border-teal-500"
                >
                  <option value="bank">Bank Account</option>
                  <option value="easypaisa">EasyPaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other Wallet</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Bank Name (if applicable)</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground">Account Title *</Label>
                <Input
                  required
                  value={accountTitle}
                  onChange={(e) => setAccountTitle(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Account / Wallet Number *</Label>
                <Input
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-foreground">IBAN Number (Optional)</Label>
              <Input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="PK..."
                className="bg-background border-border text-foreground text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-foreground">Deposit Instructions / Notes for Schools</Label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2 text-foreground text-xs focus:outline-none focus:border-teal-500"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Method'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
