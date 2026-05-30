import { apiClient, ensureCsrf } from './client';

export type AIOperation =
  | 'continue'
  | 'polish'
  | 'expand'
  | 'summarize'
  | 'translate_en'
  | 'translate_zh'
  | 'fix'
  | 'outline'
  | 'chat'
  // user-template id: ``tpl_<int>``
  | (string & {});

export type AIProvider = 'anthropic' | 'qwen';

/** Error codes the server can surface via SSE ``event: error`` or REST 4xx/5xx.
 *  Front-end maps these to specific user-visible messages and toast colours. */
export type AIErrorCode =
  | 'ai_unavailable'      // SDK / API key missing — show "管理员配置 KEY"
  | 'ai_disabled'         // admin turned off
  | 'ai_budget_exceeded'  // per-user daily budget hit (429)
  | 'ai_error'            // generic upstream failure
  | 'http_error';         // transport / parse error before we got SSE

export interface AIErrorPayload {
  code: AIErrorCode;
  detail: string;
  /** HTTP status if available — useful to distinguish 429 (retry later)
   *  vs 502 (upstream broken). */
  status?: number;
}

export interface AIModelOption {
  id: string;
  label: string;
  hint: string;
  /** Backend will set; older deployments may omit — frontend treats missing
   *  as 'anthropic' for backwards-compat. */
  provider?: AIProvider;
  /** Whether the model supports image input. */
  vision?: boolean;
  /** Whether the model supports extended thinking (Claude 4 line). */
  thinking?: boolean;
}

export interface AIPromptTemplate {
  id: number;
  name: string;
  icon: string;
  instruction: string;
  requires_selection: boolean;
  replace_mode: 'none' | 'replace' | 'before' | 'after';
  order: number;
  updated_at?: string;
}

export interface AICapabilities {
  configured: boolean;
  providers_configured?: Partial<Record<AIProvider, boolean>>;
  enabled?: boolean;
  operations: AIOperation[];
  models: AIModelOption[];
  default_model: string;
  thinking_enabled?: boolean;
  templates?: AIPromptTemplate[];
  fallback_chain?: Record<string, string[]>;
}

export interface AIAdminSettings {
  default_model: string;
  enabled: boolean;
  max_tokens: number;
  enable_thinking?: boolean;
  fallback_enabled?: boolean;
  daily_budget_usd_per_user?: number;
  updated_at: string | null;
  models: AIModelOption[];
}

export interface AIConversation {
  id: number;
  title: string;
  model: string;
  document_id: number | null;
  message_count: number;
  created_at: string;
  updated_at: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; ts: string }>;
}

export interface AIEstimate {
  model: string;
  estimated_input_tokens: number;
  estimated_output_tokens_cap: number;
  estimated_cost_usd: number;
}

let capCache: { at: number; data: AICapabilities } | null = null;
const CAP_TTL_MS = 5 * 60_000;

export function clearCapabilitiesCache() {
  capCache = null;
}

export async function getAISettings(): Promise<AIAdminSettings> {
  const { data } = await apiClient.get<AIAdminSettings>('/ai/settings/');
  return data;
}

export async function updateAISettings(patch: Partial<AIAdminSettings>): Promise<AIAdminSettings> {
  await ensureCsrf();
  const { data } = await apiClient.patch<AIAdminSettings>('/ai/settings/', patch);
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

// ── Prompt templates CRUD ─────────────────────────────────────────────

export async function listPromptTemplates(): Promise<AIPromptTemplate[]> {
  const { data } = await apiClient.get<AIPromptTemplate[]>('/ai/templates/');
  return data;
}

export async function createPromptTemplate(t: Partial<AIPromptTemplate>): Promise<AIPromptTemplate> {
  await ensureCsrf();
  const { data } = await apiClient.post<AIPromptTemplate>('/ai/templates/', t);
  capCache = null;
  return data;
}

export async function updatePromptTemplate(id: number, patch: Partial<AIPromptTemplate>): Promise<AIPromptTemplate> {
  await ensureCsrf();
  const { data } = await apiClient.patch<AIPromptTemplate>(`/ai/templates/${id}/`, patch);
  capCache = null;
  return data;
}

export async function deletePromptTemplate(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/ai/templates/${id}/`);
  capCache = null;
}

// ── Conversations ─────────────────────────────────────────────────────

export async function listConversations(): Promise<AIConversation[]> {
  const { data } = await apiClient.get<AIConversation[]>('/ai/conversations/');
  return data;
}

export async function getConversation(id: number): Promise<AIConversation> {
  const { data } = await apiClient.get<AIConversation>(`/ai/conversations/${id}/`);
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/ai/conversations/${id}/`);
}

export async function clearAllConversations(): Promise<void> {
  await ensureCsrf();
  await apiClient.delete('/ai/conversations/');
}

// ── Token estimate ────────────────────────────────────────────────────

export async function estimateCost(
  content: string,
  options: { extra?: string; model?: string } = {},
): Promise<AIEstimate> {
  const { data } = await apiClient.post<AIEstimate>('/ai/estimate/', {
    content,
    extra: options.extra || '',
    model: options.model || '',
  });
  return data;
}

// ── Run / Stream / Chat ───────────────────────────────────────────────

export interface AICallOptions {
  extra?: string;
  model?: string;
  images?: string[];            // v0.9.7 vision
  thinking?: boolean;
  document_id?: number | null;
  knowledge_base_id?: number | null;
}

export async function runAI(
  operation: AIOperation,
  content: string,
  options: AICallOptions = {},
): Promise<string> {
  await ensureCsrf();
  const { data } = await apiClient.post<{ operation: string; result: string }>('/ai/run/', {
    operation,
    content,
    extra: options.extra,
    model: options.model,
    images: options.images,
    thinking: options.thinking,
    document_id: options.document_id,
    knowledge_base_id: options.knowledge_base_id,
  });
  return data.result;
}

export interface AIStreamCallbacks {
  onDelta?: (text: string) => void;
  onDone?: () => void;
  onError?: (err: AIErrorPayload) => void;
  signal?: AbortSignal;
}

export type AIStreamOptions = AICallOptions & AIStreamCallbacks;

/** Internal: drive a fetch + ReadableStream + SSE frame parser.
 *  Used by ``streamAI`` (single-shot ops) and ``chatStream`` (multi-turn). */
async function _sseFetch(path: string, body: Record<string, unknown>, opts: AIStreamCallbacks) {
  await ensureCsrf();
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1];
  const base = apiClient.defaults.baseURL || '';
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf || '' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') { opts.onDone?.(); return; }
    opts.onError?.({ code: 'http_error', detail: (e as Error).message });
    return;
  }
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    let code: AIErrorCode = 'http_error';
    let detail = txt || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(txt);
      if (j.code) code = j.code as AIErrorCode;
      if (j.detail) detail = j.detail;
    } catch { /* ignore */ }
    if (res.status === 429 && code !== 'ai_budget_exceeded') code = 'ai_budget_exceeded';
    opts.onError?.({ code, detail, status: res.status });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      if ((e as Error).name === 'AbortError') { opts.onDone?.(); return; }
      opts.onError?.({ code: 'http_error', detail: (e as Error).message });
      return;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
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
        if (evType === 'error') {
          opts.onError?.({
            code: (parsed.code as AIErrorCode) || 'ai_error',
            detail: parsed.detail || 'AI 调用失败',
          });
        } else if (evType === 'done') {
          opts.onDone?.();
        } else if (parsed.delta) {
          opts.onDelta?.(parsed.delta);
        }
      } catch { /* ignore malformed chunks */ }
    }
  }
  opts.onDone?.();
}

export async function streamAI(
  operation: AIOperation,
  content: string,
  options: AIStreamOptions = {},
): Promise<void> {
  return _sseFetch('/ai/stream/', {
    operation,
    content,
    extra: options.extra || '',
    model: options.model || '',
    images: options.images,
    thinking: options.thinking,
    document_id: options.document_id,
    knowledge_base_id: options.knowledge_base_id,
  }, options);
}

export interface ChatStreamOptions extends AIStreamCallbacks {
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  conversation_id?: number;
}

export async function chatStream(message: string, options: ChatStreamOptions = {}): Promise<void> {
  return _sseFetch('/ai/chat/', {
    message,
    history: options.history || [],
    model: options.model || '',
    conversation_id: options.conversation_id,
  }, options);
}

// ── Error code → user-visible Chinese message ─────────────────────────

export function describeAIError(err: AIErrorPayload): { title: string; hint: string } {
  switch (err.code) {
    case 'ai_unavailable':
      return {
        title: '未配置 AI 服务',
        hint: '管理员需要在 .env 添加 ANTHROPIC_API_KEY 或 DASHSCOPE_API_KEY 后重启。',
      };
    case 'ai_disabled':
      return {
        title: 'AI 已被管理员关闭',
        hint: '前往 /admin/ai 重新启用。',
      };
    case 'ai_budget_exceeded':
      return {
        title: '今日额度已用完',
        hint: err.detail || '请明天再用或联系管理员调高每日预算。',
      };
    case 'ai_error':
      return {
        title: 'AI 调用失败',
        hint: err.detail || '上游服务暂时不可用，稍后重试。',
      };
    case 'http_error':
    default:
      return {
        title: '网络异常',
        hint: err.detail || '请检查网络连接。',
      };
  }
}
