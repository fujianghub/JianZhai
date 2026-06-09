/** Parse / serialize code-fence info line: `python theme=yuque-light title="Foo" collapsed`. */

export interface CodeFenceMeta {
  language: string;
  title: string;
  collapsed: boolean;
  /** Per-block source-highlighting theme id. Empty = inherit global default. */
  theme: string;
}

export function parseCodeFenceInfo(info: string): CodeFenceMeta {
  const raw = info.trim();
  if (!raw) return { language: '', title: '', collapsed: false, theme: '' };

  const titleMatch = raw.match(/title="((?:\\.|[^"\\])*)"/);
  const themeMatch = raw.match(/\btheme=([A-Za-z0-9-]+)/);
  const collapsed = /\bcollapsed\b/.test(raw);
  const withoutMeta = raw
    .replace(/title="(?:\\.|[^"\\])*"/, '')
    .replace(/\btheme=[A-Za-z0-9-]+/, '')
    .replace(/\bcollapsed\b/g, '')
    .trim();
  const language = withoutMeta.split(/\s+/g)[0] ?? '';
  const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : '';
  const theme = themeMatch ? themeMatch[1] : '';

  return { language, title, collapsed, theme };
}

export function serializeCodeFenceInfo(
  language: string,
  title?: string | null,
  collapsed?: boolean | null,
  theme?: string | null
): string {
  const lang = (language || '').trim();
  const parts: string[] = [];
  if (theme?.trim()) parts.push(`theme=${theme.trim()}`);
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
