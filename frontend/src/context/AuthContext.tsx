import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getAccessToken, getRefreshToken, setTokens, clearTokens, AUTH_EXPIRED_EVENT, AUTH_UPDATED_EVENT, PERMISSION_CHANGED_EVENT } from '@/lib/api';
import { hasSchoolPermission } from '@/lib/permissions';

/**
 * Central authentication state — the only place auth logic lives.
 * Provides: user, permissions, role, loading, login(), logout(), can().
 */
export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: string; // role slug, e.g. 'teacher' or 'platform_admin'
  roleId?: string;
  roleLabel?: string;
  isActive?: boolean;
  isPlatformAdmin?: boolean;
  tenantId?: string;
  lastLoginAt?: string | null;
  permissions?: Record<string, string[]>;
  dashboardOrder?: string[];
}

export interface AuthResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean; // initial session restore in progress
  permissionsLoading: boolean;
  login: (schoolCode: string, email: string, password: string) => Promise<AuthUser>;
  loginPlatform: (email: string, password: string) => Promise<boolean>;
  applySession: (data: AuthResponseData) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Permission check against the user's live permission map. */
  can: (module: string | string[], action?: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  loading: true,
  permissionsLoading: true,
  login: async () => ({} as AuthUser),
  loginPlatform: async () => false,
  applySession: () => undefined,
  logout: async () => undefined,
  refreshUser: async () => undefined,
  can: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const sessionVersion = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const applySession = useCallback((data: AuthResponseData) => {
    sessionVersion.current += 1;
    setTokens(data.accessToken, data.refreshToken ?? null);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    sessionVersion.current += 1;
    const refreshToken = getRefreshToken();
    clearTokens();
    setUser(null);
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore — local session ends regardless
    }
  }, []);

  // Restore session on first mount
  useEffect(() => {
    let cancelled = false;
    const version = sessionVersion.current;

    async function restore() {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<{ success: boolean; data: { user: AuthUser } }>('/auth/me');
        if (!cancelled && version === sessionVersion.current && res.data?.success) setUser(res.data.data.user);
      } catch {
        if (!cancelled && version === sessionVersion.current) {
          clearTokens();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Global session-expiry listener (refresh failed somewhere)
  useEffect(() => {
    const handler = () => {
      sessionVersion.current += 1;
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, []);

  const login = useCallback(
    async (schoolCode: string, email: string, password: string) => {
      const res = await api.post<{ success: boolean; data: AuthResponseData }>('/auth/login', { schoolCode, email, password });
      applySession(res.data.data);
      return res.data.data.user;
    },
    [applySession]
  );

  const loginPlatform = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ success: boolean; data: AuthResponseData }>('/platform/auth/login', { email, password });
      if (res.data?.success) {
        applySession(res.data.data);
        return true;
      }
      throw new Error('Invalid credentials');
    },
    [applySession]
  );

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) return;
    if (refreshInFlight.current) return refreshInFlight.current;
    const version = sessionVersion.current;
    setPermissionsLoading(true);
    refreshInFlight.current = api.get<{ success: boolean; data: { user: AuthUser } }>('/auth/me')
      .then(res => { if (version === sessionVersion.current && res.data?.success) setUser(res.data.data.user); })
      .finally(() => { refreshInFlight.current = null; setPermissionsLoading(false); });
    return refreshInFlight.current;
  }, []);

  useEffect(() => {
    const refresh = () => { void refreshUser().catch(() => undefined); };
    const updated = (event: Event) => { setUser((event as CustomEvent<AuthUser>).detail); };
    window.addEventListener('focus', refresh);
    window.addEventListener(PERMISSION_CHANGED_EVENT, refresh);
    window.addEventListener(AUTH_UPDATED_EVENT, updated);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PERMISSION_CHANGED_EVENT, refresh);
      window.removeEventListener(AUTH_UPDATED_EVENT, updated);
    };
  }, [refreshUser]);

  const can = useCallback(
    (module: string | string[], action = 'view') => {
      return hasSchoolPermission(user, module, action);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      permissionsLoading: loading || permissionsLoading,
      login,
      loginPlatform,
      applySession,
      logout,
      refreshUser,
      can,
    }),
    [user, loading, permissionsLoading, login, loginPlatform, applySession, logout, refreshUser, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
