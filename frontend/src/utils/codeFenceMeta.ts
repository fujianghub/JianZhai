/** Parse / serialize code-fence info line: `python title="Foo" collapsed`. */

export interface CodeFenceMeta {
  language: string;
  title: string;
  collapsed: boolean;
}

export function parseCodeFenceInfo(info: string): CodeFenceMeta {
  const raw = info.trim();
  if (!raw) return { language: '', title: '', collapsed: false };

  const titleMatch = raw.match(/title="((?:\\.|[^"\\])*)"/);
  const collapsed = /\bcollapsed\b/.test(raw);
  const withoutMeta = raw
    .replace(/title="(?:\\.|[^"\\])*"/, '')
    .replace(/\bcollapsed\b/g, '')
    .trim();
  const language = withoutMeta.split(/\s+/g)[0] ?? '';
  const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : '';

  return { language, title, collapsed };
}

export function serializeCodeFenceInfo(
  language: string,
  title?: string | null,
  collapsed?: boolean | null
): string {
  const lang = (language || '').trim();
  const parts: string[] = [];
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
