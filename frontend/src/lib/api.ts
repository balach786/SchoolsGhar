import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Single Axios instance for the whole app.
 * - Base URL from VITE_API_URL, falling back to same-origin (/api → Vite proxy).
 * - Attaches the access token automatically.
 * - On 401 (expired access token): transparently refreshes ONCE, then retries.
 * - If refresh fails: clears tokens and notifies the app (auth:expired event).
 */
export const API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '').replace(/\/api$/, '');

/**
 * Resolves static asset and upload paths.
 * If path is relative (/uploads/...), prepends API_BASE_URL if configured, or leaves relative to leverage proxy.
 */
export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return cleanPath;
}

export const api = axios.create({
  baseURL: API_BASE_URL ? `${API_BASE_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export const TOKEN_KEY = 'sms_access_token';
export const REFRESH_TOKEN_KEY = 'sms_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(access: string, refresh?: string | null): void {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh === null) localStorage.removeItem(REFRESH_TOKEN_KEY);
  else if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Broadcasts that the session ended — AuthContext listens and redirects. */
export const AUTH_EXPIRED_EVENT = 'sms:auth-expired';
export const AUTH_UPDATED_EVENT = 'sms:auth-updated';
export const PERMISSION_CHANGED_EVENT = 'sms:permission-changed';

function notifyAuthExpired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

// Single-flight refresh queue
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];
let hasLoggedOut = false;

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{
      success: boolean;
      data: { accessToken: string; refreshToken: string; user?: import('@/context/AuthContext').AuthUser };
    }>(`${api.defaults.baseURL}/auth/refresh`, { refreshToken }, { timeout: 15000 });
    
    if (getRefreshToken() !== refreshToken) return null;
    if (data?.success && data.data.accessToken) {
      setTokens(data.data.accessToken, data.data.refreshToken ?? null);
      if (data.data.user) window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT, { detail: data.data.user }));
      return data.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Simple in-memory cache for GET /lookup endpoints
const GET_CACHE = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Attach token to every request and use cache for lookup requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (hasLoggedOut) {
    if (!config.url?.includes('/auth/')) {
      return Promise.reject(new axios.Cancel('Session expired'));
    }
  }

  // Attempt to return cached response for /lookup GET requests
  if (config.method?.toUpperCase() === 'GET' && config.url?.endsWith('/lookup')) {
    const cached = GET_CACHE.get(config.url);
    if (cached && cached.expiry > Date.now()) {
      config.adapter = async () => ({
        data: cached.data,
        status: 200,
        statusText: 'OK',
        headers: {} as any,
        config,
        request: {}
      });
    }
  }

  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => {
    // If a request succeeds, we are not logged out
    hasLoggedOut = false;
    
    // Save successful /lookup GET requests to cache
    if (response.config.method?.toUpperCase() === 'GET' && response.config.url?.endsWith('/lookup')) {
      GET_CACHE.set(response.config.url, {
        data: response.data,
        expiry: Date.now() + CACHE_TTL
      });
    }
    
    return response;
  },
  async (error: AxiosError) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';

    // Skip refresh for auth endpoints themselves
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && config && !isAuthCall) {
      if (!config._retry) {
        config._retry = true;
        
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              config.headers.Authorization = `Bearer ${token}`;
              return api.request(config);
            })
            .catch((err) => Promise.reject(err));
        }

        isRefreshing = true;

        const newToken = await tryRefresh();
        
        if (newToken) {
          isRefreshing = false;
          hasLoggedOut = false;
          processQueue(null, newToken);
          config.headers.Authorization = `Bearer ${newToken}`;
          return api.request(config);
        } else {
          isRefreshing = false;
          if (!hasLoggedOut) {
            hasLoggedOut = true;
            clearTokens();
            notifyAuthExpired();
          }
          processQueue(error, null);
          return Promise.reject(error);
        }
      } else {
        // If it's a retry and it STILL failed with 401, the token is fundamentally invalid.
        if (!hasLoggedOut) {
          hasLoggedOut = true;
          clearTokens();
          notifyAuthExpired();
        }
      }
    }
    
    const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (status === 403 && ['ACCOUNT_INACTIVE', 'ROLE_INACTIVE'].includes(code ?? '')) {
      if (!hasLoggedOut) {
        hasLoggedOut = true;
        clearTokens();
        notifyAuthExpired();
      }
    } else if (status === 403 && code === 'PERMISSION_DENIED') {
      window.dispatchEvent(new CustomEvent(PERMISSION_CHANGED_EVENT));
    }
    
    return Promise.reject(error);
  }
);

/** Extract a human-friendly message from an API error envelope. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  try {
    if (axios.isAxiosError(err)) {
      const errorData = err.response?.data?.error;
      if (errorData) {
        if (typeof errorData === 'string') return errorData;
        if (errorData.code === 'VALIDATION_ERROR' && Array.isArray(errorData.details) && errorData.details.length > 0) {
          const detailMsg = errorData.details[0].message;
          if (typeof detailMsg === 'string') return detailMsg;
        }
        if (typeof errorData.message === 'string') return errorData.message;
        return JSON.stringify(errorData);
      }
    }
    if (err instanceof Error && typeof err.message === 'string') return err.message;
  } catch (e) {
    // Ignore
  }
  return fallback;
}

export interface ApiListResponse<T, S = any> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary?: S;
}

export interface ApiDataResponse<T> {
  success: boolean;
  data: T;
}
