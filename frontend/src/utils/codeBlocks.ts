/**
 * Shared metadata + helpers for the Markdown code-block experience.
 *
 * Used by both the Markdown renderer (`utils/markdown.ts`) and the Tiptap
 * NodeView (`components/editor/CodeBlockView.tsx`) so the language list, the
 * "plain" alias, and the highlight invocation stay in sync.
 */
import hljs from 'highlight.js/lib/common';

/** Canonical language list shown in the picker.
 *  ``slug`` is what we store in fenced-code language hints (```{slug}); ``aliases``
 *  matches lowercase user input we may need to accept; ``label`` is the menu text. */
export interface CodeLanguage {
  slug: string;
  label: string;
  aliases?: string[];
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { slug: 'plaintext', label: '纯文本', aliases: ['text', 'plain', 'txt', 'other', ''] },
  { slug: 'bash', label: 'Bash / Shell', aliases: ['sh', 'shell', 'zsh'] },
  { slug: 'c', label: 'C' },
  { slug: 'cpp', label: 'C++', aliases: ['c++', 'cxx'] },
  { slug: 'csharp', label: 'C#', aliases: ['cs'] },
  { slug: 'css', label: 'CSS' },
  { slug: 'diff', label: 'Diff' },
  { slug: 'dockerfile', label: 'Dockerfile', aliases: ['docker'] },
  { slug: 'go', label: 'Go', aliases: ['golang'] },
  { slug: 'graphql', label: 'GraphQL' },
  { slug: 'html', label: 'HTML' },
  { slug: 'ini', label: 'INI / TOML', aliases: ['toml'] },
  { slug: 'java', label: 'Java' },
  { slug: 'javascript', label: 'JavaScript', aliases: ['js', 'mjs', 'cjs'] },
  { slug: 'jsx', label: 'JSX (React)' },
  { slug: 'json', label: 'JSON' },
  { slug: 'kotlin', label: 'Kotlin', aliases: ['kt'] },
  { slug: 'less', label: 'Less' },
  { slug: 'lua', label: 'Lua' },
  { slug: 'makefile', label: 'Makefile', aliases: ['make'] },
  { slug: 'markdown', label: 'Markdown', aliases: ['md'] },
  { slug: 'mermaid', label: 'Mermaid (图表)' },
  { slug: 'plantuml', label: 'PlantUML (图表)', aliases: ['puml', 'uml'] },
  { slug: 'nginx', label: 'Nginx' },
  { slug: 'objectivec', label: 'Objective-C', aliases: ['objc', 'objective-c'] },
  { slug: 'perl', label: 'Perl', aliases: ['pl'] },
  { slug: 'php', label: 'PHP' },
  { slug: 'powershell', label: 'PowerShell', aliases: ['ps', 'ps1'] },
  { slug: 'python', label: 'Python', aliases: ['py'] },
  { slug: 'r', label: 'R' },
  { slug: 'ruby', label: 'Ruby', aliases: ['rb'] },
  { slug: 'rust', label: 'Rust', aliases: ['rs'] },
  { slug: 'scala', label: 'Scala' },
  { slug: 'scss', label: 'SCSS / Sass', aliases: ['sass'] },
  { slug: 'sql', label: 'SQL' },
  { slug: 'swift', label: 'Swift' },
  { slug: 'typescript', label: 'TypeScript', aliases: ['ts'] },
  { slug: 'tsx', label: 'TSX (React)' },
  { slug: 'vbnet', label: 'VB.NET', aliases: ['vb'] },
  { slug: 'xml', label: 'XML' },
  { slug: 'yaml', label: 'YAML', aliases: ['yml'] },
];

/** Dedup the list to satisfy the Select component (slug-based). */
export const UNIQUE_CODE_LANGUAGES: CodeLanguage[] = Array.from(
  new Map(CODE_LANGUAGES.map((l) => [l.slug, l])).values()
);

/** Normalise the user-typed language hint to a canonical slug. */
export function normalizeLanguage(raw: string | null | undefined): string {
  const v = (raw || '').toLowerCase().trim();
  if (!v) return 'plaintext';
  for (const lang of CODE_LANGUAGES) {
    if (lang.slug === v) return lang.slug;
    if (lang.aliases?.includes(v)) return lang.slug;
  }
  // Accept any hljs-registered language even if it's not in our menu (so
  // pasted Markdown like ```haskell still highlights).
  if (hljs.getLanguage(v)) return v;
  return 'plaintext';
}

/** True for graphical code blocks (Mermaid / PlantUML) — they render as a
 *  diagram, not highlighted source, and keep their own per-block appearance
 *  (graphic theme, language) instead of participating in "同步样式到全文". */
export function isDiagramLanguage(raw: string | null | undefined): boolean {
  const canon = normalizeLanguage(raw);
  return canon === 'mermaid' || canon === 'plantuml';
}

/**
 * Map our internal slug to the highlight.js language id. hljs doesn't have
 * dedicated jsx/tsx/xml grammars but its JS/TS/HTML grammars cover them.
 * Mermaid intentionally returns ``null`` — the caller should branch to a
 * graphical renderer instead of trying to highlight.
 */
export function hljsLanguageFor(slug: string): string | null {
  switch (slug) {
    case 'jsx':
      return 'javascript';
    case 'tsx':
      return 'typescript';
    case 'xml':
      return 'xml';
    case 'mermaid':
    case 'plantuml':
    case 'plaintext':
      return null;
    default:
      return slug;
  }
}

/** Friendly display label for a language slug (falls back to the slug itself). */
export function languageLabel(slug: string): string {
  const canon = normalizeLanguage(slug);
  return CODE_LANGUAGES.find((l) => l.slug === canon)?.label ?? canon;
}

/**
 * Run highlight.js on the source. Falls back to a plaintext-escaped block
 * when the language isn't registered, so the renderer never throws.
 *
 * For mermaid we return the escaped raw text — the chrome flips into a
 * "graphical" mode and a runtime enhancer turns it into an SVG.
 */
export function highlightCode(code: string, lang: string): string {
  const canon = normalizeLanguage(lang);
  const hljsLang = hljsLanguageFor(canon);
  if (!hljsLang || !hljs.getLanguage(hljsLang)) {
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language: hljsLang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
