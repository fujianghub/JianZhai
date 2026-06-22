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

---

> **v1.0 候选**：增量自动保存 / Tiptap lazy rendering / 超大 KB 树分页 / Yjs 协作。
