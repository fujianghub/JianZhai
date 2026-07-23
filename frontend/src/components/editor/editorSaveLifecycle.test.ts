import { describe, expect, it, vi } from 'vitest';
import { flushOnUnmount } from './editorSaveLifecycle';

describe('flushOnUnmount', () => {
  it('emits onChange when live content differs from last emitted', () => {
    const onChange = vi.fn();
    const saveSeqRef = { current: 0 };
    const lastSavedRef = { current: 'saved' };
    const lastEmittedRef = { current: 'old' };

    flushOnUnmount({
      getLiveContent: () => 'new live',
      lastSaved: 'saved',
      onChange,
      saveSeqRef,
      lastSavedRef,
      lastEmittedRef,
    });

    expect(onChange).toHaveBeenCalledWith('new live');
    expect(lastEmittedRef.current).toBe('new live');
  });

  it('fires autosave when live differs from last saved', async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    const saveSeqRef = { current: 0 };
    const lastSavedRef = { current: 'saved' };

    flushOnUnmount({
      getLiveContent: () => 'dirty',
      lastSaved: 'saved',
      onChange: vi.fn(),
      onAutoSave,
      saveSeqRef,
      lastSavedRef,
    });

    await Promise.resolve();
    expect(onAutoSave).toHaveBeenCalledWith('dirty');
  });

  it('skips autosave when live matches last saved', () => {
    const onAutoSave = vi.fn();

    flushOnUnmount({
      getLiveContent: () => 'same',
      lastSaved: 'same',
      onChange: vi.fn(),
      onAutoSave,
      saveSeqRef: { current: 0 },
      lastSavedRef: { current: 'same' },
    });

    expect(onAutoSave).not.toHaveBeenCalled();
  });

  it('flush 失败时把内容备份到 backupKey（不再静默丢失）', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      flushOnUnmount({
        getLiveContent: () => 'dirty content',
        lastSaved: 'saved',
        onChange: vi.fn(),
        onAutoSave: vi.fn().mockRejectedValue(new Error('network down')),
        saveSeqRef: { current: 0 },
        lastSavedRef: { current: 'saved' },
        backupKey: 'jz-draft-backup:1:flush',
      });
      // 等 rejected promise 的 catch 分支跑完
      await new Promise((r) => setTimeout(r, 0));
      const raw = store.get('jz-draft-backup:1:flush');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).content).toBe('dirty content');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('flush 成功时不写备份', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      flushOnUnmount({
        getLiveContent: () => 'dirty',
        lastSaved: 'saved',
        onChange: vi.fn(),
        onAutoSave: vi.fn().mockResolvedValue(undefined),
        saveSeqRef: { current: 0 },
        lastSavedRef: { current: 'saved' },
        backupKey: 'jz-draft-backup:1:flush',
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(store.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
