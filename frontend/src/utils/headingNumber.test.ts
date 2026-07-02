import { describe, it, expect } from 'vitest';
import { computeHeadingNumbers } from './headingNumber';

describe('computeHeadingNumbers — nested-depth compaction', () => {
  it('matches the Yuque spec example h1,h2,h4,h1 → 1,1.1,1.1.1,2', () => {
    expect(computeHeadingNumbers([1, 2, 4, 1])).toEqual(['1', '1.1', '1.1.1', '2']);
  });

  it('advances sibling counters at the same depth', () => {
    expect(computeHeadingNumbers([1, 2, 2, 1])).toEqual(['1', '1.1', '1.2', '2']);
  });

  it('compacts a skipped intermediate level (h1 then h3)', () => {
    expect(computeHeadingNumbers([1, 3])).toEqual(['1', '1.1']);
  });

  it('handles a realistic multi-section document', () => {
    // h1, h2, h3, h3, h2, h1, h2
    expect(computeHeadingNumbers([1, 2, 3, 3, 2, 1, 2])).toEqual([
      '1',
      '1.1',
      '1.1.1',
      '1.1.2',
      '1.2',
      '2',
      '2.1',
    ]);
  });

  it('starts a document at a deep level without inventing parents', () => {
    expect(computeHeadingNumbers([3, 3, 4])).toEqual(['1', '2', '2.1']);
  });

  it('excludes out-of-range levels and does not open depth for them', () => {
    // Only number h1–h2: an h3 in the middle is skipped entirely.
    expect(computeHeadingNumbers([1, 2, 3, 2], { min: 1, max: 2 })).toEqual([
      '1',
      '1.1',
      '',
      '1.2',
    ]);
  });

  it('returns an empty array for no headings', () => {
    expect(computeHeadingNumbers([])).toEqual([]);
  });
});
