# 简斋 · 画板（自托管 draw.io）

> 底座批次 2026-09-24。产品内一律称「画板」（draw.io 商标条款）。上游 Apache-2.0，钉 tag 见 `infra/drawio/VENDOR.md`。
> 决策（用户拍板）：**自托管二次开发、同源 `/drawio/`、`ui=min`、图源 SVG+PNG 双存**（双存在「画板块」批次落地）。

---

## 1. 坐标

| 层 | 位置 | 说明 |
|---|---|---|
| 构建 | `infra/drawio/build.py` | `git clone --depth 1 --branch <tag>` → 裁剪（`TRIM_*`）→ 整文件覆盖（`overrides/`）→ `bootstrap.js` 一处字符串补丁 → `dist/`（gitignore，约 50 MB，`VERSION.json`） |
| 覆盖 | `infra/drawio/overrides/{index.html, js/PreConfig.js, js/PostConfig.js}` | 品牌 / 全局地址 / URL 参数默认 / `DRAWIO_CONFIG` / 关外联 |
| 生产投放 | `infra/docker-compose.prod.yml` caddy 卷 `./drawio/dist:/srv-drawio:ro`；`infra/Caddyfile` `handle_path /drawio/*` | 站点级 CSP 原样；`Cache-Control: public, max-age=3600` + ETag（文件无哈希，勿 immutable） |
| 开发投放 | Vite `/drawio` → Django；`jianzhai/drawio_dev.serve_drawio`（DEBUG）读 `settings.DRAWIO_DIST_DIR`（默认 `infra/drawio/dist`，env 可覆盖） | 未构建时 404 并提示跑 `build.py` |
| 前端协议层 | `frontend/src/utils/drawioEmbed.ts` | `buildDrawioEmbedUrl` / `parseDrawioMessage` / `serializeDrawioAction` / `extractDiagramXmlFromSvg` / `decodeSvgDataUri`，单测 `drawioEmbed.test.ts` |
| 冒烟 | `Test/scripts/drawio_base_smoke.py` | 生产复刻（caddy 容器 + dist + `-v infra/drawio/dist:/srv-drawio:ro`）32 项 + dev 代理 2 项，34/34 |

部署：`python3 infra/drawio/build.py` 本地生成后 `rsync -av infra/drawio/dist/ root@server:/root/jianzhai/infra/drawio/dist/`；compose 卷挂载，caddy 无需重建（Caddyfile 本身的 `handle_path` 块随下次 caddy 镜像重建生效）。

## 2. 为什么不嵌在线、不 vendor、不重编译

- 在线 `embed.diagrams.net` 国内可达但首字节 4–5 s，且用户要求自托管二次开发。
- 上游 webapp 156 MB、约每周一版、不向旧版回移安全修复、不接受外部 PR → 不进 git，改「pin tag + 可重放脚本」；升级 = 改 `PINNED_TAG` 重跑 + 冒烟。
- `src/main/webapp` 就是编译成品（Closure SIMPLE 保留全局名），定制全部走 `PreConfig.js` / `PostConfig.js` / `DRAWIO_CONFIG` / URL 参数 / 插件（运行时 monkey-patch 原型），零源码冲突。需要 JDK+Ant 重编译的只有「把三大包改懒加载」这类，目前不做。
- Mermaid / ELK / libavoid / PlantUML 只有 min.js（源码私有），只能外包一层。

## 3. 运行事实（2026-09-23/24 实测）

- 纯静态可运行；`index.html` 无内联脚本、无 CSP meta；`app.min.js` 的 `eval` 全在 `allowEval=false` 守卫后，`new Function` 仅 globalThis polyfill 与 orgchart（严格 CSP 下 orgchart 布局**可能**失效，未测）。生产站点级 CSP 下 init→load→export 零违规。
- embed 模式默认不加载任何云存储/协作脚本；默认参数与 `offline=1&stealth=1` 两种情况外联请求均为零。
- 首屏 17–25 个文件 22–24 MB（gzip 约 7–9 MB）：`app.min.js` 9.3 MB、`stencils.min.js` 7.4 MB（全部 stencil XML 内置，故 `stencils/` 42 MB 可删）、`extensions.min.js` 3.8 MB；`math=0` 省 MathJax 2 MB。三大包在 `App.js` 启动即加载。
- 导出 `xmlsvg` 的 SVG 根元素 `content="&lt;mxfile…"` 内嵌图源；`Editor.extractGraphModel` 原生识别 `<svg content>`，再编辑时把 SVG 原文作为 `load` 的 `xml` 送回即可。`compressXml:false` 只影响文件保存：embed 导出的 content 属性外层 `<mxfile>` 明文、`<diagram>` 内层仍是 deflate+base64（实测），整体可回读；要明文可在前端用 pako inflate（画板块再议）。
- 中文：`lang=zh` → `resources/dia_zh.txt`（`dx_zh` 是错名）。
- 协议要点：只接受 `evt.source == parent/opener` 的消息、不校验 origin、回包一律 `postMessage(…, '*')`；`configure` 事件仅 URL 带 `configure=1` 时发；`load` 可带 `descriptor:{format:'mermaid', data}` 把 Mermaid 文本转成**原生可编辑图形**（`@drawio/mermaid` 内置解析器，随 extensions 启动加载）——这就是「Mermaid 可视化画图」的实现路径，无反向转换。

## 4. 定制点速查

| 目的 | 位置 |
|---|---|
| 全局地址（BASE/LIGHTBOX/VIEWER/EXPORT） | `PreConfig.js`：从 `location.pathname` 推导指向自身，`EXPORT_URL=null`（PDF 走打印，PNG/SVG 客户端生成） |
| 站点级默认 URL 参数 | `PreConfig.js` `defaults`（调用方显式给出者优先） |
| 字体 / 配色 / 隐藏菜单 / 库 | `PreConfig.js` `DRAWIO_CONFIG`（`Editor.configure` 约 130 键：`defaultFonts customFonts fontCss css hideMenus hideMenuItems defaultLibraries colorNames customColorSchemes defaultVertexStyle …`） |
| 运行时关功能 | `PostConfig.js`（`Editor.enableWebFonts=false`、图标搜索置空、`compressXml` 关、`updateDocumentTitle` 钉死标题——运行时标题不是 index.html 说了算）；深改 `Menus.prototype` 也放这里 |
| 嵌入场景参数 | 前端 `buildDrawioEmbedUrl`（`ui/lang/libraries/noSaveBtn/saveAndExit/math/dark/modified/libs`） |
| 品牌 | `overrides/index.html`、`build.py` `BOOTSTRAP_PATCH`、favicon 复制自 `frontend/public` |

## 5. drawio画板 块（2026-09-24 已实现）

**存储**：正文一行原生 HTML（`utils/drawioEmbed.buildDrawioFigureHtml`）：
`<figure class="jz-drawio" data-jz-drawio="1" data-png="/media/…png"><img src="/media/…svg" alt="drawio画板" /></figure>`。
SVG（`xmlsvg`，根 `content` 内嵌 mxfile，再编辑时原文喂回 `load`）与 PNG（`xmlpng`，2×，DOCX 导出用）均为**本文档 Attachment**（受 `/media` 闸门约束）；导出一律白底。阅读端 / CM6 预览 / HTML·PDF·静态站导出按普通图片渲染零特判；DOMPurify 放行 `data-jz-drawio` `data-png`；DOCX `_emit_html_block` 遇画板 figure 改嵌 `data-png`。

**前端**（`components/editor/drawio/`）：
- `DrawioEditorModal`：portal 到 body 的全屏层（z 13000）+ 同源 `/drawio/` iframe。`init`→父页 `load`（已有画板先 fetch SVG 原文，`autosave:1`）→`load` 撤遮罩→`autosave` 标脏→保存 = export xmlsvg + xmlpng → 两次 `uploadFile(file, documentId)` → `onSaved({src,png})`。**「保存并退出 / 退出」在父页操作条**：`ui=min` 的上游样式把 draw.io 嵌入按钮容器 `.geButtonContainer` 设为 `display:none`（实测 0×0，用户只能 Ctrl+S）；draw.io 内 Ctrl+S 仍发 `save` 走同一路径；有未保存修改时退出弹 Popconfirm（`getPopupContainer` 指向本层）。消息只认 `e.source === iframe.contentWindow`。
- `DrawioBoard`（Tiptap 原子块，`figure[data-jz-drawio]` priority 100 抢在图片节点前；`readDrawioFigure` 只收 `/media/` URL，外链 figure 不成画板）+ `DrawioBoardView`（SVG 预览、悬浮编辑/删除、双击编辑；`insertDrawioBoard` 插入空节点带运行期 `autoOpen`，挂载即开层，未保存就退出则自删——保存后紧接关闭时 node.attrs 仍旧，用 ref 记「有过内容」）。空 `src` 节点序列化丢弃。
- 斜杠 `drawio画板`（`/hb` `/drawio` `/huaban`，快捷插入「画板类」首位，图标 `JzDrawioIcon`）；MD 模式为交互项（`markdownSlashActions` `'drawio'`），保存后在光标处写入独占一段的 figure。

**顺带修复**：`RichTextEditor` 的 value 同步 effect 把**自己 onChange 回流的值**当成服务器回声置为已保存，排在其后的自动保存 effect 因 `value === lastSaved` 跳过——富文本编辑过程中自动保存自 2026-05 首版起从未触发（只靠离页 flush / Ctrl+S 落盘，状态胶囊误显「已同步」）。修 = 仅 `value !== lastEmittedRef` 时才当回声。

**验证**：`drawioEmbed.test` 12 项、`drawio/DrawioBoard.test` 5 项（往返字节稳定、外链 figure 拒收、空节点不落盘、阅读端净化保留属性）、DOCX `test_drawio_board_uses_png_copy`；端到端 `Test/scripts/drawio_board_smoke.py`（dev 栈）29 项：富文本插入→merge 图形→脏退出确认→保存→SVG+PNG 附件→自动存盘→双击回读图源→无改动退出→取消新画板自删→阅读页显示；MD 路径插入与预览。

### 5.1 样式与设置批次（2026-09-24，用户决策：跟随主题 / 旧画板文件直接删 / 支持下载 SVG（只保留画板上的按钮）/ 形状库保持默认）

- **配色跟随主题**：SVG 导出不再传 `background`（**透明底**），draw.io 的导出颜色本就是 `light-dark(浅, 反色)` + 根上 `color-scheme: light dark`（`xmlsvg` 在 settings `darkMode:'auto'` 下默认 theme=auto），于是 `<img>` 里的图随其所在处的 `color-scheme`（站点主题写在 `documentElement`）切换：暗色主题下线条/文字反色、直接落在主题底色上。实测：给 `<img>` 或祖先设 `color-scheme: light` 即恒浅色——「始终浅色」设置就是这条 CSS，不重新导出。PNG 仍白底（仅 DOCX）。灯箱对 `.svg` 图补 `background: Canvas`（系统色随配色方案）。Safari 不把宿主 color-scheme 传进 SVG 图片，恒浅色（上游已知）。
- **每个画板的设置**（节点悬浮「设置」弹层）：配色（跟随主题 / 始终浅色）、尺寸（原始 / 小=半栏 / 满栏）、对齐（左 / 中 / 右）、图注。落在 figure 上：`data-jz-scheme="light"`、`data-jz-size="s|full"`、`data-jz-align="left|right"`、`<figcaption>`，默认值不落属性；**属性名刻意不用 `data-theme`**（站点根元素用它切主题，正文里会被主题选择器误命中）。figure `width: fit-content` 收缩到图片宽度（悬浮操作条贴图片右上角），对齐靠外边距；正文图片全局 `max-height: 70vh`（特异性 0,4,1）对画板用 0,5,2 的规则解除，否则「满栏」被压扁。DOCX 导出居中 + 图注斜体段落。
- **重复三处修复**：① 「原文件」重复预览 = blog/knowledge 两份 `_primary_attachment` 在「正文非空 + 附件全是图片」时退回首个附件 → 改为返回 None（纯图片文档不变），附件排序加 `id` 第二键；② 附件面板按 `drawio画板-<时间>-<随机>` 前缀把 SVG+PNG 合并成一行（`groupAttachmentsForPanel`）；③ 旧画板文件回收 = `apps/editor/services/drawio_gc.py` + `Document` `post_save` 信号 `on_commit`：只动画板文件名、当前 raw 与 published 都不再引用、创建超过 120 s（防刚上传未存盘的新图被误删）→ 经 `media_gc.delete_files` 先删行后删盘。**不为撤销 / 历史版本回滚保留**（用户决策）。
- **下载 SVG**：正文画板悬浮操作条「全屏查看（复用图片灯箱）/ 下载 SVG」（`DrawioBoardEnhancer`，selector+bindKey 范式），文件名 `<文档标题>-画板[N].svg`。起初在底部「原文件」区也放过一份下载列表，与悬浮按钮重复，按用户意见去掉——含画板的文档底部不再出现「原文件」区。**下载一律 fetch→Blob→object URL**：直接 `<a href=/media/… download>` 时 Chromium 忽略 download 名（实测落成存储 uuid 名）。长图折叠增强器跳过画板。
- **编辑器贴合简斋**：按站点主题传 `dark=1/0`（不用 `auto`：iframe 只看系统偏好）；PostConfig 同源读父页 `--jz-accent` / `--jz-bg-app`，映射到 draw.io 的 `--accent-*` `--primary-*` `--dark-accent-*` `--workspace-color`，六主题自动跟随；`DRAWIO_CONFIG` 加 `version:'jz-1'`（改默认必须递增，否则用户浏览器里的 mxSettings 盖掉新默认）、`defaultEdgeStyle`（正交 + 圆角 + 实心箭头）、`hideMenuItems`（embed/help/configuration/generate/exportAnimatedGif/exportJson/exportUrl）；min 主题标签栏的 jgraph/drawio GitHub 图标隐藏（**title 在 `<img>` 上不在 `<a>` 上**，之前的选择器从未命中）。形状库保持 draw.io 默认。
- **起手模板**：新建画板先弹父页模板面板（空白 / 流程图 / 网络拓扑 / 分层架构，`utils/drawioTemplates.ts`，只用内置基础形状），draw.io 同时后台加载；不用 draw.io 自带模板对话框（offline 下入口隐藏、`templates/` 已裁掉）。
- **Mermaid 转画板**：富文本 Mermaid 代码块工具栏「转为 drawio画板」→ 在其后插入画板节点（运行期 `mermaid` 属性）→ 编辑层 `load` 带 `descriptor:{format:'mermaid'}`，draw.io 内置 `@drawio/mermaid` 转成原生可编辑图形（生产 CSP 下实测可用、零违规）→ 保存成功后若紧邻上一块正是同一段 mermaid 源码则删除（「转为」语义），取消则代码块不动。CM6 模式无此入口。
- **验证**：pytest 720（新增 `test_drawio_gc` 9 项、DOCX 图注 1 项）、vitest 957、`drawio_board_smoke.py` dev 与生产复刻均 40/40、`drawio_base_smoke.py` 36/36（含生产 CSP 下 Mermaid 转换）、`html_csp_smoke.py` 31/31。

**已知边界**：SVG 只导当前页（多页图只显示当前页，多页交互查看器 viewer-static 未做）；Safari 下画板恒浅色；未做阅读端「编辑」入口（作者在编辑器里改）；撤销到旧画板或回滚历史版本后，旧图文件可能已被回收而显示为坏图（用户决策接受）。
