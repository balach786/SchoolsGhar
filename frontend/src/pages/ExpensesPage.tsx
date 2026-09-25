import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Download, Pencil, Archive, ArchiveRestore, Loader2, Search, HandCoins, CircleDollarSign } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatCurrency, formatDate, toPaisa } from '@/lib/format';

interface TxRow {
  _id: string; category: string; title: string; amount: number; date: string;
  description: string | null; reference: string | null; isArchived: boolean;
}

const EXPENSE_CATEGORIES = ['Utilities', 'Maintenance', 'Stationery', 'Rent', 'Events', 'Miscellaneous', 'Other'];
const INCOME_SUGGESTIONS = ['Donation', 'Event', 'Grant', 'Canteen', 'Other'];

async function downloadCsv(path: string, fallbackName: string) {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const disposition: string = res.headers['content-disposition'] ?? '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match?.[1] ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(apiErrorMessage(err));
  }
}

export function ExpensesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState<'expenses' | 'incomes'>('expenses');
  const [data, setData] = useState<TxRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TxRow | null>(null);

  const canCreate = can(tab === 'expenses' ? 'expenses' : 'incomes', 'create');
  const canEdit = can(tab === 'expenses' ? 'expenses' : 'incomes', 'edit');
  const canExport = can(tab === 'expenses' ? 'expenses' : 'incomes', 'export') || can(tab === 'expenses' ? 'expenses' : 'incomes', 'view');

  const basePath = tab === 'expenses' ? '/expenses' : '/incomes';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(pagination.limit) });
      if (search) params.set('search', search);
      if (category !== 'all') params.set('category', category);
      const res = await api.get<ApiListResponse<TxRow>>(`${basePath}?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [basePath, pagination.page, pagination.limit, search, category]);

  useEffect(() => {
    setCategory('all');
    setSearch('');
    setPagination((p) => ({ ...p, page: 1 }));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<TxRow>[] = [
    { key: 'date', header: 'Date', cell: (row) => <span className="text-sm">{formatDate(row.date)}</span> },
    {
      key: 'title', header: 'Description',
      cell: (row) => (
        <div className="leading-tight">
          <p className="font-medium">{row.title}</p>
          {row.reference && <p className="text-xs text-muted-foreground">ref: {row.reference}</p>}
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (row) => <Badge variant="outline">{row.category}</Badge> },
    {
      key: 'amount', header: 'Amount',
      cell: (row) => <span className={`font-medium ${tab === 'expenses' ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(row.amount)}</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canEdit && !row.isArchived && (
            <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setFormOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row)}>
              {row.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ── Form state ────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');

  function openCreate() {
    setEditing(null);
    setTitle('');
    setFormCategory(tab === 'expenses' ? EXPENSE_CATEGORIES[0] : 'Donation');
    setAmountText('');
    setDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setDescription('');
    setFormOpen(true);
  }

  function openEdit(row: TxRow) {
    setEditing(row);
    setTitle(row.title);
    setFormCategory(row.category);
    setAmountText((row.amount / 100).toFixed(2));
    setDate(row.date.slice(0, 10));
    setReference(row.reference ?? '');
    setDescription(row.description ?? '');
    setFormOpen(true);
  }

  async function submitForm() {
    if (!title.trim()) return toast.error('Title is required');
    if (!formCategory.trim()) return toast.error('Category is required');
    const amount = toPaisa(amountText);
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      const payload = {
        category: formCategory.trim(),
        title: title.trim(),
        amount,
        date,
        description: description || undefined,
        reference: reference || undefined,
      };
      if (editing) {
        await api.patch(`${basePath}/${editing._id}`, payload);
        toast.success('Entry updated');
      } else {
        await api.post(basePath, payload);
        toast.success(`${tab === 'expenses' ? 'Expense' : 'Income'} recorded`);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      const action = archiveTarget.isArchived ? 'restore' : 'archive';
      await api.post(`${basePath}/${archiveTarget._id}/${action}`);
      toast.success(archiveTarget.isArchived ? 'Entry restored' : 'Entry archived');
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const categoryOptions = tab === 'expenses' ? EXPENSE_CATEGORIES : INCOME_SUGGESTIONS;

  return (
    <div>
      <PageHeader
        title="Expenses & Income"
        description="Track school spending and non-fee income. Fee payments are tracked separately."
        crumbs={[{ label: 'Finance' }, { label: 'Expenses' }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" onClick={() => downloadCsv(`${basePath}?format=csv&limit=1000`, `${tab}.csv`)}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            )}
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> New {tab === 'expenses' ? 'expense' : 'income'}
              </Button>
            )}
          </>
        }
      />



      <Tabs value={tab} onValueChange={(v) => setTab(v as 'expenses' | 'incomes')} className="mb-4">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="incomes">Income</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="filter-toolbar mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search title or reference…" value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(r) => r._id}
        pagination={pagination}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onLimitChange={(l) => setPagination((prev) => ({ ...prev, limit: l, page: 1 }))}
        emptyTitle={`No ${tab === 'expenses' ? 'expenses' : 'income entries'} yet`}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit entry' : `New ${tab === 'expenses' ? 'expense' : 'income'}`}</DialogTitle>
            <DialogDescription>Amounts are stored as integers in the smallest currency unit.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tx-title">Title</Label>
              <Input id="tx-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tab === 'expenses' ? 'Electricity bill' : 'PTA donation'} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tx-date">Date</Label>
                <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tx-amount">Amount (PKR)</Label>
                <Input id="tx-amount" type="number" min={0.01} step={0.01} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tx-ref">Reference</Label>
                <Input id="tx-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tx-desc">Description</Label>
              <Textarea id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Save entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={archiveTarget?.isArchived ? 'Restore entry?' : 'Archive entry?'}
        description={archiveTarget?.isArchived ? 'The entry becomes visible in reports again.' : 'The entry will be hidden from lists and reports (data is kept).'}
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        onConfirm={toggleArchive}
        loading={busy}
      />
    </div>
  );
}
