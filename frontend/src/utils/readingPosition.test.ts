// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyProgress,
  clearReadingPosition,
  loadReadingPosition,
  MAX_ENTRIES,
  pruneOldest,
  saveReadingPosition,
  shouldOfferResume,
  type ReadingPositionMap,
} from './readingPosition';

describe('readingPosition pure logic', () => {
  it('shouldOfferResume only inside the resume band', () => {
    expect(shouldOfferResume(null)).toBe(false);
    expect(shouldOfferResume(undefined)).toBe(false);
    expect(shouldOfferResume(0)).toBe(false);
    expect(shouldOfferResume(0.04)).toBe(false);
    expect(shouldOfferResume(0.05)).toBe(true);
    expect(shouldOfferResume(0.5)).toBe(true);
    expect(shouldOfferResume(0.95)).toBe(true);
    expect(shouldOfferResume(0.96)).toBe(false);
  });

  it('classifyProgress clears at the extremes and saves in between', () => {
    expect(classifyProgress(0)).toBe('clear');
    expect(classifyProgress(0.01)).toBe('clear');
    expect(classifyProgress(0.03)).toBe('save');
    expect(classifyProgress(0.5)).toBe('save');
    expect(classifyProgress(0.97)).toBe('save');
    expect(classifyProgress(0.99)).toBe('clear');
  });

  it('pruneOldest keeps the newest entries only', () => {
    const map: ReadingPositionMap = {};
    for (let i = 0; i < 10; i++) map[`slug-${i}`] = { p: 0.5, t: i };
    const pruned = pruneOldest(map, 3);
    expect(Object.keys(pruned).sort()).toEqual(['slug-7', 'slug-8', 'slug-9']);
  });

  it('pruneOldest is a no-op under the cap', () => {
    const map: ReadingPositionMap = { a: { p: 0.5, t: 1 } };
    expect(pruneOldest(map, 5)).toBe(map);
  });
});

describe('readingPosition storage round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads a position per slug', () => {
    saveReadingPosition('hello-world', 0.42);
    expect(loadReadingPosition('hello-world')).toBeCloseTo(0.42);
    expect(loadReadingPosition('other')).toBeNull();
  });

  it('clears the entry when progress falls outside the save band', () => {
    saveReadingPosition('post', 0.5);
    expect(loadReadingPosition('post')).toBeCloseTo(0.5);
    // Scrolled back to top → treated as "not started".
    saveReadingPosition('post', 0.0);
    expect(loadReadingPosition('post')).toBeNull();
    // Read to the end → treated as finished.
    saveReadingPosition('post', 0.5);
    saveReadingPosition('post', 0.99);
    expect(loadReadingPosition('post')).toBeNull();
  });

  it('clearReadingPosition removes only the given slug', () => {
    saveReadingPosition('a', 0.3);
    saveReadingPosition('b', 0.6);
    clearReadingPosition('a');
    expect(loadReadingPosition('a')).toBeNull();
    expect(loadReadingPosition('b')).toBeCloseTo(0.6);
  });

  it('bounds the map at MAX_ENTRIES, evicting the oldest', () => {
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      saveReadingPosition(`slug-${i}`, 0.5, 1000 + i);
    }
    // Oldest entries evicted…
    expect(loadReadingPosition('slug-0')).toBeNull();
    expect(loadReadingPosition('slug-9')).toBeNull();
    // …newest retained.
    expect(loadReadingPosition(`slug-${MAX_ENTRIES + 9}`)).toBeCloseTo(0.5);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('jz-reading-pos:v1', '{not json');
    expect(loadReadingPosition('x')).toBeNull();
    saveReadingPosition('x', 0.5);
    expect(loadReadingPosition('x')).toBeCloseTo(0.5);
  });
});
