import { describe, expect, it } from 'vitest';

/** Mirrors 409 handling expectations in DocEditorPage.handleAutoSave. */
function shouldApplyConflictReload(
  status: number | undefined,
  code: string | undefined,
): boolean {
  return status === 409 && code === 'version_conflict';
}

describe('doc editor version conflict', () => {
  it('detects version_conflict from API shape', () => {
    expect(shouldApplyConflictReload(409, 'version_conflict')).toBe(true);
    expect(shouldApplyConflictReload(409, 'other')).toBe(false);
    expect(shouldApplyConflictReload(200, 'version_conflict')).toBe(false);
  });
});
