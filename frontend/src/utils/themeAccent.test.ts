// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_ACCENT, readThemeAccent } from './themeAccent';

afterEach(() => {
  document.documentElement.style.removeProperty('--jz-accent');
});

describe('readThemeAccent', () => {
  it('falls back to the default accent when the CSS variable is absent', () => {
    expect(readThemeAccent()).toBe(DEFAULT_ACCENT);
  });

  it('reads --jz-accent from the root element when present', () => {
    document.documentElement.style.setProperty('--jz-accent', '#123456');
    expect(readThemeAccent()).toBe('#123456');
  });
});
