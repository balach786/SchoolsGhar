import type { AuthUser } from '@/context/AuthContext';

/** School permission keys/actions match the server's permissions configuration. */
export function isPlatformUser(user: AuthUser | null): boolean {
  return !!user && (user.isPlatformAdmin === true || user.role === 'platform_admin');
}
export function hasSchoolPermission(user: AuthUser | null, module: string | string[], action = 'view'): boolean {
  if (!user || user.isActive === false || isPlatformUser(user) || !user.tenantId) return false;
  if (Array.isArray(module)) {
    return module.some(m => user.permissions?.[m]?.includes(action) ?? false);
  }
  return user.permissions?.[module]?.includes(action) ?? false;
}
