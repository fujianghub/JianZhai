import { describe, expect, it } from 'vitest';
import { htmlEditorPanesClass } from './HtmlEditor';

describe('htmlEditorPanesClass', () => {
  it('applies --split only when both preview is permitted and user picked split', () => {
    expect(htmlEditorPanesClass(true, 'split')).toContain('jz-html-editor-panes--split');
  });

  it('does NOT apply --split when host disabled preview (regression: source pane left half-width with empty right when localStorage had "split")', () => {
    const cls = htmlEditorPanesClass(false, 'split');
    expect(cls).toBe('jz-html-editor-panes');
    expect(cls).not.toContain('--split');
  });

  it('does not apply --split for edit-only or preview-only modes', () => {
    expect(htmlEditorPanesClass(true, 'edit')).toBe('jz-html-editor-panes');
    expect(htmlEditorPanesClass(true, 'preview')).toBe('jz-html-editor-panes');
  });

  it('keeps base class regardless of inputs', () => {
    expect(htmlEditorPanesClass(false, 'edit')).toContain('jz-html-editor-panes');
    expect(htmlEditorPanesClass(true, 'split')).toContain('jz-html-editor-panes');
  });
});
