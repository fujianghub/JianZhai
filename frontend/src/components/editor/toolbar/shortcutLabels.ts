/**
 * 兼容薄壳——键位显示已收口到 `src/shortcuts/format.ts`（平台探测 + 格式化）。
 * 旧消费者（HeadingBlockDropdown / MoreMarksDropdown）零改动；新代码直接用
 * `formatShortcut(id)` / `withShortcut(label, id)` / `<Kbd id=…>`。
 */
import { detectPlatform, formatChordText } from '@/shortcuts/format';

export function modKey(): string {
  return detectPlatform() === 'mac' ? '⌘' : 'Ctrl';
}

export function altModShortcut(digit: string): string {
  return formatChordText(`Alt+Mod+${digit}`);
}
