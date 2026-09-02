import { ariaKeyshortcuts, detectPlatform, formatChord } from '@/shortcuts/format';
import { getChord } from '@/shortcuts/registry';

/**
 * 键帽显示：`<Kbd id="admin.search" />` 或 `<Kbd chord="Mod+K" />`。
 * mac 渲染 `⌘K`（无分隔），其它 `Ctrl` `+` `K`；单套 `.jz-kbd` 样式
 * （此前四套互不相关：工具栏菜单纯文字 / 后台搜索芯片 / 代码块设置芯片 / 正文 kbd）。
 */
export default function Kbd({ id, chord, className }: { id?: string; chord?: string; className?: string }) {
  const c = chord ?? (id ? getChord(id) : '');
  if (!c) return null;
  const platform = detectPlatform();
  const parts = formatChord(c, platform);
  return (
    <kbd className={['jz-kbd', className].filter(Boolean).join(' ')} aria-keyshortcuts={ariaKeyshortcuts(c)}>
      {parts.map((p, i) => (
        <span key={i} className="jz-kbd-key">
          {platform !== 'mac' && i > 0 ? <span className="jz-kbd-sep" aria-hidden>+</span> : null}
          {p}
        </span>
      ))}
    </kbd>
  );
}
