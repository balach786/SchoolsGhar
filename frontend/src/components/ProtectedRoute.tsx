import { Link, Navigate, useLocation } from 'react-router-dom';
import { isPlatformUser } from '@/lib/permissions';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LoadingOverlay } from '@/components/DataTable';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional permission gate: { module: 'users', action: 'view' } */
  perm?: { module: string | string[]; action?: string };
  /** Optional role gate: only these role slugs may enter. */
  roles?: string[];
}

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="text-xl font-semibold">Access Restricted</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        You don't have permission to access this section. Contact your administrator if you need access.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3"><Button asChild><Link to={isPlatformUser(user) ? '/platform-admin/dashboard' : '/dashboard'}>Back to Dashboard</Link></Button><Button variant="outline" onClick={() => window.history.back()}>
        Go back
      </Button></div>
    </div>
  );
}

export function ProtectedRoute({ children, perm, roles }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading, permissionsLoading, can } = useAuth();
  const location = useLocation();

  if (loading || (perm && permissionsLoading && !can(perm.module, perm.action ?? 'view'))) {
    return <LoadingOverlay label="Restoring your session…" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Platform accounts have a separate shell and never enter tenant modules.
  if (isPlatformUser(user)) return <Navigate to="/platform-admin/dashboard" replace />;

  if (roles && !roles.includes(user.role)) {
    return <ForbiddenPage />;
  }

  if (perm && !can(perm.module, perm.action ?? 'view')) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}
