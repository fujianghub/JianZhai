/** Accent tone per insert-menu / slash-menu item — drives colored icon tiles. */
const TONE_BY_ID: Record<string, string> = {
  image: 'emerald',
  attachment: 'amber',
  table: 'sky',
  hyperlink: 'blue',
  quote: 'violet',
  hr: 'slate',
  'code-block': 'indigo',
  'mermaid-picker': 'teal',
  'plantuml-sequence': 'orange',
  mention: 'rose',
  'emoji-trigger': 'amber',
  'link-card': 'blue',
  'doc-card': 'emerald',
  video: 'rose',
  math: 'indigo',
  'math-block': 'indigo',
  'math-inline': 'indigo',
  details: 'violet',
  'columns-2': 'teal',
  'columns-3': 'teal',
  tabs: 'teal',
  toc: 'slate',
  ai: 'violet',
  h1: 'slate',
  h2: 'slate',
  h3: 'slate',
  paragraph: 'slate',
  'bullet-list': 'sky',
  'ordered-list': 'sky',
  'task-list': 'emerald',
  'callout-tips': 'amber',
  'callout-info': 'blue',
  'callout-warning': 'orange',
  'callout-danger': 'rose',
  'callout-success': 'emerald',
};

const TONE_BY_PREFIX: [string, string][] = [
  ['mermaid-', 'teal'],
  ['callout-', 'amber'],
];

export function insertIconToneClass(itemId: string): string {
  let tone = TONE_BY_ID[itemId];
  if (!tone) {
    for (const [prefix, t] of TONE_BY_PREFIX) {
      if (itemId.startsWith(prefix)) {
        tone = t;
        break;
      }
    }
  }
  return `jz-insert-icon--${tone ?? 'slate'}`;
}
