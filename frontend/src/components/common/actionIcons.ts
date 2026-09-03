/**
 * 动作图标语义层（2026-09-02）。
 *
 * 全站「同一动作多种画法」的收敛点：关闭曾有 CloseOutlined / × / ✕ 三种，复制
 * 有 CopyOutlined / ⧉ / 内联 SVG，文字颜色在富文本用 BgColors 而 CM6 浮条用
 * FontColors，批注与「包裹为色块」在同一条气泡菜单共用 CommentOutlined……
 *
 * 决策：动作类图标以 AntD 为底（现状主力，~600 处），自制 Jz 线稿只守导航 /
 * 品牌 / 斜杠菜单 / AI 位。新代码请引用这里的语义别名而非直接 import AntD，
 * 这样换图标只改一处。innerHTML 面（无 React）用 `utils/actionIconSvg`。
 *
 * 语义边界（勿再混用）：
 *   - ExportIcon = 导出（文件/笔记）；OpenInNewIcon = 在新标签打开
 *   - TextColorIcon = 文字颜色；HighlightColorIcon = 底色/高亮
 *   - CommentIcon = 批注/评论；「包裹为色块」用 JzCalloutIcon（插入语义守 Jz）
 *   - RestoreIcon = 回收站恢复 / 版本回滚；UndoIcon = 编辑器撤销
 *   - FullscreenIcon = 全屏/放大查看；CropIcon = 图片裁剪（曾误用 Expand）
 *   - BookOutlined 仅用于 EPUB 书签（KB 面包屑用 JzBookIcon，EPUB 附件种类用 ReadOutlined）
 */
export {
  CloseOutlined as CloseIcon,
  CopyOutlined as CopyIcon,
  DownOutlined as CaretIcon,
  EllipsisOutlined as MoreIcon,
  HolderOutlined as DragHandleIcon,
  FullscreenOutlined as FullscreenIcon,
  FullscreenExitOutlined as FullscreenExitIcon,
  ScissorOutlined as CropIcon,
  RollbackOutlined as RestoreIcon,
  UndoOutlined as UndoIcon,
  RedoOutlined as RedoIcon,
  ExportOutlined as ExportIcon,
  SelectOutlined as OpenInNewIcon,
  FontColorsOutlined as TextColorIcon,
  BgColorsOutlined as HighlightColorIcon,
  CommentOutlined as CommentIcon,
  DeleteOutlined as DeleteIcon,
  DownloadOutlined as DownloadIcon,
  SearchOutlined as SearchIcon,
  SettingOutlined as SettingsIcon,
  LinkOutlined as LinkIcon,
  SafetyOutlined as ShieldIcon,
  WarningOutlined as WarningIcon,
} from '@ant-design/icons';
/** 当前选中 / 已完成 记号（菜单、标签）。 */
export { CheckOutlined as CheckIcon } from '@ant-design/icons';
