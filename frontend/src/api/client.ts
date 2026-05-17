import axios, { type InternalAxiosRequestConfig } from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 30_000,
  // CSRF is handled manually below. Axios's built-in xsrf option caches oddly
  // across rotations and was producing stale tokens after Django's login flow
  // (which rotates the csrftoken cookie). The request interceptor re-reads
  // document.cookie on every unsafe call instead.
});

const UNSAFE = /^(post|put|patch|delete)$/i;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function hasCsrfCookie(): boolean {
  return readCookie('csrftoken') !== null;
}

/** Ensure the csrftoken cookie is set; safe to call repeatedly. */
export async function ensureCsrf(): Promise<void> {
  if (hasCsrfCookie()) return;
  await apiClient.get('/auth/csrf/');
}

// Always re-read csrftoken from document.cookie just before dispatching an
// unsafe request — required because Django rotates the cookie on login.
apiClient.interceptors.request.use((config) => {
  if (config.method && UNSAFE.test(config.method)) {
    const token = readCookie('csrftoken');
    if (token) config.headers.set('X-CSRFToken', token);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  __csrfRetried?: boolean;
}

// Safety net: if a 403 still slips through (e.g. cookie was missing when the
// request was queued), refetch CSRF and retry exactly once.
apiClient.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const cfg = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    if (
      status === 403 &&
      cfg &&
      !cfg.__csrfRetried &&
      cfg.url &&
      !cfg.url.includes('/auth/csrf/')
    ) {
      cfg.__csrfRetried = true;
      try {
        await apiClient.get('/auth/csrf/');
      } catch {
        return Promise.reject(error);
      }
      // Drop the stale header so the request interceptor re-reads it fresh.
      if (cfg.headers) {
        try {
          (cfg.headers as { delete?: (k: string) => void }).delete?.('X-CSRFToken');
        } catch {
          /* fine */
        }
      }
      return apiClient.request(cfg);
    }
    return Promise.reject(error);
  }
);

/** Extract a user-friendly error message from an axios failure. */
export function formatApiError(err: unknown, fallback = '请求失败'): string {
  const e = err as { response?: { status?: number; data?: unknown }; message?: string };
  const data = e?.response?.data as Record<string, unknown> | string | undefined;
  if (typeof data === 'string' && data) return data;
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: string }).detail;
    if (detail) return detail;
    const first = Object.values(data)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === 'string') return first;
  }
  if (e?.response?.status === 403) return '登录已过期或权限不足，请重新登录';
  return e?.message || fallback;
}
