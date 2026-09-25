import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MoreHorizontal, Plus, Search, ShieldCheck, KeyRound, Pencil, Ban, CircleCheck, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type Column, type PaginationState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/context/AuthContext';
import { api, apiErrorMessage, ApiListResponse } from '@/lib/api';
import { formatDateTime, initials } from '@/lib/format';

interface RoleSummary {
  _id: string;
  name: string;
  slug: string;
  description: string;
  isSystemRole: boolean;
  isActive: boolean;
  permissions: { module: string; actions: string[] }[];
}

interface UserRow {
  _id: string;
  name: string;
  email: string;
  roleId: string;
  role: string;
  roleLabel: string;
  isActive: boolean;
  isArchived: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const userFormSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    personType: z.enum(['teacher', 'accountant', 'staff', 'student']).optional(),
    personId: z.string().optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number')
      .optional()
      .or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
    roleId: z.string().optional(),
    isActive: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    }
  )
  .refine(
    (data) => {
      if (!data.personType || data.personType === 'staff') {
        return !!data.roleId;
      }
      return true;
    },
    {
      path: ['roleId'],
      message: 'Role is required',
    }
  );

type UserFormValues = z.infer<typeof userFormSchema>;

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

const roleTone: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  super_admin: 'destructive',
  admin: 'warning',
  teacher: 'success',
  student: 'secondary',
  accountant: 'default',
  receptionist: 'outline',
};

function RoleBadge({ role, label }: { role: string; label: string }) {
  return <Badge variant={roleTone[role] ?? 'outline'}>{label}</Badge>;
}

export function UsersPage() {
  const { can } = useAuth();
  const [data, setData] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roles, setRoles] = useState<RoleSummary[]>([]);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = can('users', 'edit');
  const canCreate = can('users', 'create');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get<ApiListResponse<UserRow>>(`/users?${params.toString()}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err), { id: 'users-load-error' });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, roleFilter, statusFilter]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: RoleSummary[] }>('/users/roles');
      setRoles(res.data.data.filter((r) => r.isActive));
    } catch {
      /* roles needed only for dialogs */
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(row.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => <RoleBadge role={row.role} label={row.roleLabel} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>,
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.lastLoginAt, 'Never')}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Actions for ${row.name}`} variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">User actions</DropdownMenuLabel>
            {canEdit && (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem className="cursor-pointer" onClick={() => setResetTarget(row)}>
                <KeyRound className="h-4 w-4" /> Reset password
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {canEdit &&
              (row.isActive ? (
                <DropdownMenuItem className="cursor-pointer text-warning-foreground" onClick={() => setToggleTarget(row)}>
                  <Ban className="h-4 w-4" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="cursor-pointer text-success" onClick={() => setToggleTarget(row)}>
                  <CircleCheck className="h-4 w-4" /> Activate
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage system accounts, roles, and account status."
        crumbs={[{ label: 'Users' }]}
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add user
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="filter-toolbar mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPagination((p) => ({ ...p, page: 1 }));
                setSearch(searchInput.trim());
              }
            }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.slug} value={r.slug}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPagination((p) => ({ ...p, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setRoleFilter('all');
              setStatusFilter('all');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        rowKey={(r) => r._id}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onLimitChange={(limit) => setPagination((p) => ({ ...p, limit, page: 1 }))}
        emptyTitle="No users found"
        emptyDescription="Try adjusting your search or filters."
      />

      {/* Create / Edit dialog */}
      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        roles={roles}
        onSaved={() => loadUsers()}
      />

      {/* Reset password dialog */}
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />

      {/* Activate / deactivate confirm */}
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.isActive ? 'Deactivate user?' : 'Activate user?'}
        description={
          toggleTarget?.isActive
            ? `${toggleTarget?.name} will no longer be able to sign in.`
            : `${toggleTarget?.name} will be able to sign in again.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        destructive={toggleTarget?.isActive}
        loading={busy}
        onConfirm={async () => {
          if (!toggleTarget) return;
          setBusy(true);
          try {
            const action = toggleTarget.isActive ? 'deactivate' : 'activate';
            await api.post(`/users/${toggleTarget._id}/${action}`);
            toast.success(`User ${toggleTarget.isActive ? 'deactivated' : 'activated'}`);
            setToggleTarget(null);
            loadUsers();
          } catch (err) {
            toast.error(apiErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  roles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: UserRow | null;
  roles: RoleSummary[];
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '', password: '', roleId: '', isActive: true },
  });
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isEdit = !!editing;
  const assignableRoles = roles.filter((r) => {
    if (currentUser?.role !== 'super_admin' && r.slug === 'super_admin') return false;
    if (!isEdit && watch('personType') === 'staff' && ['admin', 'super_admin', 'platform_admin'].includes(r.slug)) return false;
    return true;
  });

  const [personSearch, setPersonSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [peopleResults, setPeopleResults] = useState<any[]>([]);
  const [selectedPersonEmailLocked, setSelectedPersonEmailLocked] = useState(false);

  useEffect(() => {
    if (isEdit || !watch('personType')) {
      setPeopleResults([]);
      return;
    }
    if (watch('personId')) return;
    
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{data: any[]}>(`/users/unlinked-people?type=${watch('personType')}&search=${personSearch}`);
        setPeopleResults(res.data.data);
      } catch (err) { }
    }, 400);
    return () => clearTimeout(timer);
  }, [personSearch, watch('personType'), isEdit, watch('personId')]);

  const handlePersonSelect = (person: any) => {
    setValue('personId', person._id, { shouldValidate: true });
    setPersonSearch(person.name);
    setPeopleResults([]);
    if (person.email) {
      setValue('email', person.email, { shouldValidate: true });
      setSelectedPersonEmailLocked(true);
    } else {
      setValue('email', '');
      setSelectedPersonEmailLocked(false);
    }
  };

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              name: editing.name,
              email: editing.email,
              password: '',
              confirmPassword: '',
              roleId: editing.roleId,
              isActive: editing.isActive,
              personType: undefined,
              personId: undefined,
            }
          : { name: '', email: '', password: '', confirmPassword: '', roleId: '', isActive: true, personType: undefined, personId: undefined }
      );
    }
  }, [open, editing, reset]);

  const onSubmit = async (values: UserFormValues) => {
    setBusy(true);
    try {
      if (isEdit && editing) {
        await api.patch(`/users/${editing._id}`, {
          name: values.name,
          email: values.email,
          roleId: values.roleId,
          isActive: values.isActive,
        });
        toast.success('User updated');
      } else {
        await api.post('/users', {
          personType: values.personType,
          personId: values.personId,
          email: values.email,
          password: values.password,
          roleId: values.roleId,
          isActive: values.isActive,
        });
        toast.success('User created');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'Add user'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update account details and role assignment.' : 'Create a new system account.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" placeholder="e.g. Ayesha Khan" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Account For (User Type)</Label>
                <Select value={watch('personType') || ''} onValueChange={(v) => { setValue('personType', v as any, { shouldValidate: true }); setValue('personId', ''); setPersonSearch(''); setSelectedPersonEmailLocked(false); setValue('email', ''); }}>
                  <SelectTrigger><SelectValue placeholder="Select user type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="staff">Other Staff</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {watch('personType') && (
                <div className="space-y-1.5 relative">
                  <Label>Search Person</Label>
                  <Input 
                    placeholder="Type name or ID to search..." 
                    value={personSearch} 
                    onChange={e => setPersonSearch(e.target.value)} 
                    disabled={!!watch('personId')} 
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  />
                  {searchFocused && peopleResults.length > 0 && !watch('personId') && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                      {peopleResults.map(p => (
                        <div key={p._id} className="p-2 hover:bg-slate-100 cursor-pointer text-sm" onClick={() => handlePersonSelect(p)}>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.identifier} {p.designation ? `• ${p.designation}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {watch('personId') && (
                    <p className="text-xs text-success flex items-center mt-1">
                      <CircleCheck className="w-3 h-3 mr-1"/> Person linked
                      <Button type="button" variant="link" className="h-auto p-0 ml-2 text-xs" onClick={() => { setValue('personId', ''); setPersonSearch(''); setSelectedPersonEmailLocked(false); setValue('email', ''); }}>Change person</Button>
                    </p>
                  )}
                  {errors.personId && <p className="text-xs text-destructive">{errors.personId.message}</p>}
                </div>
              )}
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Login Email</Label>
            <Input id="u-email" type="email" placeholder="name@school.edu.pk" {...register('email')} disabled={!isEdit && selectedPersonEmailLocked} />
            {!isEdit && selectedPersonEmailLocked && <p className="text-[11px] text-muted-foreground">Email is locked from the selected profile.</p>}
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="u-password">Password</Label>
                <div className="relative">
                  <Input id="u-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Minimum 8 characters with a number" {...register('password')} className="pr-9" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-confirm-password">Confirm password</Label>
                <div className="relative">
                  <Input id="u-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter password" {...register('confirmPassword')} className="pr-9" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
            </>
          )}
          {(!watch('personType') || watch('personType') === 'staff') && (
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={watch('roleId') || undefined} onValueChange={(v) => setValue('roleId', v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r._id} value={r._id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Select a role that matches this person's permissions level.
              </p>
              {errors.roleId && <p className="text-xs text-destructive">{errors.roleId.message}</p>}
            </div>
          )}
          {isEdit && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Account active</p>
                <p className="text-xs text-muted-foreground">Inactive users cannot sign in</p>
              </div>
              <Switch checked={watch('isActive')} onCheckedChange={(v) => setValue('isActive', v)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ target, onClose }: { target: UserRow | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ newPassword: string; confirm: string }>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirm: '' },
  });
  const [busy, setBusy] = useState(false);

  const onSubmit = async (values: { newPassword: string }) => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/users/${target._id}/reset-password`, { newPassword: values.newPassword });
      toast.success(`Password reset for ${target.name}`);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <span className="font-medium text-foreground">{target?.name}</span>. All their active
            sessions will be signed out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-pw">New password</Label>
            <Input id="r-pw" type="password" placeholder="Minimum 8 characters with a number" {...register('newPassword')} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-cf">Confirm password</Label>
            <Input id="r-cf" type="password" placeholder="Repeat the new password" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
