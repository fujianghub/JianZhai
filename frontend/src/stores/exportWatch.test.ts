// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportTask } from '@/api/exports';

vi.mock('@/api/exports', () => ({
  getExport: vi.fn(),
}));

import { getExport } from '@/api/exports';
import {
  DONE_LINGER_MS,
  POLL_MS,
  useExportWatchStore,
  watchExport,
} from './exportWatch';

function mk(id: number, status: ExportTask['status']): ExportTask {
  return {
    id,
    scope: 'doc',
    target_id: 1,
    target_label: `doc-${id}`,
    format: 'pdf',
    status,
    filename: '',
    file_size: 0,
    mime_type: '',
    error: '',
    created_at: '',
    started_at: null,
    completed_at: null,
  };
}

afterEach(async () => {
  // 清空观察池并推一格轮询让 interval 自停，避免状态跨用例泄漏
  useExportWatchStore.setState({ tasks: [] });
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(POLL_MS);
    vi.useRealTimers();
  }
  vi.clearAllMocks();
});

describe('watch / dismiss / merge', () => {
  it('adds tasks, dedupes by id, and dismisses', () => {
    vi.useFakeTimers();
    watchExport(mk(1, 'pending'));
    watchExport(mk(2, 'running'));
    watchExport(mk(1, 'running'));
    expect(useExportWatchStore.getState().tasks.map((t) => t.id)).toEqual([2, 1]);
    useExportWatchStore.getState().dismiss(2);
    expect(useExportWatchStore.getState().tasks.map((t) => t.id)).toEqual([1]);
  });

  it('merge ignores ids the user already dismissed', () => {
    vi.useFakeTimers();
    watchExport(mk(1, 'pending'));
    useExportWatchStore.getState().merge([mk(9, 'done')]);
    expect(useExportWatchStore.getState().tasks.map((t) => t.id)).toEqual([1]);
  });
});

describe('polling lifecycle', () => {
  it('polls active tasks, lands the done state, then auto-dismisses after linger', async () => {
    vi.useFakeTimers();
    vi.mocked(getExport).mockResolvedValue(mk(7, 'done'));
    watchExport(mk(7, 'pending'));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(getExport).toHaveBeenCalledWith(7);
    expect(useExportWatchStore.getState().tasks[0]?.status).toBe('done');
    await vi.advanceTimersByTimeAsync(DONE_LINGER_MS);
    expect(useExportWatchStore.getState().tasks).toHaveLength(0);
  });

  it('keeps the failed capsule until the user closes it', async () => {
    vi.useFakeTimers();
    vi.mocked(getExport).mockResolvedValue(mk(8, 'failed'));
    watchExport(mk(8, 'running'));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(useExportWatchStore.getState().tasks[0]?.status).toBe('failed');
    await vi.advanceTimersByTimeAsync(DONE_LINGER_MS * 2);
    expect(useExportWatchStore.getState().tasks).toHaveLength(1);
  });

  it('survives a transient poll error and keeps the task', async () => {
    vi.useFakeTimers();
    vi.mocked(getExport).mockRejectedValueOnce(new Error('network'));
    watchExport(mk(9, 'running'));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(useExportWatchStore.getState().tasks[0]?.status).toBe('running');
  });
});
