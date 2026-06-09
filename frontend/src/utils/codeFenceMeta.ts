/** Parse / serialize code-fence info line: `python theme=yuque-light title="Foo" collapsed`. */

export interface CodeFenceMeta {
  language: string;
  title: string;
  collapsed: boolean;
  /** Per-block source-highlighting theme id. Empty = inherit global default. */
  theme: string;
  /** Per-diagram Mermaid graphic palette (default/neutral/forest/dark/base).
   *  Empty = follow the document theme. Stored as ``mtheme=`` so it never
   *  collides with the ``theme=`` source-highlighting token. */
  mermaidTheme: string;
}

export function parseCodeFenceInfo(info: string): CodeFenceMeta {
  const raw = info.trim();
  if (!raw) return { language: '', title: '', collapsed: false, theme: '', mermaidTheme: '' };

  const titleMatch = raw.match(/title="((?:\\.|[^"\\])*)"/);
  const themeMatch = raw.match(/\btheme=([A-Za-z0-9-]+)/);
  const mthemeMatch = raw.match(/\bmtheme=([A-Za-z0-9-]+)/);
  const collapsed = /\bcollapsed\b/.test(raw);
  const withoutMeta = raw
    .replace(/title="(?:\\.|[^"\\])*"/, '')
    .replace(/\bmtheme=[A-Za-z0-9-]+/, '')
    .replace(/\btheme=[A-Za-z0-9-]+/, '')
    .replace(/\bcollapsed\b/g, '')
    .trim();
  const language = withoutMeta.split(/\s+/g)[0] ?? '';
  const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : '';
  const theme = themeMatch ? themeMatch[1] : '';
  const mermaidTheme = mthemeMatch ? mthemeMatch[1] : '';

  return { language, title, collapsed, theme, mermaidTheme };
}

export function serializeCodeFenceInfo(
  language: string,
  title?: string | null,
  collapsed?: boolean | null,
  theme?: string | null,
  mermaidTheme?: string | null
): string {
  const lang = (language || '').trim();
  const parts: string[] = [];
  if (theme?.trim()) parts.push(`theme=${theme.trim()}`);
  if (mermaidTheme?.trim()) parts.push(`mtheme=${mermaidTheme.trim()}`);
  if (title?.trim()) {
    parts.push(`title="${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  if (collapsed) parts.push('collapsed');
  if (!parts.length) return lang;
  return lang ? `${lang} ${parts.join(' ')}` : parts.join(' ');
}

export function escapeFenceAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
