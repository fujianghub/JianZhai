import { describe, expect, it } from 'vitest';
import { isModelConfigured, resolveAIModel } from './aiModel';
import type { AICapabilities } from '@/api/ai';

function cap(over: Partial<AICapabilities> = {}): AICapabilities {
  return {
    configured: true,
    enabled: true,
    operations: [],
    default_model: 'claude-opus-4-7',
    models: [
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', hint: '', provider: 'anthropic' },
      { id: 'qwen-max', label: '通义千问 Max', hint: '', provider: 'qwen' },
    ],
    providers_configured: { anthropic: true, qwen: true },
    ...over,
  };
}

describe('isModelConfigured', () => {
  it('returns true when the model provider is configured', () => {
    expect(isModelConfigured(cap(), 'claude-opus-4-7')).toBe(true);
    expect(isModelConfigured(cap(), 'qwen-max')).toBe(true);
  });

  it('returns false when the model provider is NOT configured', () => {
    const c = cap({ providers_configured: { anthropic: true, qwen: false } });
    expect(isModelConfigured(c, 'qwen-max')).toBe(false);
  });

  it('regression: switching to Qwen without DASHSCOPE_API_KEY surfaces "未配置"', () => {
    // Reproduces the original bug: badge was silently changing to a model whose
    // provider had no API key, then runtime failed. Now `isModelConfigured`
    // flags it preemptively.
    const c = cap({ providers_configured: { anthropic: true, qwen: false } });
    expect(isModelConfigured(c, 'qwen-max')).toBe(false);
    expect(isModelConfigured(c, 'claude-opus-4-7')).toBe(true);
  });

  it('falls back to cap.configured when providers_configured is absent (legacy backend)', () => {
    const c: AICapabilities = {
      configured: true,
      enabled: true,
      operations: [],
      default_model: 'claude-opus-4-7',
      models: [{ id: 'claude-opus-4-7', label: '', hint: '' }],
      // no providers_configured map (older backend)
    };
    expect(isModelConfigured(c, 'claude-opus-4-7')).toBe(true);

    const c2 = { ...c, configured: false };
    expect(isModelConfigured(c2, 'claude-opus-4-7')).toBe(false);
  });

  it('falls back to cap.configured when the model has no provider field', () => {
    const c = cap({
      models: [{ id: 'x', label: 'X', hint: '' }],
      providers_configured: { anthropic: true, qwen: false },
    });
    expect(isModelConfigured(c, 'x')).toBe(true); // cap.configured=true override
  });
});

describe('resolveAIModel', () => {
  it('returns the stored preference when it is in the whitelist', () => {
    expect(resolveAIModel(cap(), 'qwen-max')).toBe('qwen-max');
  });

  it('falls back to cap.default_model when stored is missing from the whitelist', () => {
    expect(resolveAIModel(cap(), 'deprecated-model-id')).toBe('claude-opus-4-7');
  });
});
