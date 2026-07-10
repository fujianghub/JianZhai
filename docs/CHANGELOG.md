# 简斋 · 版本历史

> 阶段交付记录。日常「坑 / 决策复盘」在 memory（见 `MEMORY.md` 索引）；逐 commit 见 `git log`。

| 阶段 | 内容 |
|---|---|
| **v0.1 MVP** | KB + Folder + Document CRUD + Markdown 编辑器 + 私密/公开切换 + 博客前台 |
| **v0.2 编辑器增强** | Tiptap 富文本、`/` 命令、块拖拽、`@提及` 双向链接、反向链接区 |
| **v0.3 协作辅助** | 历史版本（diff / 回滚）、PG 全文搜索（jieba） |
| **v0.4 导出能力** | 单文档/文件夹/KB 导出，HTML/MD/PDF/DOCX + 整站 zip |
| **v0.5 完善** | 评论、标签云、归档、RSS、移动端适配 |
| **v0.6 AI + 编辑器扩展** | apps/ai、玄黑玻璃后台；MathNode / DetailsBlock / Columns / Tabs / DocCardEmbed / FontSize / Indent / 上下标 / BlockHoverMenu / 图片悬浮工具栏 |
| **v0.7 UI 打磨** | 白边修复、博客 sticky 顶栏 + 卡片质感、4 主题适配、印章 favicon、PWA |
| **v0.8 编辑体验** | 大纲固定 / 全屏退出 / 全屏目录 / 所有编辑模式 AI / 路由 bug |
| **v0.9 视觉系统** | 自制 SVG 图标库 + 双色调彩点 + 主题联动染色 |
| **v0.9.1 维护** | 搜索含标签/评论；链接租户边界；原子 version；AI max_tokens；编辑器竞态修复 |
| **v0.9.2 MD/图表 + 架构** | KaTeX 全链路；Mermaid/PlantUML 默认渲染 + 单击切源码；docN 链接重写；linking 锁修复；AI 服务端长度上限；exporter CSS 线程安全；prod SECRET_KEY 兜底 |
| **v0.9.3 HTML/Mermaid + 安全下载** | HtmlPostReader 懒加载 + 异步元数据 + sessionStorage LRU；Mermaid 全屏 Modal；downloadExport 改原生 a href；`pnpm dev:https`；AI 用量日历热图 + pricing.py |
| **v0.9.5 Hero + 组织** | 首页 Hero 名句轮播（朝代/作者/篇名 + 4 动画 + 批量导入 + `/admin/hero`）；KB 大类分组、文档置顶、收藏夹、多种排序；回收站 UI |
| **v0.9.7 AI 全面增强** | 多供应商（Claude + 通义千问）；自定义模板；多轮对话；视觉输入；扩展思考；每用户日预算（429）；失败降级链；prompt caching；用量归因 + CSV |
| **v0.9.8 部署 + 友邻闸门** | 腾讯云部署套件 `infra/`；`SITE_REQUIRE_LOGIN` 友邻可见闸门（`PublicOrLoginGated`） |
| **v0.9.9 账号体系** | 根管理员分级（不可被禁用/删除）；新建账号邮箱必填；账号自服务（改密码/邮箱/用户名/头像）；KB 上传进度条 + 批量全选 + 颜色选择器 |
| **v0.9.10 题记增强** | 播放顺序可配置（random 默认洗牌）；悬停暂停 + 点击切换；dnd-kit 拖拽排序；导出备份文本；「首页题记」改名「题记」 |
| **图标体系定稿** | 三区三语言：侧栏 `JzIconKit`（15 枚淡染裸放 + tone 十色）；博客顶栏回最初版浅染族；主题四枚回 AntD；PostDetail 全换自制图标，卸载 hugeicons |
| **MD 编辑器换 CM6**（2026-06-07） | MD 源码 textarea → CodeMirror 6（语雀级）；`EditorSurface` 适配层；vite manualChunks 拆 chunk；lang-markdown 懒加载多实例坑 → `resolve.dedupe` + `optimizeDeps.include` 根治 |
| **追赶语雀第二批**（2026-06-07） | 富文本表格单元格底色/文字色 + 条件 HTML 序列化；悬浮行列增删 + grip 选行列/拖动重排；MD Live Preview；表格浮动操作条 |
| **安全复审批次**（2026-06-07） | 六领域复审修复合并 main（a72e516）：TLS 条件硬化、友邻闸门加固、`raw_content` 泄漏封堵、AI 预算调用前预留、iframe 去同源 |
| **编辑器高危修复 + 表格保真**（2026-06-07） | 表格冻结首行/首列（三端 sticky）；`convertLayoutBlocks` 根治 callout 劫持 details/cols/tabs；`.jz-table-wrap` 滚动容器；Mermaid 净化修复 |
| **性能优化 9 Phase**（2026-06-08） | defer 大正文字段；软删复合索引；消除 N+1；AISettings 单例缓存 + 预算 DB 聚合；公开聚合缓存；懒加载 pdfjs+mammoth；富文本打字防抖；静态站流式写盘 |
| **布局 + 导出保真**（2026-06-08） | 完整编辑两栏铺满；Mermaid 离线导出 SVG（headless Chromium + vendored mermaid.min.js） |
| **MD 本地图片打包**（2026-06-13） | 导入 `.md` 的 `![](./images/x.png)` 相对图不再 404；三入口共用 `_bundle_import_entries`（图片→MD 附件 + 改写为 `/media/`）：整文件夹上传 / 两步选择器 / ZIP 导入；`import_local_images` 命令补图 |
| **四角色权限体系 RBAC**（2026-06-21） | 根/管理员/普通用户/匿名（`get_role` 唯一入口 + `IsContentAuthor`/`IsRoot`）；`scope_queryset` 由 owner 隔离改**作者共享单一池**；普通用户=读者；删除分级（删 KB/大类/永久删/清空回收站=仅根）；迁移 0006 降级历史非根超管；权威清单 `docs/permissions.md`。合并 main（e26baf7） |
| **登录三因子 + 滑块验证码**（2026-06-23） | 登录从「用户名+密码」升级为三因子：+ **邮箱匹配**（须等于账号 `User.email`）+ **服务端古风拼图滑块验证码**（`captcha.py` Pillow 程序化生成、6 古风色板×多背景样式随机、经典拼图块、答案存 Redis 一次性、缺口仅由像素传达防脚本）；前端 `SliderCaptcha`（1:1 像素拖拽 + 进度填充）；登录页去 label 紧凑化 + 线条图标焦点高亮 + 整体放大约 120%。无新模型/迁移。合并 main（e3c0a41） |
| **阅读排版定制 + 专注模式**（2026-06-26） | 博客读者侧阅读设置收为分组工具条胶囊（字体/纸张/排版/专注，与编辑钮等高 28px）；**排版三件套**（`readerLayout.ts` + `ReaderLayoutPicker`）字号缩放/行距/版心宽度 + 一键重置，落 localStorage、以 CSS 变量 scope 到 `<article>`、仅 Markdown 阅读路径消费（HTML iframe/二进制预览不参与）；**专注/沉浸阅读模式**隐藏导航栏与侧栏、Esc 退出；阅读进度条加百分比；图标语义化（字体=FontColors、纸张=File、专注=Eye）。纯前端，无后端改动。合并 main（76fb9ad） |
| **默认要求登录**（2026-06-27） | `SITE_REQUIRE_LOGIN` 默认值翻为 `true`：不登录看不到任何文章，访问任意页面直接跳登录页（沿用既有 `PublicOrLoginGated` + `BlogLayout`，无新模型/迁移）；补 `/d/:id`（`DocLinkResolver`）匿名跳登录守卫；测试钉住新默认 + 匿名公开端点用例显式 `override_settings(False)`。`.env` 设 `SITE_REQUIRE_LOGIN=false` 可切回全开放 |
| **用户标签 + KB/大类朋友圈式可见性**（2026-06-27） | **用户标签** `UserTag`（全局共享，反向名 `account_tags` 避让内容标签 `apps/tags`）：`/auth/user-tags/` CRUD + `UserSerializer` `tags`/`tag_ids` + 用户列表按标签/搜索筛选；标签对读者隐藏。**KB/大类三态受众** `audience_mode`（`all`/`exclude`/`include`，默认 `all` 向后兼容）+ `audience_users`/`audience_tags`（按用户+标签定向）：新建 `apps/knowledge/audience.py` 统一收口**全部读者入口**（列表/详情直链/树/归档/RSS/sitemap/相关/反链/收藏/评论），作者（`is_staff`）绕过；文档可见 ⇔ KB 可见且（无大类或大类可见）；匿名白名单不可见、黑名单可见。后端守卫：受众名单含管理员（作者）→ 400（防误触）。前端 `AudienceControl` 复用组件 + `UsersPage` 标签列/筛选/标签管理。迁移 `accounts 0007` / `knowledge 0007`；新增 22 测试 |
| **章节自动编号 + 目录生成（语雀式）**（2026-07-02） | **① 章节编号 = 显示层**：序号不写入 `raw_content`/`published_content`，源码保持干净；共享算法 `utils/headingNumber.ts`（栈压缩，按**嵌套深度**非 markdown 原始级数：`h1→h2→h4 = 1/1.1/1.1.1`），四端复用——阅读器（markdown-it `heading_open` 注入 `<span class="jz-heading-num">` + `TocEntry.numbering`）、CM6 源码（`extensions/headingNumber.ts` widget）、Tiptap 富文本（`HeadingNumber.ts` node decoration `::before`）、大纲/目录面板；每篇文档开关 `Document.heading_numbering`（迁移 `knowledge 0008`）+ 编辑器工具栏 Switch。**② 目录生成**：全文 `[TOC]`（已有）+ 新增 `[TOC:section]` 本节子树目录（`expandTocPlaceholders` 位置感知，复用 `heading_open` 已定锚点 id）；斜杠 `/目录`、`/本节目录` 双端可插。**③ 导入选项**：上传下拉两复选框（章节编号 / 文首插入全文目录）→ `views.py` `_parse_import_options` 落地。**④ 导出端对齐**：`exporter/services/markdown_render.py` 补齐 heading 锚点 + 编号栈 + `[TOC]`/`[TOC:section]` 展开（离线 HTML/PDF/静态站，读 `doc.heading_numbering`）。**⑤ 普通编辑（内联）修复**：`PostInlineEditor` 补编号开关 + 修 raw/published 断层——博客内联「编辑」原只写 `raw_content` 而博客渲染 `published_content`（故意不同步）致内联插的目录/编辑上不了博客；新增 `documentSave.ts` `patchDocumentBody` 一次 PATCH **双写**两字段（`_apply_update` 收两字段只 bump 一次 version）。新增前端 15 + 后端 11 测试 |
| **PPT 缩略图修复 + 备注展示**（2026-07-10） | **① 缩略图变横线修复**（纯前端）：`.jz-pptx-rail` 是有界 flex-column，~90 个缩略图按钮默认 `flex-shrink:1` 在滚动生效前被压扁到 ~4px、`overflow:hidden` 把图裁成一条线——后端数据本身完好；`PptxReader.tsx` 缩略图按钮加 `flexShrink:0` + img 补 `aspectRatio` 根治。**② 新增讲者备注**：原管线只 LibreOffice→PDF→JPEG 光栅化、从不解析 pptx 结构；新增 `python-pptx` 依赖 + `extract_pptx_notes()`（best-effort，失败不拖垮转换，按 index 对齐渲染页、隐藏页漂移则留空）+ `SlideImage.notes` 字段（迁移 `editor 0004`）+ `as_dict` 带出（两序列化器自动生效）；前端 `PptxReader` 主图下方可折叠**备注面板**（工具栏「备注」开关、逐页显示、空页「此页无备注」、可复制、全屏也支持）。**③ 存量回填**：`manage.py backfill_pptx_notes`（只读源文件补 notes、不重新光栅化）。新增后端 4 测试；生产需重建镜像（`python-pptx` 新依赖）+ migrate + `backfill_pptx_notes --all` |

---

> **v1.0 候选**：增量自动保存 / Tiptap lazy rendering / 超大 KB 树分页 / Yjs 协作。
