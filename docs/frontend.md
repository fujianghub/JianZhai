# 简斋 · 视觉系统与题记

> 双形态主题、4 套配色、图标体系（三区三语言）、首页题记轮播、favicon/PWA。
> 架构见 [architecture.md](./architecture.md)。

---

## 1. 双形态主题

| 形态 | 作用域 | 风格 |
|------|--------|------|
| 后台 | `.jz-admin-glass` | **Apple 玄黑·玻璃拟态** + 翡翠 `#10b981` 重音；大圆角 14-18px + 颜色偏移柔阴影 + `backdrop-filter: blur` |
| 博客 | `.jz-blog-glass` | 宣纸 `#f3ebd6` + 朱砂 `#b94a3b` 古风（保留 v0.5 前主调） |

> 完整编辑器外壳按入口在 `jz-admin-glass` 或 `jz-blog-glass + jz-doc-shell-blog` 下渲染；编辑器 CSS 须 scope 到共享 `.jz-glass`（见 memory `project_doc_editor_shell_scope`）。

---

## 2. 4 套主题

`stores/theme.ts` 写 `document.documentElement.dataset.theme`：

| `data-theme` | 主调 |
|--------------|------|
| `light` | 宣纸 + 朱砂（默认） |
| `dark` | 玄黑 + 翡翠 |
| `starry` | 星空深紫 |
| `deepsea` | 深海青蓝 |

Mermaid / 代码块 / KaTeX / heatmap 全读 CSS 变量，主题切换不重建组件。

---

## 3. 图标体系（2026-06-06 定稿，100% 自制，hugeicons 已卸载）

三个区域三种视觉语言：

| 区域 | 实现 | 语言 |
|------|------|------|
| **个人空间侧栏** | `JzIconKit.tsx`（15 枚，用户设计稿 SVG） | 0.72 淡染填充、无底座裸放（40px 占位 + 悬停微放大）；同明度多彩 tone（`jz-ico-tone-*` 十色「简斋雅色」+ 暗主题提亮 + starry/deepsea 环境光校准）；尺寸逐枚微调；含「收藏」入口（缃金星形） |
| **博客顶栏** | `JzIcon.tsx` 最初版 v0.9 浅染族 | 归档/标签/搜索/RSS 走 `--jz-icon-fill/spot` 主题变量 + 翡翠 hover；圆角方块底座 + 光泽扫过 |
| **主题切换四枚** | AntD Sun/Moon/Star + 手写 WaveIcon | 初始风格（设计稿版已否决回退） |

`JzIcon.tsx` 共 **50 枚**：24×24 / 1.5px stroke / `currentColor` / linecap round；印泥色彩点 + `--jz-icon-accent-active` hover/选中染色发光。

---

## 4. 题记（首页名句轮播，v0.9.5 / v0.9.10）

### HeroSettings（单例，`apps/accounts/models.py`）

```python
class HeroSettings(models.Model):
    enabled = BooleanField(default=True)       # 首页题记区开关
    quotes = JSONField(default=list)           # 每条 {text, dynasty, author, source}
    animation = CharField(...)                 # fade / slide / typewriter / ink-wash
    play_order = CharField(...)                # random（默认，开页洗牌整轮不重复）/ sequential
    rotation_seconds = PositiveIntegerField(default=8)
```

端点：`GET /public/hero/`（匿名精简，含 `play_order`）、`GET|PATCH /auth/hero/`（员工）、`POST /auth/hero/batch/`（批量导入 `replace`/`append`）。

**批量解析**：强分隔（`—`/`–`/`-`/` by `）优先于弱分隔（`·`/`•`），中文「苏轼 · 定风波」不被拆错；行首 `[朝代]〔朝代〕【朝代】(朝代)` 识别为朝代前缀。

### 渲染与交互

- 古风单行三色 `〔朝代〕作者〈篇名〉` + 「」角标 + 卷尾金线；4 动画两段式 enter/leave 过渡
- **随机播放**：`utils/heroPlayback.ts → buildPlayOrder`（Fisher-Yates）——random 每次开页重新洗牌、整轮不重复
- **悬停暂停**轮播、**点击切下一条**（`.jz-hero-rotator-shell`）
- 管理页 `/admin/hero`（员工，菜单名「题记」）：dnd-kit 整行拖拽排序（把手列 ⠿）、预览卡 ‹ › 翻看、「导出」Modal 反向生成批量导入文本（`quotesToBatchText`，复制 / 下载 .txt）、宣纸纹理预览框

---

## 5. 博客阅读器体验（v0.9.11，2026-06-26）

读者侧（`pages/blog/PostDetail.tsx`）阅读设置收为一条等高 28px 分组工具条胶囊 `.jz-reader-toolbar`，与「编辑」钮同高，四组并排：

| 组 | 组件 | 图标 | 作用 |
|----|------|------|------|
| 字体 | `ReaderFontPicker` | `FontColors` | 正文字体族（`articleFont.ts`） |
| 纸张 | `PaperPicker` | `File` 纸页 | 纸张底纹（`paper.ts`） |
| 排版 | `ReaderLayoutPicker` | — | 字号缩放 / 行距 / 版心宽度 + 一键重置 |
| 专注 | toggle | `Eye` | 沉浸阅读模式 |

- **排版三件套**（`utils/readerLayout.ts`）：字号 5 档 `FONT_SCALE_STEPS` 步进、行距 3 档（紧凑/标准/宽松）、版心 3 档（窄 720 / 适中 860 / 满栏 100%，默认满栏）。落 `localStorage`、以 CSS 变量写在 `<article>` 上 scope 到当前读者视图，**绝不触碰持久化文档**。
- **仅 Markdown 阅读路径消费**：HTML 阅读器在 sandbox iframe 内，父页无法 restyle；二进制预览无正文可缩放。
- **专注模式**：`focusMode` 给 `<body>` 挂 `.jz-reader-focus` 类（样式表据此隐藏导航栏与侧栏），`Esc` 退出，右下角退出 FAB `.jz-focus-exit-fab`。
- 阅读进度条 `ReadingProgressBar` 带百分比读数。

---

## 6. favicon + PWA

- `public/favicon.svg` — 朱砂印章（径向渐变印泥 + 颗粒滤镜 + 四角磨痕 + 双线印框 + 压痕「簡」）
- `public/manifest.webmanifest` + apple-touch-icon + theme-color
- `html / body / #root` 全局 reset margin/padding 铺满整屏

---

## 7. 布局要点

- **完整编辑两栏铺满**（≥1280）：editor `flex:1`、大纲改流内 sticky 右栏、正文限宽 860 居中
- **坑**：`.jz-doc-body` 内联 `flexDirection` 会盖掉 CSS media query，必须删（见 memory `project_doc_editor_fill_layout`）
- vite `manualChunks` 拆 codemirror / tiptap 独立 chunk；懒加载 pdfjs + mammoth（DocAIPanel chunk 2.25MB→660KB）
