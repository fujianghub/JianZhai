/**
 * CSP 纪律：HTML 沙箱宿主页与 Caddy 头的契约。
 *
 * 背景（2026-09-23 实测）：
 * 1. `<iframe srcdoc>` / about:blank / blob: 文档继承父页 CSP，生产站点级
 *    `script-src 'self'` 会拦掉 HtmlPostReader 的高度上报脚本与作者内联脚本。
 * 2. Caddy 站点级 `header {}` 块含 `-Server` 时整块延迟到响应写出才执行，会
 *    覆盖 `handle_path` 内设置的路径级 CSP（线上 `*.svg` 的 sandbox 头因此从未
 *    生效）；站点级改用 `?`（仅未设置时生效）路径级才能赢。
 *
 * 这里锁定：宿主页文件存在且无内联脚本、宿主脚本只认 window.parent、组件
 * 指向该路径、三处渲染入口不再用 srcdoc、Caddyfile 三处头写法正确。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTML_FRAME_URL } from './SandboxedHtmlFrame';

const FRONTEND = resolve(__dirname, '../../..');
const REPO = resolve(FRONTEND, '..');
const read = (p: string) => readFileSync(p, 'utf-8');

describe('HTML sandbox host page', () => {
  const htmlPath = resolve(FRONTEND, 'public', HTML_FRAME_URL.replace(/^\//, ''));
  const jsPath = htmlPath.replace(/\.html$/, '.js');

  it('exists under public/ at the URL the component loads', () => {
    expect(existsSync(htmlPath), htmlPath).toBe(true);
    expect(existsSync(jsPath), jsPath).toBe(true);
  });

  it('has no inline <script> (only the external host script)', () => {
    const html = read(htmlPath).replace(/<!--[\s\S]*?-->/g, '');
    const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/src="\/embed\/html-frame\.js"/);
    expect(scripts[0]).toMatch(/<script[^>]*><\/script>/);
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  it('host script accepts messages from window.parent only and rewrites itself', () => {
    const js = read(jsPath);
    expect(js).toContain('e.source !== window.parent');
    expect(js).toContain("d.type !== 'jz-html-frame'");
    expect(js).toContain('document.open()');
    expect(js).toContain('document.write(d.html)');
    expect(js).toContain("'jz-html-frame-ready'");
  });
});

describe('no srcdoc rendering entry points remain', () => {
  const files = [
    'src/components/blog/HtmlPostReader.tsx',
    'src/components/editor/HtmlEditor.tsx',
    'src/components/editor/LivePreviewPane.tsx',
  ];
  for (const f of files) {
    it(`${f} renders author HTML through SandboxedHtmlFrame`, () => {
      const src = read(resolve(FRONTEND, f));
      expect(src).not.toMatch(/srcDoc=/);
      expect(src).toContain('SandboxedHtmlFrame');
    });
  }
});

describe('infra/Caddyfile CSP layering', () => {
  const caddy = read(resolve(REPO, 'infra/Caddyfile'));

  it('site-level CSP is set-if-absent (?), so path-level policies win', () => {
    expect(caddy).toMatch(/^\s*\?Content-Security-Policy "script-src 'self'/m);
    // exactly one site-level CSP line, and it must be the ``?`` form
    const siteLevel = caddy.match(/^\s*\??Content-Security-Policy "script-src 'self'/gm) ?? [];
    expect(siteLevel).toHaveLength(1);
  });

  it('serves the host page with its own sandboxed policy', () => {
    const block = /handle \/embed\/\* \{[\s\S]*?\n {4}\}/.exec(caddy)?.[0] ?? '';
    expect(block).toContain(
      'header Content-Security-Policy "sandbox allow-scripts allow-popups allow-forms; frame-ancestors \'self\'"',
    );
    expect(block).toContain('file_server');
  });

  it('media: standalone svg + html attachments get a sandbox policy', () => {
    expect(caddy).toContain('header @svg Content-Security-Policy "sandbox"');
    expect(caddy).toMatch(/@html path \*\.html \*\.htm\n\s*header @html Content-Security-Policy "sandbox allow-scripts allow-popups allow-forms"/);
  });
});
