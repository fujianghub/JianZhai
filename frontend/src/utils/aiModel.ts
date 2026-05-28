import { getCapabilities, type AICapabilities } from '@/api/ai';

export const AI_MODEL_KEY = 'jz-ai-model';

/** Resolve stored user preference against server whitelist; fallback to server default. */
export function resolveAIModel(cap: AICapabilities, stored?: string | null): string {
  const pick = stored ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(AI_MODEL_KEY) : null);
  const allowed = new Set((cap.models || []).map((m) => m.id));
  if (pick && allowed.has(pick)) return pick;
  return cap.default_model;
}

/** Is the model's underlying provider configured (env var present)? Lets the UI
 *  flag picks that will fail at runtime BEFORE the user submits an AI call.
 *  Falls back to `cap.configured` (legacy boolean) when the per-provider map
 *  isn't present — older backends will continue to behave as before. */
export function isModelConfigured(cap: AICapabilities, modelId: string): boolean {
  const model = cap.models?.find((m) => m.id === modelId);
  const provider = model?.provider;
  if (!provider || !cap.providers_configured) return cap.configured;
  return Boolean(cap.providers_configured[provider]);
}

export function readAIModelFromStorage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AI_MODEL_KEY);
}

export function writeAIModel(id: string): void {
  localStorage.setItem(AI_MODEL_KEY, id);
  window.dispatchEvent(new CustomEvent('jz-ai-model-changed'));
}

/** Fetch capabilities and resolve the model id for API calls. */
export async function getResolvedAIModelId(): Promise<string> {
  const cap = await getCapabilities();
  return resolveAIModel(cap);
}
