# draw.io 自托管底座（简斋 · 画板）

- 上游：https://github.com/jgraph/drawio （Apache-2.0，见产物内 `LICENSE.drawio`）
- 钉定 tag：**`v31.4.6`**（2026-09-16 发布）——`build.py` 的 `PINNED_TAG`
- 产物：`infra/drawio/dist/`（gitignore，约 50 MB；`VERSION.json` 记录 tag / 文件数 / 字节）
- 生产：compose 把 `./drawio/dist` 只读挂到 caddy `/srv-drawio`，Caddyfile `handle_path /drawio/*` 直出（站点级 CSP 原样，`Cache-Control: public, max-age=3600` + ETag）；部署前 `rsync -av infra/drawio/dist/ root@server:/root/jianzhai/infra/drawio/dist/`
- 开发：Vite `/drawio` 代理到 Django，`jianzhai/drawio_dev.serve_drawio` 在 DEBUG 下服务同一目录（`settings.DRAWIO_DIST_DIR`）
- 前端协议层：`frontend/src/utils/drawioEmbed.ts`（URL 构造 / 消息解析 / SVG 图源提取）

## 为什么这样做

- 不嵌在线 diagrams.net：国内可达但首字节 4–5 s，且用户决策是自托管 + 二次开发。
- 不把 webapp vendor 进 git：156 MB、上游约每周发版且不向旧版回移安全修复。`build.py` 从 tag 克隆 → 裁剪 → 整文件覆盖，升级 = 改 `PINNED_TAG` 重跑 + 冒烟。
- 不重编译：`src/main/webapp` 里 `app.min.js` 等就是上游提交的成品（Closure SIMPLE，全局名保留），定制走 `PreConfig.js` / `PostConfig.js` / `DRAWIO_CONFIG` / URL 参数，与上游零冲突。真要改源码（如把 `stencils.min.js` 改懒加载）才需要 JDK + Ant（`etc/build/build.xml`，Closure 在仓库内）。
- 同源 `/drawio/`（用户决策）：iframe 不加 sandbox，postMessage 零跨域问题；代价是 draw.io 代码与父页同权——所以必须钉 tag、不引入上游之外的脚本。

## 裁剪清单（`build.py` `TRIM_*`，运行时以 Playwright 网络日志核实）

| 删除 | 原因 |
|---|---|
| `WEB-INF/`、`connect/` | Java servlet / Atlassian 描述符 |
| `js/diagramly/`、`js/grapheditor/`、`mxgraph/src/`、`shapes/`、`stencils/` | 源码，均已编进 `app.min.js` / `shapes-14-6-5.min.js` / `stencils.min.js` |
| `templates/`、`plugins/` | `offline=1` 隐藏模板对话框；`plugins=0` |
| `js/dropbox onedrive jquery simplepeer`、`js/integrate.min.js`（22 MB） | 云存储 / 协作 / Confluence 包 |
| `service-worker.js`、`workbox-*` | `pwa=0`，且自托管默认不注册 |
| `resources/` 只留 `dia.txt dia_zh.txt dia_zh-tw.txt` | 其它 58 种语言 |
| `teams.html dropbox.html vsdxImporter.html github.html gitlab.html onedrive3.html open.html clear.html export3.html monday-app-association.json`、`META-INF/` | 集成 / OAuth 回调 / 导出服务器页、war 清单 |

保留：`js/app.min.js`（9.3 MB）、`js/stencils.min.js`（7.4 MB）、`js/extensions.min.js`（3.8 MB，含 @drawio/mermaid + ELK + libavoid + orgchart）、`js/shapes-14-6-5.min.js`、`js/viewer-static.min.js`（HTML 导出/lightbox 引用）、`math4/`（`math=1` 时懒加载）、`img/`（形状库引用的 SVG）、`images/`、`styles/`、`mxgraph/css+images`。首屏实测加载 17 个文件约 22 MB（gzip 约 7 MB）；三大包在 `App.js` 启动即加载，无法靠参数省掉。

## 覆盖与补丁（`overrides/` 整文件；`build.py` 一处字符串补丁）

| 文件 | 内容 |
|---|---|
| `index.html` | 去 draw.io 品牌 / SEO / canonical / manifest（商标条款），标题「简斋 · 画板」，无内联脚本；脚本引用与样式块同上游 |
| `js/PreConfig.js` | `DRAWIO_BASE_URL/LIGHTBOX_URL/VIEWER_URL` 从当前路径推导指向自身、`EXPORT_URL=null`、URL 参数默认 `offline stealth plugins=0 pwa=0 math=0 isGoogleFontsEnabled=0 lang=zh`（调用方显式给出者优先）、`DRAWIO_CONFIG`（系统字体表含中文、`compressXml:false`（只影响文件保存；embed 导出的 SVG `content` 属性外层 `<mxfile>` 明文、`<diagram>` 内层仍 deflate+base64，整体可回读）、`enableAi:false`、隐藏页脚） |
| `js/PostConfig.js` | 置空图标搜索服务、`Editor.enableWebFonts=false`、`Editor.compressXml/defaultCompressed=false`、`appName` 与 `EditorUi/App.prototype.updateDocumentTitle` 钉死标题「简斋 · 画板」（运行时会把标题改成「… - draw.io app」） |
| `bootstrap.js` 补丁 | `<meta application-name>` 由 `diagrams.net` 改「简斋画板」（锚点变了脚本会报错停下） |
| `favicon.ico` | 复制 `frontend/public/favicon.ico` |

## 升级步骤

1. 改 `PINNED_TAG` → `python3 infra/drawio/build.py --force`（脚本校验 `VERSION` 文件与 tag 一致；bootstrap 补丁锚点缺失会中止）。
2. `diff` 上游 `src/main/webapp/index.html` / `js/PreConfig.js` / `js/PostConfig.js` 与 `overrides/`，看上游是否新增了必须保留的引用或全局。
3. 跑 `Test/scripts/drawio_base_smoke.py`（生产复刻：头、协议 init→load→export、零外联、零 CSP 违规、中文 UI、裁剪生效）。
4. rsync `infra/drawio/dist/` 到服务器，caddy 无需重建（卷挂载）。

## 已知边界

- 组织架构图布局用了 `new Function`，严格 CSP 下可能失效（未测）；`sketch` 主题拉 Google 手写体，不要用。
- SVG 只导出当前页；多页图需约定单页或记录 `pageId`。
- `<img>` 里的 SVG 用读者系统字体，与页面 `@font-face` 无关。
- 商标：产品内一律称「画板」，不用 draw.io 名称与 logo；stencil / 模板附加限制只针对 Atlassian 生态。
