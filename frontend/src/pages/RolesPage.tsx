import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, ShieldCheck, Loader2, Info } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { api, apiErrorMessage, PERMISSION_CHANGED_EVENT } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export interface CatalogModule {
  module: string;
  label: string;
  actions: string[];
}

interface RoleRow {
  _id: string;
  name: string;
  slug: string;
  description: string;
  isSystemRole: boolean;
  isActive: boolean;
  permissions: { module: string; actions: string[] }[];
  corePermissions: { module: string; actions: string[] }[];
}

export function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { can, user } = useAuth();

  const selected = roles.find((r) => r._id === selectedId) ?? null;
  const isSuper = selected?.slug === 'super_admin';
  const amISuper = user?.role === 'super_admin';

  // Load dynamic catalog from backend API
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: { catalog: CatalogModule[] } }>('/permissions/catalog');
      setCatalog(res.data.data.catalog || []);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: RoleRow[] }>('/roles');
      setRoles(res.data.data);
      setSelectedId((prev) => prev || res.data.data[0]?._id || '');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadRoles();
  }, [loadCatalog, loadRoles]);

  // Browser tab close guard when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  // Initialize draft whenever the selected role changes
  useEffect(() => {
    if (!selected) {
      setDraft({});
      setDirty(false);
      return;
    }
    const map: Record<string, string[]> = {};
    for (const p of selected.permissions) map[p.module] = [...p.actions];
    setDraft(map);
    setDirty(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute canonical ordered list of all visible actions across modules
  const allActions = useMemo(() => {
    const order = [
      'view',
      'create',
      'edit',
      'delete',
      'archive',
      'approve',
      'export',
      'import',
      'print',
      'publish',
      'collect',
      'schedule',
      'generate',
      'discount',
      'fine',
      'overrideEligibility',
      'mark',
      'review',
      'republish',
      'history',
    ];
    const present = new Set<string>();
    for (const m of catalog) {
      for (const a of m.actions) present.add(a);
    }
    return order.filter((a) => present.has(a));
  }, [catalog]);

  const grantedCount = useMemo(() => {
    if (!selected) return 0;
    if (isSuper) return catalog.reduce((acc, m) => acc + m.actions.length, 0);
    return Object.values(draft).reduce((acc, a) => acc + a.length, 0);
  }, [selected, draft, isSuper, catalog]);

  const toggle = (module: string, action: string) => {
    if (isSuper) return;
    setDraft((prev) => {
      const current = new Set(prev[module] ?? []);
      if (current.has(action)) current.delete(action);
      else current.add(action);
      return { ...prev, [module]: Array.from(current) };
    });
    setDirty(true);
  };

  const handleRoleSelect = (newId: string) => {
    if (newId === selectedId) return;
    if (dirty) {
      setPendingRoleId(newId);
      setDiscardConfirmOpen(true);
    } else {
      setSelectedId(newId);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/roles/${selected._id}/permissions`, { permissions: draft });
      window.dispatchEvent(new CustomEvent(PERMISSION_CHANGED_EVENT));
      toast.success(`Permissions saved for ${selected.name}`);
      setConfirmOpen(false);
      setDirty(false);
      loadRoles();
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Configure what each role can view and do. Changes apply immediately."
        crumbs={[{ label: 'Permissions' }]}
      />

      <div className="filter-toolbar mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selectedId} onValueChange={handleRoleSelect} disabled={loading}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r._id} value={r._id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{grantedCount}</span> granted actions
          </span>
          {dirty && !isSuper && <Badge variant="warning">Unsaved changes</Badge>}
          <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || isSuper || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>

      {selected && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">
              {selected.name} <Badge variant="outline" className="ml-1 text-[10px]">{selected.slug}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              {isSuper
                ? 'The Super Admin role always has full access to every module — its matrix is locked.'
                : selected.description || 'Custom role'}
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permission matrix</CardTitle>
          <CardDescription>
            Rows are modules, columns are actions. Dashes mean an action doesn't apply to that module.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading || catalogLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading roles & permission catalog…
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto custom-scrollbar [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-30 [&_thead_tr]:bg-muted [&_thead_tr:hover]:bg-muted [&_th]:bg-muted">
              <table className="w-full caption-bottom text-sm min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px] sticky left-0 z-40 bg-muted border-r shadow-sm">Module</TableHead>
                    {allActions.map((a) => (
                      <TableHead key={a} className="text-center capitalize min-w-[110px]">
                        {a}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((m) => (
                    <TableRow key={m.module} className="group">
                      <TableCell className="font-medium sticky left-0 z-20 bg-background group-hover:bg-muted transition-colors border-r shadow-sm">{m.label}</TableCell>
                      {allActions.map((a) => {
                        const applicable = m.actions.includes(a);
                        if (!applicable) {
                          return (
                            <TableCell key={a} className="text-center text-muted-foreground/40">
                              —
                            </TableCell>
                          );
                        }
                        const checked = isSuper ? true : (draft[m.module] ?? []).includes(a);
                        // A user can only toggle an action if they themselves possess it (or if they are super admin)
                        // If they don't possess it, they can't grant it to others.
                        const canToggle = amISuper || can(m.module, a);
                        
                        // Check if this action is part of the role's core permissions.
                        // Core permissions are unconditionally hidden from the matrix to avoid conflicting states.
                        const isCorePermission = selected?.corePermissions?.some(
                          (cp) => cp.module === m.module && cp.actions.includes(a)
                        );
                        
                        if (isCorePermission) {
                          return (
                            <TableCell key={a} className="text-center">
                              {/* Hidden per design requirements */}
                            </TableCell>
                          );
                        }

                        return (
                          <TableCell key={a} className="text-center">
                            <Switch
                              checked={checked}
                              disabled={isSuper || !selected?.isActive || !canToggle}
                              onCheckedChange={() => toggle(m.module, a)}
                              aria-label={`${m.label} ${a}`}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Access permissions apply across your school workspace.
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save permission changes?"
        description={`Update the permission matrix for ${selected?.name}. Users with this role are affected immediately.`}
        confirmLabel="Save changes"
        loading={saving}
        onConfirm={save}
      />

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Discard unsaved changes?"
        description="You have unsaved role permission modifications. Discard changes and switch role?"
        confirmLabel="Discard changes"
        destructive={true}
        onConfirm={() => {
          if (pendingRoleId) {
            setSelectedId(pendingRoleId);
            setPendingRoleId(null);
          }
          setDirty(false);
          setDiscardConfirmOpen(false);
        }}
      />
    </div>
  );
}
