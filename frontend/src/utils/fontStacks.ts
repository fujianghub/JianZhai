/**
 * 字体栈唯一 JS 侧来源 —— 与 `styles/tokens.css` 的 `--jz-font-*` 令牌
 * 逐字一致（由 `fontStacks.test.ts` 读 tokens.css 做字符串断言锁定）。
 *
 * 使用准则（见 CLAUDE.md 字体约定）：
 * - 能落进 DOM 的（inline style / css-in-js / CM6 EditorView.theme）
 *   一律直接写 `'var(--jz-font-*)'`，不要引这里的常量；
 * - 离开 DOM 的场景（canvas ctx.font、mermaid 生成的可导出 SVG）用
 *   {@link resolveFontVar} 解析成实值字符串；
 * - 会持久化进文档内容的（Tiptap FontFamily mark 写入保存的富文本）
 *   用这里的实值常量 —— 导出的 HTML/PDF 离开站点后 var() 无意义。
 */

export const FONT_STACK_SERIF =
  "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'Cormorant Garamond', Georgia, serif";

export const FONT_STACK_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif";

export const FONT_STACK_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const FONT_STACK_DISPLAY =
  "'LXGW WenKai Screen', 'Kaiti SC', 'STKaiti', 'KaiTi', 'Noto Serif SC', 'Songti SC', serif";

export const FONT_STACK_KAI =
  "'Kaiti SC', 'STKaiti', 'KaiTi', 'LXGW WenKai Screen', 'Ma Shan Zheng', serif";

export const FONT_STACK_SERIF_EN = "'Cormorant Garamond', 'EB Garamond', Georgia, serif";

export const FONT_STACK_DECOR =
  "'ZCOOL XiaoWei', 'LXGW WenKai Screen', 'Noto Serif SC', 'Songti SC', serif";

export const FONT_STACK_EMOJI =
  "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', -apple-system, BlinkMacSystemFont, sans-serif";

/** 文楷领衔的阅读预设栈（阅读器/编辑器「文楷」项专用，非 tokens 令牌）。 */
export const FONT_STACK_WENKAI =
  "'LXGW WenKai Screen', 'Kaiti SC', 'STKaiti', 'KaiTi', serif";

/** 阅读器 Verdana / Georgia 预设栈（仅 articleFont.ts 消费，非 tokens 令牌）。 */
export const FONT_STACK_VERDANA_READER =
  'Verdana, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export const FONT_STACK_GEORGIA_READER =
  'Georgia, "Cormorant Garamond", "EB Garamond", "Noto Serif SC", "Songti SC", serif';

/** tokens.css `--jz-font-*` ↔ JS 常量对照表（一致性测试的数据源）。 */
export const FONT_TOKEN_MAP: Record<string, string> = {
  '--jz-font-serif': FONT_STACK_SERIF,
  '--jz-font-sans': FONT_STACK_SANS,
  '--jz-font-mono': FONT_STACK_MONO,
  '--jz-font-display': FONT_STACK_DISPLAY,
  '--jz-font-kai': FONT_STACK_KAI,
  '--jz-font-serif-en': FONT_STACK_SERIF_EN,
  '--jz-font-decor': FONT_STACK_DECOR,
  '--jz-font-emoji': FONT_STACK_EMOJI,
};

/**
 * 把 CSS 字体令牌解析为实值字符串，供离开 DOM 的消费者
 * （canvas、可导出 SVG）使用；SSR/测试环境回退到传入的常量。
 */
export function resolveFontVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
