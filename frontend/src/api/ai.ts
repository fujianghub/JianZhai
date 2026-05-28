import { apiClient, ensureCsrf } from './client';

export type AIOperation =
  | 'continue'
  | 'polish'
  | 'expand'
  | 'summarize'
  | 'translate_en'
  | 'translate_zh'
  | 'fix'
  | 'outline';

export type AIProvider = 'anthropic' | 'qwen';

export interface AIModelOption {
  id: string;
  label: string;
  hint: string;
  /** Backend will set; older deployments may omit — frontend treats missing
   *  as 'anthropic' for backwards-compat. */
  provider?: AIProvider;
}

export interface AICapabilities {
  configured: boolean;
  /** Per-provider readiness — `configured` above is `any(providers_configured)`. */
  providers_configured?: Partial<Record<AIProvider, boolean>>;
  enabled?: boolean;
  operations: AIOperation[];
  models: AIModelOption[];
  default_model: string;
}

export interface AIAdminSettings {
  default_model: string;
  enabled: boolean;
  max_tokens: number;
  updated_at: string | null;
  models: AIModelOption[];
}

let capCache: { at: number; data: AICapabilities } | null = null;
const CAP_TTL_MS = 5 * 60_000;

export async function getAISettings(): Promise<AIAdminSettings> {
  const { data } = await apiClient.get<AIAdminSettings>('/ai/settings/');
  return data;
}

export async function updateAISettings(patch: Partial<AIAdminSettings>): Promise<AIAdminSettings> {
  await ensureCsrf();
  const { data } = await apiClient.patch<AIAdminSettings>('/ai/settings/', patch);
  // Bust the capabilities cache so admin changes propagate immediately
  capCache = null;
  return data;
}

export async function getCapabilities(): Promise<AICapabilities> {
  const now = Date.now();
  if (capCache && now - capCache.at < CAP_TTL_MS) return capCache.data;
  const { data } = await apiClient.get<AICapabilities>('/ai/capabilities/');
  capCache = { at: now, data };
  return data;
}

export async function runAI(
  operation: AIOperation,
  content: string,
  options: { extra?: string; model?: string } = {}
): Promise<string> {
  await ensureCsrf();
  const { data } = await apiClient.post<{ operation: string; result: string }>('/ai/run/', {
    operation,
    content,
    extra: options.extra,
    model: options.model,
  });
  return data.result;
}

/**
 * Stream text deltas from the AI. Returns an abort function the caller can
 * call to cancel mid-stream.
 *
 * Uses fetch + ReadableStream because EventSource doesn't support POST or
 * custom headers (we need CSRF). The wire format is text/event-stream so the
 * server-side code is the same simplicity either way.
 */
export async function streamAI(
  operation: AIOperation,
  content: string,
  options: {
    extra?: string;
    model?: string;
    onDelta?: (text: string) => void;
    onDone?: () => void;
    onError?: (msg: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  await ensureCsrf();
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1];
  const base = apiClient.defaults.baseURL || '';
  const res = await fetch(`${base}/ai/stream/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf || '',
    },
    body: JSON.stringify({
      operation,
      content,
      extra: options.extra || '',
      model: options.model || '',
    }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    options.onError?.(`HTTP ${res.status}: ${txt}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Server-Sent Events: events separated by blank line, each line starts with
  // either ``event:`` or ``data:``.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const ev of events) {
      const lines = ev.split('\n');
      let evType = 'message';
      let payload = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) evType = line.slice(7).trim();
        else if (line.startsWith('data: ')) payload = line.slice(6);
      }
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        if (evType === 'error') options.onError?.(parsed.detail || 'AI 调用失败');
        else if (evType === 'done') options.onDone?.();
        else if (parsed.delta) options.onDelta?.(parsed.delta);
      } catch {
        /* ignore malformed chunks */
      }
    }
  }
  options.onDone?.();
}
