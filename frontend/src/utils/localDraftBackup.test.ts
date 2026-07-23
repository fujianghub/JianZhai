import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraftBackup,
  draftBackupKey,
  loadDraftBackup,
  saveDraftBackup,
} from './localDraftBackup';

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    _store: store,
  };
}

describe('localDraftBackup', () => {
  let ls: ReturnType<typeof mockLocalStorage>;

  beforeEach(() => {
    ls = mockLocalStorage();
    vi.stubGlobal('localStorage', ls);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draftBackupKey 按 (docId, scene) 组键', () => {
    expect(draftBackupKey(42, 'raw')).toBe('jz-draft-backup:42:raw');
  });

  it('save → load 往返（含时间戳）', () => {
    const key = draftBackupKey(1, 'flush');
    saveDraftBackup(key, '未保存内容');
    const got = loadDraftBackup(key);
    expect(got?.content).toBe('未保存内容');
    expect(typeof got?.at).toBe('number');
  });

  it('同键覆盖为最近一份', () => {
    const key = draftBackupKey(1, 'raw');
    saveDraftBackup(key, '第一份');
    saveDraftBackup(key, '第二份');
    expect(loadDraftBackup(key)?.content).toBe('第二份');
  });

  it('clear 后 load 返回 null；坏 JSON 返回 null', () => {
    const key = draftBackupKey(1, 'raw');
    saveDraftBackup(key, 'x');
    clearDraftBackup(key);
    expect(loadDraftBackup(key)).toBeNull();
    ls.setItem(key, '{broken');
    expect(loadDraftBackup(key)).toBeNull();
  });

  it('localStorage 不可用时不抛（兜底失败不打断保存主流程）', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota');
      },
      getItem: () => {
        throw new Error('nope');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    });
    expect(() => saveDraftBackup('k', 'v')).not.toThrow();
    expect(loadDraftBackup('k')).toBeNull();
    expect(() => clearDraftBackup('k')).not.toThrow();
  });
});
