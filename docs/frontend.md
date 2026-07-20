# 简斋 · 视觉系统与题记

> 双形态主题、6 套配色（含 2 个环境氛围主题）、图标体系（三区三语言）、首页题记轮播、favicon/PWA。
> 架构见 [architecture.md](./architecture.md)。

---

## 1. 双形态主题

| 形态 | 作用域 | 风格 |
|------|--------|------|
| 后台 | `.jz-admin-glass` | **Apple 玄黑·玻璃拟态** + 翡翠 `#10b981` 重音；大圆角 14-18px + 颜色偏移柔阴影 + `backdrop-filter: blur` |
| 博客 | `.jz-blog-glass` | 宣纸 `#f3ebd6` + 朱砂 `#b94a3b` 古风（保留 v0.5 前主调） |

> 完整编辑器外壳按入口在 `jz-admin-glass` 或 `jz-blog-glass + jz-doc-shell-blog` 下渲染；编辑器 CSS 须 scope 到共享 `.jz-glass`（见 memory `project_doc_editor_shell_scope`）。

---

## 2. 6 套主题

`stores/theme.ts` 写 `document.documentElement.dataset.theme`（`MODES` 含 `colorScheme` 亮色集合，新增亮色主题须入集合否则原生控件误判暗色）：

| `data-theme` | 主调 | 形态 |
|--------------|------|------|
| `light` | 宣纸 + 朱砂（默认） | 亮色 |
| `dark` | 玄黑 + 翡翠 | 暗色 |
| `starry` | 星空深紫（Canvas 星场） | 暗色·氛围 |
| `deepsea` | 深海青蓝（Canvas 海底） | 暗色·氛围 |
| `springwater` | 春水澄碧（**ogl WebGL 水面 shader** + Canvas 花瓣层） | 亮色·氛围 |
| `wintersnow` | 雪青冷蓝（Canvas 飘雪 + 积雪累积） | 亮色·氛围 |

Mermaid / 代码块 / KaTeX / heatmap 全读 CSS 变量，主题切换不重建组件。

> **切换器**：`ThemeSwitcher.tsx` 为**单按钮 + 下拉菜单**（六项，触发钮图标按主题专属色调、当前项打勾），取代旧「4 宫格 Segmented + 主题色 Popover」。**用户自选 accent preset 体系已删除**（`stores/theme.ts` 不再有 `AccentPreset`/`ACCENT_PRESETS`/`accent`/`setAccent`，`applyToDocument` 只写 `data-theme` + `colorScheme`），调色全交 CSS token；`main.tsx` 的 AntD `colorPrimary` 按 mode 取固定色（`MODE_ACCENT`，须等于该主题 `--jz-accent`，light/dark 回退翡翠）。

### 环境氛围层（4 个氛围主题）

- **2D Canvas**（`ambientCanvas.ts` 脚手架：DPR/rAF/隐藏暂停/reduced-motion 单帧/指针滚动视差 + `flow/curl/fbm/noise/makeGlowSprite/makeBokehSprite/makeNoiseTile/drawFilmGrain/drawVignette` 工具）：`StarryNight` / `DeepSea` / `WinterSnow`。
- **WebGL fragment shader**（`shaderCanvas.ts` 的 ogl 全屏 hook + `waterShader.ts` GLSL）：`SpringWater` 水面 —— 平静水的真实感（角度依赖的天空反射/菲涅尔/连续法线/太阳光带）是 2D canvas 的能力天花板，故用 shader；花瓣/涟漪/柳絮仍走 2D 叠加层。**依赖 `ogl`（~15KB，GLSL 内联为 TS 字符串，未引 vite-plugin-glsl）**。
- `App.tsx` 在路由外无条件挂载四者，各自按 `data-theme` 自判激活。
- **亮色氛围主题（春水/冬雪）的玻璃面**须在 `theme.css` 覆盖 `.jz-glass` 的硬编码翡翠重音，否则卡片/登录/后台整体泛绿（基样 `.jz-glass` 把 `--jz-accent` 写死为 `#02b377`）。

### 主题适配自查清单（新增组件/页面照此核对）

非默认主题（尤其 starry/deepsea/春水/冬雪）「染绿」的根因永远是**写死的 accent 色绕过了 token**。规律：

1. **「重音」一律走 token**：组件主色、hover 边框/光晕、激活态渐变 → `var(--jz-accent)` / `var(--jz-accent-soft)` / `var(--jz-gold)`，**禁止**写死 `rgba(16,185,129,…)` / `#02b377` / `#10b981` / `#06d6a0`。半透明用 `color-mix(in srgb, var(--jz-accent) N%, transparent)`（与 `rgba(c, 0.N)` 渲染等价）。
2. **`var(--jz-accent, #10b981)` 的 fallback 无害**：token 永有值，fallback 永不触发，无需改。
3. **保持写死的三类**：① 语义色（成功绿 `#10b981`/`.is-success`、错误红、批注琥珀 `#f59e0b`）跨主题恒定；② 图标多彩色板（`jz-ico-tone-*`、`#059669` 等）是固定调色盘；③ 刻意的页面识别色（架构总览 hero 的青蓝 `rgba(58,110,165)`、AI hero 的紫罗兰）。
4. **代码块深底 `#282c34`/`#1f2329` 是有意设计**：六主题统一深底（含默认 light），勿改成跟随主题。
5. **暖宣纸**（`paper-rice/kraft/parchment`）在 `.jz-blog-glass` 已 `!important` 中性化；但**后台编辑器预览**（`.jz-admin-glass`）会露暖色，新增亮色主题须在 `paper.css` 补冷调变体。
6. **亮色集合**：新增亮色主题必须加入 `stores/theme.ts` 的 `LIGHT_MODES`（`colorScheme: light`）+ `main.tsx` 的 `MODE_ACCENT`（喂 AntD `colorPrimary`，须等于该主题 `--jz-accent`），否则原生控件/AntD 算法误判暗色。

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

### 图片双击放大（`useImageLightbox.ts`，2026-07-17）

正文图片**双击**（`dblclick`）开全屏遮罩：滚轮缩放 / 拖拽平移 / `Esc` / 点背景关闭，工具栏样式复用图表全屏。接入 4 个渲染面：`PostDetail`(`.jz-post-article`)、`LivePreviewPane`(`.jz-doc-live-preview`)、`PublicAttachmentPreview`(`.jz-att-md`)、`FilePreview`(`.jz-file-preview-md`)；`reader.css` 的 `cursor:zoom-in` 提示覆盖全部面。纯判定抽在 `shouldOpenLightbox()`（跳过 `<a>` 内图片与 `data-no-lightbox`），便于单测。

> ⚠️ **必须用 `selector`+`bindKey` 范式，勿退回 `containerRef` 依赖**：ref 对象引用恒稳，`useEffect(deps=[containerRef])` 只跑一次；而 `PostDetail` 在文章异步加载完成前先 `return <Spin/>`，首次挂载时 `ref.current` 还是 `null` → effect 早退且**永不重绑**，点击委托从未绑上（此 bug 曾致图片预览长期完全不生效且无人察觉）。现依赖 `[selector, bindKey]`，正文落地即重绑，与 `TableEnhancer`/`CodeBlockEnhancer` 同构。**任何"等异步内容渲染后再绑 DOM 事件"的 hook 都照此办理。**

### 卡片水合（`CardEnhancer.tsx`，2026-07-20）

阅读端 `[[link-card:URL]]` / `[[doc-card:ID]]` 由 `convertBlockPlaceholders` 先渲染为**静态壳**（外链卡=域名+URL；文档卡=`📄 文档卡片 #ID`），再由 `components/common/CardEnhancer.tsx` 按登录态水合：

- `div[data-jz-link-card]` → `getLinkPreview`（后端 OG 抓取，已放宽 `PublicOrLoginGated`）填 favicon/站名/标题/描述；匿名 401/闸门 403/网络失败 → **保持静态壳**优雅降级
- `div[data-jz-doc-card]` → `resolvePublicById` 换真实标题 + 升级 `href` 为 `/posts/:slug`；草稿/不可见解析失败保持原样
- **selector+bindKey 范式**（同上节 lightbox 教训），接入 `PostDetail`(`.jz-post-article`) 与 `LivePreviewPane`(`.jz-doc-live-preview`)；`data-jz-hydrated` 防重复请求
- 水合后复用编辑器 `.jz-link-card-shell` 样式族（tiptap.css 全局加载）；静态壳样式 `a.jz-link-card-static`

### PDF 阅读器（`PdfCanvas.tsx` / `PdfTocPanel.tsx`，2026-06-27）

附件为 PDF 时博客/作者阅读页用 pdf.js 自渲，关键能力：

- **目录侧栏**：`utils/pdfOutline.ts` 解析 PDF 内嵌书签（named / explicit dest → 页码，含 6 单测），渲染为侧栏（样式复用 MD 文档 `.jz-toc`）。
- **整页连续滚动**（`scroll="page"`）：去掉旧的单页固定框 + 上/下页按钮，连续纵向渲染（`IntersectionObserver` 懒渲染 + 占位 slot），铺进文档流随整窗滚动，工具栏吸顶常驻、目录侧栏 sticky；首帧不自动跳转以免越过文章头。
- **适宽 / 适页高**切换；`devicePixelRatio` 限幅防大图爆内存。
- **在新标签打开**：工具栏与阅读页头部各有按钮，跳浏览器原生 PDF 阅读器；预览走同源代理（修 HTTPS dev 下 `Failed to fetch`）。

### PPT 阅读器（`PptxReader.tsx`，有道云式，2026-07-04 / 07-10）

附件为 `.pptx` 时用该阅读器；后端转换管线（LibreOffice→JPEG + 缩略图 + 讲者备注 + 转换状态）见 [editor.md §8](./editor.md#8-office-文档导入--阅读word-一体化--ppt-有道云式)。前端要点：

- **布局**：左侧缩略图导轨 `.jz-pptx-rail` + 中间全分辨率主图 + 工具栏（页码 / 缩放 / 备注 / 全屏）+ 键盘导航（←/→、PageUp/Down、Esc 退全屏）。缩略图轨用 `thumb_url`、主图才拉全分辨率。
- **缩略图变横线修复**（纯前端，后端数据完好）：`.jz-pptx-rail` 是有界 flex-column，~90 个缩略图按钮默认 `flex-shrink:1` 在 `overflowY` 滚动生效前被压扁到 ~4px、`overflow:hidden` 再把 84px 图裁成一条线 → 缩略图按钮加 **`flexShrink:0`** + img 补 `aspectRatio`（防慢加载瞬间塌陷），交给导轨自身滚动。
- **讲者备注面板**：主图下方可折叠面板，工具栏「备注」开关（`showNotes`），逐页显示 `slide.notes`，空页显「此页无备注」，可复制，全屏亦支持；无任一页有备注时隐藏开关（`hasAnyNotes`）。
- **转换态轮询**：`slides` 为空时按 `slide_status` 轮询（`MAX_POLLS` ~7min，覆盖 worker 2×180s soffice+pdftoppm 超时），`failed` 即停并显真实原因，pending 放宽到硬上限。`PptxReader` 带 `key`（postId）防失败态跨文章粘连。

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
