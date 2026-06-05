import { describe, expect, it } from 'vitest';
import { buildPlayOrder, quotesToBatchText } from './heroPlayback';
import type { HeroQuote } from '@/api/hero';

const q = (over: Partial<HeroQuote>): HeroQuote => ({
  id: 'x',
  text: '',
  dynasty: '',
  author: '',
  source: '',
  ...over,
});

describe('buildPlayOrder', () => {
  it('sequential returns the identity permutation', () => {
    expect(buildPlayOrder(4, 'sequential')).toEqual([0, 1, 2, 3]);
  });

  it('random returns a valid permutation (every index exactly once)', () => {
    const order = buildPlayOrder(10, 'random');
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('random is deterministic under an injected rng', () => {
    let seed = 42;
    const rng = () => {
      // Tiny LCG — enough to prove the permutation follows the rng.
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const a = buildPlayOrder(6, 'random', rng);
    seed = 42;
    const b = buildPlayOrder(6, 'random', rng);
    expect(a).toEqual(b);
  });

  it('random actually shuffles across page loads (statistically)', () => {
    // 30 shuffles of 8 items: the odds that every one is the identity
    // permutation are (1/8!)^30 ≈ 0 — a stuck shuffle fails this.
    const distinct = new Set(
      Array.from({ length: 30 }, () => buildPlayOrder(8, 'random').join(',')),
    );
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('handles degenerate sizes', () => {
    expect(buildPlayOrder(0, 'random')).toEqual([]);
    expect(buildPlayOrder(1, 'random')).toEqual([0]);
    expect(buildPlayOrder(-3, 'sequential')).toEqual([]);
  });
});

describe('quotesToBatchText', () => {
  it('renders the full 正文 — 〔朝代〕作者 · 篇名 shape', () => {
    const out = quotesToBatchText([
      q({ text: '莫听穿林打叶声', dynasty: '宋', author: '苏轼', source: '定风波' }),
    ]);
    expect(out).toBe('莫听穿林打叶声 — 〔宋〕苏轼 · 定风波');
  });

  it('degrades gracefully when pieces are missing', () => {
    expect(quotesToBatchText([q({ text: 'A', author: '苏轼' })])).toBe('A — 苏轼');
    expect(quotesToBatchText([q({ text: 'A', dynasty: '宋', author: '苏轼' })])).toBe(
      'A — 〔宋〕苏轼',
    );
    expect(quotesToBatchText([q({ text: 'A' })])).toBe('A');
  });

  it('avoids a dangling · when only a source is present', () => {
    expect(quotesToBatchText([q({ text: 'A', source: '论语' })])).toBe('A — 论语');
    expect(quotesToBatchText([q({ text: 'A', dynasty: '周', source: '论语' })])).toBe(
      'A — 〔周〕论语',
    );
  });

  it('skips blank-text rows and joins with newlines', () => {
    const out = quotesToBatchText([
      q({ text: '甲', author: 'a' }),
      q({ text: '   ' }),
      q({ text: '乙', author: 'b' }),
    ]);
    expect(out).toBe('甲 — a\n乙 — b');
  });
});
