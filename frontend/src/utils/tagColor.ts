/**
 * Stable color derivation for tags whose `color` field is empty.
 */

const PALETTE: readonly string[] = [
  'cyan',
  'geekblue',
  'blue',
  'purple',
  'magenta',
  'green',
  'lime',
  'volcano',
  'red',
  'orange',
  'gold',
  'default',
];

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Map Ant Design preset names to CSS colors for inline --jz-tag-c. */
const PRESET_HEX: Record<string, string> = {
  red: '#f5222d',
  volcano: '#fa541c',
  orange: '#fa8c16',
  gold: '#faad14',
  lime: '#a0d911',
  green: '#52c41a',
  cyan: '#13c2c2',
  blue: '#1677ff',
  geekblue: '#2f54eb',
  purple: '#722ed1',
  magenta: '#eb2f96',
  default: '#8c8c8c',
};

export function resolveTagColor(input: {
  color?: string | null;
  name?: string | null;
  slug?: string | null;
  id?: number | null;
}): string {
  const explicit = (input.color || '').trim();
  if (explicit) return explicit;
  const key = (input.slug || input.name || String(input.id ?? '')).trim();
  if (!key) return 'default';
  return PALETTE[djb2(key) % PALETTE.length];
}

/** CSS color for meta pills / seals (hex or ant preset). */
export function resolveTagCssColor(input: {
  color?: string | null;
  name?: string | null;
  slug?: string | null;
  id?: number | null;
}): string {
  const c = resolveTagColor(input);
  if (c.startsWith('#')) return c;
  return PRESET_HEX[c] ?? PRESET_HEX.default;
}
