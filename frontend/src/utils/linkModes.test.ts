import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/docs', () => ({
  getDocumentPreview: vi.fn(),
}));
vi.mock('@/api/linkPreview', () => ({
  getLinkPreview: vi.fn(),
}));

import { getDocumentPreview } from '@/api/docs';
import { getLinkPreview } from '@/api/linkPreview';
import {
  browseHref,
  canonicalHref,
  classifyHref,
  fetchTitleForHref,
  isBareUrlText,
} from './linkModes';

const ORIGIN = 'https://www.jianzhai.site';

describe('classifyHref', () => {
  it('recognises doc: protocol', () => {
    expect(classifyHref('doc:12')).toEqual({ kind: 'doc', id: 12 });
  });

  it('recognises site-relative /d/:id (with optional trailing slash)', () => {
    expect(classifyHref('/d/34')).toEqual({ kind: 'doc', id: 34 });
    expect(classifyHref('/d/34/')).toEqual({ kind: 'doc', id: 34 });
  });

  it('recognises origin-absolute /d/:id', () => {
    expect(classifyHref(`${ORIGIN}/d/56`, ORIGIN)).toEqual({ kind: 'doc', id: 56 });
  });

  it('keeps foreign-origin /d/ paths external', () => {
    const href = 'https://other.example.com/d/56';
    expect(classifyHref(href, ORIGIN)).toEqual({ kind: 'external', url: href });
  });

  it('classifies plain http(s) URLs as external', () => {
    expect(classifyHref('https://github.com', ORIGIN)).toEqual({
      kind: 'external',
      url: 'https://github.com',
    });
  });

  it('classifies mailto / anchors / garbage as other', () => {
    expect(classifyHref('mailto:a@b.com').kind).toBe('other');
    expect(classifyHref('#section-1').kind).toBe('other');
    expect(classifyHref('').kind).toBe('other');
  });
});

describe('canonicalHref / browseHref', () => {
  it('canonicalises internal docs to doc:ID', () => {
    expect(canonicalHref(classifyHref(`${ORIGIN}/d/7`, ORIGIN))).toBe('doc:7');
    expect(canonicalHref(classifyHref('/d/7'))).toBe('doc:7');
  });

  it('keeps external urls verbatim', () => {
    expect(canonicalHref(classifyHref('https://a.com/x?q=1', ORIGIN))).toBe('https://a.com/x?q=1');
  });

  it('browseHref maps doc → /d/ID and external → url', () => {
    expect(browseHref(classifyHref('doc:9'))).toBe('/d/9');
    expect(browseHref(classifyHref('https://a.com', ORIGIN))).toBe('https://a.com');
  });
});

describe('isBareUrlText', () => {
  it('accepts bare urls and doc refs', () => {
    expect(isBareUrlText('https://github.com')).toBe(true);
    expect(isBareUrlText(' https://github.com ')).toBe(true);
    expect(isBareUrlText('doc:12')).toBe(true);
    expect(isBareUrlText('/d/12')).toBe(true);
  });

  it('rejects prose, multi-word text and empties', () => {
    expect(isBareUrlText('看这个 https://github.com')).toBe(false);
    expect(isBareUrlText('GitHub')).toBe(false);
    expect(isBareUrlText('')).toBe(false);
    expect(isBareUrlText('https://a.com https://b.com')).toBe(false);
  });
});

describe('fetchTitleForHref', () => {
  beforeEach(() => {
    vi.mocked(getDocumentPreview).mockReset();
    vi.mocked(getLinkPreview).mockReset();
  });

  it('resolves doc titles via getDocumentPreview', async () => {
    vi.mocked(getDocumentPreview).mockResolvedValue({ title: '我的文档' } as never);
    await expect(fetchTitleForHref('doc:3', ORIGIN)).resolves.toBe('我的文档');
    expect(getDocumentPreview).toHaveBeenCalledWith(3);
  });

  it('resolves external titles via getLinkPreview', async () => {
    vi.mocked(getLinkPreview).mockResolvedValue({ title: 'GitHub' } as never);
    await expect(fetchTitleForHref('https://github.com', ORIGIN)).resolves.toBe('GitHub');
  });

  it('returns null on fetch failure / empty title / other kinds', async () => {
    vi.mocked(getLinkPreview).mockRejectedValue(new Error('403'));
    await expect(fetchTitleForHref('https://x.com', ORIGIN)).resolves.toBeNull();
    vi.mocked(getLinkPreview).mockResolvedValue({ title: '  ' } as never);
    await expect(fetchTitleForHref('https://x.com', ORIGIN)).resolves.toBeNull();
    await expect(fetchTitleForHref('mailto:a@b.com', ORIGIN)).resolves.toBeNull();
  });
});
