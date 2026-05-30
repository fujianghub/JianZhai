/**
 * ``downloadExport`` must trigger a same-origin native ``<a href>`` click
 * (not a ``fetch + blob URL`` cycle). Chrome 122+ blocks blob downloads on
 * insecure-context origins (LAN-IP HTTP); the native click survives that
 * gate. This test pins the implementation to the native path so a future
 * refactor doesn't silently regress the user-visible "下载不安全" warning.
 *
 * Runs in the project's Node-flavoured Vitest environment — we stub the
 * minimum bits of ``document``/``window`` the implementation touches so
 * we don't need to pull jsdom into devDependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeAnchor {
  tagName: string;
  href: string;
  download: string;
  rel: string;
  clicked: boolean;
}

let lastAnchor: FakeAnchor | null = null;
let fetchCalled = false;

function installDocumentStub() {
  lastAnchor = null;
  fetchCalled = false;
  const fakeDoc = {
    createElement: (tag: string) => {
      const anchor: FakeAnchor = {
        tagName: tag.toUpperCase(),
        href: '',
        download: '',
        rel: '',
        clicked: false,
      };
      lastAnchor = anchor;
      return {
        ...anchor,
        set href(v: string) {
          anchor.href = v;
        },
        get href() {
          return anchor.href;
        },
        set download(v: string) {
          anchor.download = v;
        },
        get download() {
          return anchor.download;
        },
        set rel(v: string) {
          anchor.rel = v;
        },
        get rel() {
          return anchor.rel;
        },
        click() {
          anchor.clicked = true;
        },
        remove() {
          /* no-op */
        },
      };
    },
    body: { appendChild: () => {} },
  };
  (globalThis as Record<string, unknown>).document = fakeDoc;
  (globalThis as Record<string, unknown>).fetch = async () => {
    fetchCalled = true;
    return { ok: true, blob: async () => new Blob([]) };
  };
}

describe('downloadExport', () => {
  beforeEach(() => {
    installDocumentStub();
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('triggers a native <a href> click instead of fetch+blob', async () => {
    const { downloadExport } = await import('./exports');
    downloadExport({
      id: 42,
      scope: 'doc',
      target_id: 100,
      target_label: 'Some Doc',
      format: 'pdf',
      status: 'done',
      filename: 'some-doc.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
      error: '',
      created_at: '2026-05-30T00:00:00Z',
      started_at: '2026-05-30T00:00:00Z',
      completed_at: '2026-05-30T00:00:05Z',
    });
    expect(lastAnchor).not.toBeNull();
    expect(lastAnchor?.tagName).toBe('A');
    expect(lastAnchor?.clicked).toBe(true);
    expect(lastAnchor?.href).toContain('/exports/42/download/');
    expect(lastAnchor?.download).toBe('some-doc.pdf');
    expect(lastAnchor?.rel).toBe('noopener');
    // Crucially, fetch must NOT have been called.
    expect(fetchCalled).toBe(false);
  });

  it('falls back to a generated filename when task.filename is empty', async () => {
    const { downloadExport } = await import('./exports');
    downloadExport({
      id: 7,
      scope: 'kb',
      target_id: 1,
      target_label: 'KB 1',
      format: 'site',
      status: 'done',
      filename: '',
      file_size: 0,
      mime_type: 'application/zip',
      error: '',
      created_at: '2026-05-30T00:00:00Z',
      started_at: null,
      completed_at: null,
    });
    expect(lastAnchor?.download).toBe('export-7');
  });
});
