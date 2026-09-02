/**
 * 图标尺寸阶梯（2026-09-02）。此前 JzIcon 调用点手写 12/13/14/15/16/17/18/20/
 * 22/24/25/26/28/31 共 14 档，只有博客顶栏一个常量。新调用一律取这里：
 *
 *   xs   12  徽标内（AIModelBadge）
 *   sm   14  正文 meta 行 / 小按钮
 *   md   16  工具按钮 / 浮钮
 *   lg   18  菜单项 / 斜杠菜单瓷砖 / AI 面板
 *   xl   20  FAB / 页面级动作
 *   nav  22  博客顶栏导航
 *   tile 24  后台侧栏槽位 / 功能卡
 *   hero 28  一次性展示位
 *
 * JzIconKit 填充族在后台侧栏按源稿留白做光学补偿（±2/±4/+7），以
 * `ICON_SIZE.tile ± n` 就地表达并注释倍率，不进阶梯。
 */
export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  nav: 22,
  tile: 24,
  hero: 28,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZE;
