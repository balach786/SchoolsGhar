import { useEffect, useState } from 'react';
import { Layers, Plus, Check, Loader2, Edit3, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface Plan {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
  isActive: boolean;
}

export function PlatformPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(10000);
  const [durationDays, setDurationDays] = useState(30);
  const [featuresText, setFeaturesText] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ success: boolean; data: Plan[] }>('/platform/plans');
      if (res.data?.success) setPlans(res.data.data);
    } catch (err) {
      toast.error('Failed to load plans', { description: apiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setSlug('');
    setDescription('');
    setPrice(15000);
    setDurationDays(30);
    setFeaturesText('Student Management\nAttendance Tracking\nFee Vouchers');
    setModalOpen(true);
  };

  const openEditModal = (p: Plan) => {
    setEditingPlan(p);
    setName(p.name);
    setSlug(p.slug);
    setDescription(p.description);
    setPrice(p.price);
    setDurationDays(p.durationDays);
    setFeaturesText(p.features.join('\n'));
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const features = featuresText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    try {
      if (editingPlan) {
        await api.put(`/platform/plans/${editingPlan._id}`, {
          name,
          slug,
          description,
          price: Number(price),
          durationDays: Number(durationDays),
          features,
        });
        toast.success('Plan updated successfully');
      } else {
        await api.post('/platform/plans', {
          name,
          slug,
          description,
          price: Number(price),
          durationDays: Number(durationDays),
          features,
        });
        toast.success('Plan created successfully');
      }
      setModalOpen(false);
      fetchPlans();
    } catch (err) {
      toast.error('Failed to save plan', { description: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: Plan) => {
    try {
      await api.put(`/platform/plans/${plan._id}`, {
        isActive: !plan.isActive,
      });
      toast.success(`Plan ${plan.isActive ? 'deactivated' : 'activated'}`);
      fetchPlans();
    } catch (err) {
      toast.error('Failed to update plan status', { description: apiErrorMessage(err) });
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    try {
      await api.delete(`/platform/plans/${plan._id}`);
      toast.success('Plan deleted successfully');
      fetchPlans();
    } catch (err) {
      toast.error('Failed to delete plan', { description: apiErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscription Plans</h1>
          <p className="text-muted-foreground text-xs mt-1">
            Configure pricing, subscription duration and included features.
          </p>
        </div>
        <Button onClick={openCreateModal} size="sm" className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create New Plan
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <Card key={p._id} className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold text-foreground">{p.name}</CardTitle>
                    <Badge
                      onClick={() => toggleActive(p)}
                      className={`cursor-pointer text-[10px] ${
                        p.isActive
                          ? 'bg-emerald-500/10 text-success border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground min-h-[32px]">{p.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-2xl font-bold text-foreground">
                      {p.currency} {p.price.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">/ {p.durationDays} days</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  
                  <ul className="space-y-1.5 pt-1 text-foreground">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </div>
              <CardFooter className="pt-3 border-t border-border flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(p)}
                  className="border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 text-xs h-7 px-2.5"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(p)}
                  className="border-border bg-background text-foreground hover:text-foreground text-xs h-7 px-2.5"
                >
                  <Edit3 className="w-3 h-3 mr-1" /> Edit
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Plan Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground">Plan Name *</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Slug *</Label>
                <Input
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-foreground">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background border-border text-foreground text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground">Price (PKR) *</Label>
                <Input
                  type="number"
                  required
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground">Duration (Days) *</Label>
                <Input
                  type="number"
                  required
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
            </div>

            

            <div className="space-y-1">
              <Label className="text-foreground">Features (One per line)</Label>
              <textarea
                rows={4}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
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
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
