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
});
