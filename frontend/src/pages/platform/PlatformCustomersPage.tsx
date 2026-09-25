import { useEffect, useState } from 'react';
import {
  Building2,
  Search,
  Filter,
  MoreVertical,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage } from '@/lib/api';

interface CustomerItem {
  _id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  country: string;
  status: 'trial' | 'active' | 'expired' | 'suspended';
  subscriptionStatus: string;
  daysRemaining: number;
  isExpired: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  trialEndsAt: string;
  subscriptionEndsAt?: string;
  ownerName: string;
  ownerEmail: string;
  planName: string;
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletionStatus?: 'NONE' | 'SOFT_DELETED' | 'DELETION_IN_PROGRESS' | 'DATABASE_DELETED_CLEANUP_PENDING' | 'HARD_DELETED';
}

export function PlatformCustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Extend Modal State
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [extensionDays, setExtensionDays] = useState(30);
  const [extensionReason, setExtensionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Suspend Modal State
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Change Code Modal State
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [newSchoolCode, setNewSchoolCode] = useState('');

  // Soft Delete Modal State
  const [softDeleteModalOpen, setSoftDeleteModalOpen] = useState(false);
  const [softDeleteReason, setSoftDeleteReason] = useState('');

  // Hard Delete Modal State
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [hardDeleteCode, setHardDeleteCode] = useState('');

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '20');
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get<{
        success: boolean;
        data: CustomerItem[];
        pagination: { totalPages: number };
      }>(`/platform/customers?${params.toString()}`);

      if (res.data?.success) {
        setCustomers(res.data.data);
        if (res.data.pagination?.totalPages) {
          setTotalPages(res.data.pagination.totalPages);
        }
      }
    } catch (err) {
      toast.error('Failed to load customers', { description: apiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/customers/${selectedCustomer._id}/extend`, {
        days: Number(extensionDays),
        reason: extensionReason.trim() || 'Manual Platform Admin extension',
      });

      if (res.data?.success) {
        toast.success(`Extended ${selectedCustomer.name}`, {
          description: `Added ${extensionDays} days to subscription balance.`,
        });
        setExtendModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      toast.error('Failed to extend subscription', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendToggle = async () => {
    if (!selectedCustomer) return;

    setActionLoading(true);
    try {
      if (selectedCustomer.isSuspended) {
        // Unsuspend
        const res = await api.post(`/platform/customers/${selectedCustomer._id}/unsuspend`);
        if (res.data?.success) {
          toast.success(`Unsuspended ${selectedCustomer.name}`, {
            description: 'School workspace access has been fully restored.',
          });
        }
      } else {
        // Suspend
        const res = await api.post(`/platform/customers/${selectedCustomer._id}/suspend`, {
          reason: suspendReason.trim() || 'Suspended by platform administration',
        });
        if (res.data?.success) {
          toast.success(`Suspended ${selectedCustomer.name}`, {
            description: 'Access to this school tenant has been locked.',
          });
        }
      }
      setSuspendModalOpen(false);
      fetchCustomers();
    } catch (err) {
      toast.error('Action failed', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/customers/${selectedCustomer._id}/change-code`, {
        newSchoolCode: newSchoolCode.trim(),
      });

      if (res.data?.success) {
        toast.success(`School Code updated for ${selectedCustomer.name}`);
        setCodeModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      toast.error('Failed to change school code', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/customers/${selectedCustomer._id}/soft-delete`, {
        reason: softDeleteReason.trim() || 'Platform Admin scheduled deletion',
      });

      if (res.data?.success) {
        toast.success('Deletion Scheduled', { description: 'The school has been scheduled for permanent deletion.' });
        setSoftDeleteModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      toast.error('Failed to schedule deletion', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setActionLoading(true);
    try {
      const res = await api.post(`/platform/customers/${selectedCustomer._id}/hard-delete`, {
        confirmationCode: hardDeleteCode.trim(),
      });

      if (res.data?.success) {
        toast.success('Permanently Deleted', { description: 'The tenant database has been permanently deleted.' });
        setHardDeleteModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      toast.error('Permanent deletion failed', { description: apiErrorMessage(err) });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Schools & Tenants</h1>
          <p className="text-muted-foreground text-xs mt-1">
            Overview of all customer school accounts, active tiers, subscription dates, and access controls.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search school name, slug, owner email, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground text-xs h-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background text-foreground text-xs px-3 focus:outline-none focus:border-teal-500"
            >
              <option value="">All Statuses</option>
              <option value="trial">Active Trial</option>
              <option value="active">Active Paid</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
            </select>

            <Button type="submit" size="sm" className="h-9 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold">
              Filter
            </Button>
          </div>
        </form>
      </Card>

      {/* Customers Table */}
      <Card className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : customers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No school accounts matched the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border bg-background text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">School Name</th>
                    <th className="px-4 py-3">Administrator</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Time Left</th>
                    <th className="px-4 py-3">Expiry / End Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {customers.map((c) => (
                    <tr key={c._id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground text-sm">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">/{c.slug} • {c.city}, {c.country}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{c.ownerName}</div>
                        <div className="text-[11px] text-muted-foreground">{c.contactEmail}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.deletionStatus === 'DELETION_IN_PROGRESS' ? (
                          <Badge className="bg-red-900/20 text-red-600 border-red-500/30 text-[10px]">
                            Deleting...
                          </Badge>
                        ) : c.deletionStatus === 'DATABASE_DELETED_CLEANUP_PENDING' ? (
                          <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 text-[10px]">
                            Cleanup Pending
                          </Badge>
                        ) : c.isDeleted ? (
                          <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30 text-[10px]">
                            Deletion Scheduled
                          </Badge>
                        ) : c.isSuspended ? (
                          <Badge className="bg-red-500/20 text-destructive border-red-500/30 text-[10px]">
                            Suspended
                          </Badge>
                        ) : c.isExpired ? (
                          <Badge className="bg-rose-500/10 text-destructive border-rose-500/20 text-[10px]">
                            Expired
                          </Badge>
                        ) : c.status === 'trial' ? (
                          <Badge className="bg-teal-500/10 text-primary border-teal-500/20 text-[10px]">
                            7-Day Trial
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/10 text-success border-emerald-500/20 text-[10px]">
                            Active Paid
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {c.planName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.isExpired ? (
                          <span className="text-destructive font-semibold">0 days (Lapsed)</span>
                        ) : (
                          <span className="text-foreground font-medium">{c.daysRemaining} days</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {c.isDeleted ? (
                          <span className="text-purple-600 font-semibold">Scheduled: {c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : 'N/A'}</span>
                        ) : c.subscriptionEndsAt ? (
                          new Date(c.subscriptionEndsAt).toLocaleDateString()
                        ) : (
                          new Date(c.trialEndsAt).toLocaleDateString()
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        {!c.isDeleted && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setExtensionDays(30);
                                setExtensionReason('');
                                setExtendModalOpen(true);
                              }}
                              className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground hover:text-foreground text-[11px] h-7 px-2.5"
                            >
                              <Clock className="w-3 h-3 mr-1 text-primary" />
                              Extend
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setNewSchoolCode(c.slug);
                                setCodeModalOpen(true);
                              }}
                              className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground hover:text-foreground text-[11px] h-7 px-2.5"
                            >
                              <Building2 className="w-3 h-3 mr-1 text-primary" />
                              Change Code
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setSuspendReason(c.suspensionReason || '');
                                setSuspendModalOpen(true);
                              }}
                              className={`border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-[11px] h-7 px-2.5 ${
                                c.isSuspended
                                  ? 'text-success hover:bg-emerald-950/30'
                                  : 'text-destructive hover:bg-rose-950/30'
                              }`}
                            >
                              {c.isSuspended ? (
                                <>
                                  <ShieldCheck className="w-3 h-3 mr-1" /> Unsuspend
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-3 h-3 mr-1" /> Suspend
                                </>
                              )}
                            </Button>

                            {c.isSuspended && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedCustomer(c);
                                  setSoftDeleteReason('');
                                  setSoftDeleteModalOpen(true);
                                }}
                                className="border-border bg-rose-50 hover:bg-rose-100 text-destructive text-[11px] h-7 px-2.5"
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Schedule Deletion
                              </Button>
                            )}
                          </>
                        )}

                        {c.isDeleted && (
                          <>
                            <Button variant="outline" size="sm" disabled className="opacity-50 text-[11px] h-7 px-2.5">
                              <ShieldCheck className="w-3 h-3 mr-1" /> Unsuspend
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(c);
                                setHardDeleteCode('');
                                setHardDeleteModalOpen(true);
                              }}
                              disabled={
                                c.deletionStatus !== 'SOFT_DELETED' && c.deletionStatus !== 'DATABASE_DELETED_CLEANUP_PENDING'
                                  ? true
                                  : Boolean(c.deletedAt && Date.now() - new Date(c.deletedAt).getTime() < 7 * 24 * 60 * 60 * 1000)
                              }
                              className="border-border bg-red-600 hover:bg-red-700 text-white hover:text-white text-[11px] h-7 px-2.5 disabled:opacity-50 disabled:bg-red-900"
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Permanently Delete
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Extension Dialog */}
      <Dialog open={extendModalOpen} onOpenChange={setExtendModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Extend Subscription — {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Grant additional active days to this school's balance without changing their current plan.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExtend} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Days to Add</Label>
              <Input
                type="number"
                min="1"
                max="365"
                required
                value={extensionDays}
                onChange={(e) => setExtensionDays(Number(e.target.value))}
                className="bg-background border-border text-foreground text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Administrative Reason (Logged)</Label>
              <Input
                type="text"
                placeholder="e.g. Courtesy trial extension, annual promotional grant"
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
                className="bg-background border-border text-foreground text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setExtendModalOpen(false)}
                className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Extension'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Suspend / Unsuspend Dialog */}
      <Dialog open={suspendModalOpen} onOpenChange={setSuspendModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              {selectedCustomer?.isSuspended ? 'Unsuspend Account' : 'Suspend Account'} — {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selectedCustomer?.isSuspended
                ? 'Restore normal administrative operations and portal logins for all staff and students.'
                : 'Suspension immediately restricts staff logins and shows an account suspension banner.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {!selectedCustomer?.isSuspended && (
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Reason for Suspension</Label>
                <Input
                  type="text"
                  placeholder="e.g. Pending invoice settlement, terms violation"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSuspendModalOpen(false)}
                className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSuspendToggle}
                disabled={actionLoading}
                className={`text-xs font-semibold ${
                  selectedCustomer?.isSuspended
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : selectedCustomer?.isSuspended ? (
                  'Confirm Unsuspend'
                ) : (
                  'Confirm Suspend'
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Code Dialog */}
      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Change School Code
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update the unique login identifier (slug) for this school. Existing users will need to use this new code to log in.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChangeCode} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Current School Code</Label>
              <Input
                disabled
                value={selectedCustomer?.slug || ''}
                className="bg-background border-border text-xs h-9 text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">New School Code <span className="text-destructive">*</span></Label>
              <Input
                required
                placeholder="e.g. my-school-new"
                value={newSchoolCode}
                onChange={(e) => setNewSchoolCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="bg-background border-border text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCodeModalOpen(false)}
                disabled={actionLoading}
                className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading || !newSchoolCode || newSchoolCode === selectedCustomer?.slug}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change Code'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Modal */}
      <Dialog open={softDeleteModalOpen} onOpenChange={setSoftDeleteModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Schedule Deletion — {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This will schedule the school for permanent deletion. The school will remain inaccessible and its data will be retained during the 7-day waiting period.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSoftDelete} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Reason (Logged)</Label>
              <Input
                type="text"
                placeholder="e.g. Non-payment, Customer Request"
                value={softDeleteReason}
                onChange={(e) => setSoftDeleteReason(e.target.value)}
                className="bg-background border-border text-foreground text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSoftDeleteModalOpen(false)} className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-red-600 hover:bg-red-500 text-white text-xs">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Modal */}
      <Dialog open={hardDeleteModalOpen} onOpenChange={setHardDeleteModalOpen}>
        <DialogContent className="bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Permanently Delete — {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selectedCustomer?.deletionStatus === 'DATABASE_DELETED_CLEANUP_PENDING' ? (
                'The database was already dropped, but cleanup failed. Confirm to finalize cleanup.'
              ) : (
                'This action cannot be undone. The entire tenant database will be dropped instantly.'
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleHardDelete} className="space-y-4 pt-2">
            {selectedCustomer && (() => {
              const waitMs = 7 * 24 * 60 * 60 * 1000;
              const deletedAtMs = selectedCustomer.deletedAt ? new Date(selectedCustomer.deletedAt).getTime() : 0;
              const isWaitOver = Date.now() - deletedAtMs >= waitMs;
              const availableDate = new Date(deletedAtMs + waitMs).toLocaleString();

              if (!isWaitOver && selectedCustomer.deletionStatus === 'SOFT_DELETED') {
                return (
                  <div className="bg-rose-100 text-rose-800 p-3 rounded text-xs border border-rose-200">
                    The 7-day waiting period has not completed. Deletion will be available on: <br/><strong>{availableDate}</strong>.
                  </div>
                );
              }

              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground">
                    Type School Code to confirm: <span className="font-mono font-bold text-destructive ml-1">{selectedCustomer.slug}</span>
                  </Label>
                  <Input
                    type="text"
                    required
                    placeholder={selectedCustomer.slug}
                    value={hardDeleteCode}
                    onChange={(e) => setHardDeleteCode(e.target.value)}
                    className="bg-background border-border text-foreground text-xs font-mono font-bold"
                  />
                </div>
              );
            })()}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setHardDeleteModalOpen(false)} className="border-border bg-gradient-to-br from-[#F0F6FF] to-[#E0EDFF] shadow-sm text-foreground text-xs">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={actionLoading || hardDeleteCode !== selectedCustomer?.slug} 
                className="bg-red-600 hover:bg-red-700 text-white text-xs disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Permanently Delete'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
