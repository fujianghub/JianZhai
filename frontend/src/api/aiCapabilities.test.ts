/**
 * Phase G 回归：getCapabilities 去重并发请求 + TTL 缓存。
 *
 * AIModelBadge / DocAIPanel / AIAssistant 常同时挂载，挂载即各调一次
 * getCapabilities()。缓存暖之前的并发调用应共享同一个 in-flight promise，
 * 只打一次 /ai/capabilities/。
 */
import { it, expect, vi, beforeEach } from 'vitest';

let getCalls = 0;

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(async () => {
      getCalls += 1;
      // Defer so concurrent callers all land while the request is in flight.
      await new Promise((r) => setTimeout(r, 5));
      return { data: { configured: true, models: [], operations: [], templates: [] } };
    }),
  },
  ensureCsrf: vi.fn(async () => {}),
}));

import { getCapabilities, clearCapabilitiesCache } from './ai';

beforeEach(() => {
  getCalls = 0;
  clearCapabilitiesCache();
});

it('dedupes concurrent in-flight calls into one request', async () => {
  const [a, b, c] = await Promise.all([
    getCapabilities(),
    getCapabilities(),
    getCapabilities(),
  ]);
  expect(getCalls).toBe(1);
  expect(a).toBe(b);
  expect(b).toBe(c);
});

it('serves the TTL cache on subsequent calls', async () => {
  await getCapabilities();
  await getCapabilities();
  expect(getCalls).toBe(1);
});

it('refetches after the cache is cleared', async () => {
  await getCapabilities();
  clearCapabilitiesCache();
  await getCapabilities();
  expect(getCalls).toBe(2);
});
