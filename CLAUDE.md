# 简斋 / JianZhai — AI 开发指南

> 个人知识库 + 公开博客一体化系统（双形态合一）。
> 本文是给 AI 助手的**操作手册**：项目坐标 + 怎么干活 + 不可违背的不变量 + 深度参考指针。
> 完整实现细节在 `docs/`（按需 Read，**勿全量内联**）；历史坑/决策在 memory（`MEMORY.md` 索引）。

---

## 项目坐标

- **Monorepo**：`backend/`（Django 5.2 + DRF 3.15，Python 3.12，端口 **8002**）+ `frontend/`（React 18 + TS 5 + Vite 5 + AntD 5，端口 **3001**）
- **`Test/`**：本地测试文档目录（对应知识库 **Test**，slug `test`，KB id 48），存放复现/验证用的 docx/md/pptx 样本；与 `Local_to_Cloud_Server_kb_sysnc.py`（本地→云内容同步脚本）均 gitignore 不入库，勿提交
- **部署**：本地单机 `localhost`；生产腾讯云 Docker Compose + Caddy（套件在 `infra/`）
- **核心理念**：**一份内容两形态** —— `raw_content`（私人笔记）+ `published_content`（发布版）
- **四角色 RBAC**：根 root / 管理员 admin（作者）/ 普通用户 user（读者）/ 匿名 anon。**作者共享单一内容池**，读者只读博客 + 收藏 + 评论 + 资料。权威清单 → `docs/permissions.md`
- **博客形态**：**默认友邻可见**（需登录，匿名访问任何页面直接跳登录页）；`SITE_REQUIRE_LOGIN=false` 可切回全开放（匿名）

---

## 技术栈（版本敏感项）

| 层 | 选型 | 备注 |
|---|---|---|
| 后端 Web | Django 5.2 + DRF 3.15 | Session + DRF SessionAuthentication；登录三因子（密码 + 邮箱匹配 + 服务端滑块验证码） |
| DB / 缓存 / 队列 | PostgreSQL 14+（tsvector + jieba）· Redis 5+（django-redis）· Celery 5.4 | |
| 编辑器内核 | **Tiptap 3**（富文本）+ **CodeMirror 6**（MD 源码）+ textarea（HTML） | 统一以 Markdown 持久化 |
| 渲染/图表 | KaTeX 0.16 · markdown-it · Mermaid 11 · PlantUML · lowlight | |
| AI | `anthropic` SDK（Claude）+ `openai` SDK 兼容（通义千问 DashScope） | 多供应商，任一未配优雅降级 |
| 导出 | Playwright（PDF）· python-docx · Jinja2（静态站） | |
| 前端状态/HTTP | Zustand（auth/theme）· Axios（`api/client.ts`） | |

> 非版本敏感的库清单（UI 拖拽、diff、dompurify 等）查 `package.json` / `pyproject.toml`，不在本文维护。

---

## 怎么干活

- **后端测试用 `pytest`，不是 `manage.py test`**；前端 `pnpm test` + `tsc`
- **改 `backend/.env` 后必须完全重启 Django**（不热加载）
- 本机 dev 三件套（backend/celery/frontend）由 **systemd 自启**；pg/redis docker 自启
- **勿在主 dev server 运行时于同一 `frontend/` 另起共用缓存的 vite/vitest** —— 会致 `.vite` 缓存 desync → 编辑器 `useRef-null` / `@codemirror/state` 多实例崩溃（验证用带 `JZ_API_PROXY_TARGET` 的独立 `cacheDir` 实例）
- 启动/部署细节 → `docs/deployment.md`

---

## 不可违背的不变量

1. **内容池 = 角色制共享**：`scope_queryset` 按 `is_staff` 放行（作者看到/可编辑**全部**共享内容，普通用户/匿名空集），**不再按 owner 隔离作者之间**；`field` 参数残留但不过滤。改任何内容查询/写守卫（含 `serializers._assert_owned`、`blog._kb_can_manage`）务必遵守。
2. **删除分级**：软删文档/文件夹 = 作者（`IsContentAuthor`）；**删 KB / 删大类 / 永久删(purge) / 清空回收站 = 仅根（`IsRoot`）**。
3. **读者例外**：收藏 / 评论端点**故意绕过**作者 scope，按博客可见性取公开文档 —— **勿改回 scope**。
4. **乐观并发**：PATCH / 发布版 PATCH / `publish` / `unpublish` 可带 `expected_version`；服务端事务内 `select_for_update` 校验，冲突 **409 + 文档快照**。
5. **双向链接**：`linking/tasks` 仅接受**同 owner 且未软删**目标；`sync_document_links` 对源文档 `select_for_update` 并把**锁结果赋值给本地变量**（否则取锁即丢），bulk_create 全程 atomic。
6. **导出目录**：`exports/` 刻意**不在 `media/` 下**（否则被 Caddy 公开 `/media/*` 绕过鉴权服出）；backend + celery 须共享命名卷 `exports_data:/app/exports`，否则下载 404。
7. **友邻闸门**：所有 `/api/v1/public/*` 经 `PublicOrLoginGated`；`SITE_REQUIRE_LOGIN` **默认 `true`**（匿名 403 + 前端跳登录页），设 `false` 才放开匿名。前端 `BlogLayout` 与 `DocLinkResolver`(`/d/:id`) 均按此重定向。
8. **AI Key 仅后端 `.env`，前端永不持有**；所有调用走 `apps/ai/` 代理。
9. **登录三因子**：`/api/v1/auth/login/` = 用户名+密码 + **邮箱匹配**（须等于该账号 `User.email`，去空格不区分大小写；无邮箱旧账号跳过）+ **服务端拼图滑块验证码**（`apps/accounts/captcha.py`，Pillow 程序化生成、答案存 Redis 一次性 TTL 120s、缺口仅由像素传达）。先验滑块 → 再验密码/邮箱；任一错统一 401/400 **不泄露是哪项**。取题端点 `GET /auth/captcha/`（独立 `captcha` 限流 30/min；登录仍 `login` 10/min）。前端拖拽**严格 1:1 像素**（改画布尺寸要同步、勿用 CSS scale/zoom 否则对不齐）。无新模型/迁移。
10. **读者受众可见性（朋友圈式）**：KB 与大类各有 `audience_mode`（`all`/`exclude`/`include`，默认 `all` 向后兼容）+ `audience_users`/`audience_tags`（按用户 + `UserTag` 定向）。`apps/knowledge/audience.py` 的 `visible_documents/visible_kbs/visible_categories` 是**唯一收口点**——所有读者入口（blog `_published_qs`、公开 KB/大类、收藏、评论；search 是作者专属无需收口）都必须经它过滤，新增读者入口务必接入，否则直链/搜索泄露。**作者（`is_staff`）一律绕过**（可见性仅对读者）；文档可见 ⇔ KB 可见且（无大类或大类可见）；匿名白名单不可见、黑名单可见。序列化器禁止把作者加入受众名单（`validate_audience_user_ids` → 400）。用户标签 `UserTag` 反向名是 **`account_tags`**（`User.tags` 已被内容标签 `apps/tags` 占用）。**2026-07-24 起该收口点执行两道闸取 AND**：内容侧受众（本条上述）+ **用户侧阅读授权白名单 `accounts.ReadGrant`**（四粒度：整 KB / 整大类 / 文件夹含子树 / 单篇文档；空条目=不受限向后兼容，有条目=白名单；staff 绕过且序列化器拒设、软删目标 fail-closed；folder/doc 授权的宿主 KB+大类保持可导航）；文档计数类聚合须用 `grant_documents_q` 收敛（blog `_post_count_annotation`），否则受限读者看到全量篇数；权威规格 → `docs/permissions.md` §8。

---

## 关键陷阱（详见 memory）

- **Vite dev 缓存 desync** → 编辑器 `useRef-null` / CM 多实例崩溃。**不是代码 bug**；根治 = `systemctl restart jianzhai-frontend.service` + 浏览器 hard-reload。勿在主 server 运行时另起共用缓存的 vite。
- **Tiptap 表格保真**：带色/表级样式表条件序列化为原生 HTML（含 `.jz-table-wrap` + `data-jz-*`），无色保持干净 GFM；**docx 导出彩色/间距会丢**（已知限制）。
- **MD 本地图片导入**：须拖**整个含 `.md` 的文件夹**（图片随上传一起交给后端打包，浏览器沙箱读不了硬盘）；旧文档缺图用 `manage.py import_local_images` 补。
- **导入整组发送 ↔ 文件数上限耦合**：`planUploadChunks` 对「文本文档+图片」同顶层目录**整组一个请求**发送（相对图路径改写的前提），故 `settings.py` 显式 `DATA_UPLOAD_MAX_NUMBER_FILES=1000`（Django 默认 100 曾把 HCIE 级大文件夹整组 400 拒收，`TooManyFilesSent` 只进后端日志不落响应明细）；改任一侧须对照另一侧。导入失败明细仅存在于接口响应 `errors`（后端不落日志），前端经 `notifyImportResult` 弹 notification 展示。图片与文本同组导入时按设计转为文档附件**不单独成篇**；单独图片走「一图一篇」（`doc_format:image`）。
- **AI 日预算对端点流量失效** = 「AI 仅作者 + 管理员绕过预算」两条规格的预期后果，非 bug。
- **博客内联「普通编辑」双写**：博客渲染 `published_content`，而 `raw_content` 自动保存**故意不同步**到 published（`_apply_update` 注释；`get_published_content` 不回退 raw）。故内联编辑（`PostInlineEditor`）走 `patchDocumentBody` **一次 PATCH 双写** raw+published（version 只 +1），否则内联的编辑/`[TOC]` 上不了博客。完整编辑器仍是「编 raw、显式发布」不受影响。
- **章节编号 = 显示层**：序号不写入 `raw/published_content`；改编号逻辑须四端同步（阅读 `markdown.ts heading_open` / CM6 `extensions/headingNumber.ts` / Tiptap `HeadingNumber.ts` / 导出 `markdown_render.py`），算法唯一源 `utils/headingNumber.ts`。`renderMarkdownWithToc` 的 LRU key 必须含 numbering 标志。详见 docs/editor.md §7。
- **PPT/Word 导入**：OOXML 是 zip，`.docx/.pptx` 上传经 `_is_valid_zip` 前置校验，**坏文件 400 拒收**（soffice 加载坏源仍退 0，不能靠转换失败兜底）；「PPT 转换失败/未完成」多为**原文件本就损坏**，非管线 bug（管线 md5 往返无罪）。**缩略图变一条横线** = 纯 CSS（`.jz-pptx-rail` flex-column 压缩），后端数据完好，勿去查数据丢失。docx 正文提取靠 mammoth 且**必须传 `BytesIO`**（裸 bytes 会静默走空文档）。详见 docs/editor.md §8。
- **Word 字体颜色**：mammoth **默认丢弃 run 级直接颜色**（`w:rPr/w:color`），故导入字体色历来全丢。修复=`docx_import._mark_run_colors` 转换前在 docx XML 层给带色 run 包 `jzcolor<hex>b…jzcolore` 哨兵、最终 md 换回 `<span style="color:#hex">`（含表格内彩字）。**导出端彩色仍丢为已知限制**。
- **语雀 MD 远程图不显**：双坑叠加——(1) `cdn.nlark.com` **防盗链**：浏览器带外域 `Referer` 直连远程图 → **403 图裂**（修复=前端 `<img referrerpolicy="no-referrer">`，无 referer 服务端/浏览器均 200）；(2) 同步镜像 40+ 张远程图（CDN 限流每张 5–15s）**超请求超时被中断** → 图仍是远程 URL（修复=改 Celery 异步 `mirror_document_images` + `ThreadPoolExecutor` 并行，仅含远程图才派发）。**服务端 fetch 无 referer=200，浏览器直连=403** 是关键区别。详见 docs/editor.md §8。
- **语雀 MD"识别错乱"= 渲染层三兼容 bug**（存储 `raw_content` 本身干净）：(1) **图表注释被 `-->` 截断（主凶）**——语雀导出 mermaid 为 `<!-- 这是一个文本绘图，源码为：… -->` + 静态 SVG，通用注释剥离在源码内部箭头处截断 → 源码泄漏成正文 + `:::jam` 触发失控 callout；修=`recoverYuqueDiagramComments`（前后端镜像）还原 ```mermaid fence（闭合锚定 `-->`+行尾）并丢静态图，**须在通用剥离前**；(2) `<font>` 交替染色句被强调合并正则吞成整句全粗（连接符须 `[^*\n<]`）；(3) CJK 双加粗被 `**A**B**C**` 合并启发式吞并/静默删标记（该步骤已删,空格+`\w` 防线对中文全失效）；(4) **空格包裹公式**——语雀把公式节点导出为两侧留白的 `$ … $`，撞上货币防误判边界规则整条退化纯文本（可叠加丢反斜杠 `[ … ]` 残骸、`\\frac` 双反斜杠转义）；修=`applyYuqueCompatMode` 首步 `rescueSpacePaddedDollarMath`（前后端镜像）仅抢救「独立成行+内侧留白+含 LaTeX 信号」→ `$$` 块，**勿放宽四端 tokenizer 边界规则**；(5) **URL 内 4+ 连续下划线被拆（四条中唯一会写坏存储的）**——`_{4,}`→`__ __` 相邻加粗拆分对 fence 外全文无差别生效，HillStone 等站 URL 尾部 `TocPath=…_____0` 被插空格 → 链接目标失效退化纯文本，富文本编辑器**每保存一轮把破碎结构写回 `raw_content` 腐蚀一层**（`\[` 转义+部分 autolink+`%5C_`，第 3 轮不动点）；修=`normalizeYuqueEmphasis` 入口掩码 `https?://` 段、出口还原（仅前端；后端镜像从无此拆分步骤）。**改 `applyYuqueCompatMode` 任何正则须过五类回归**：CJK 标点连接双加粗、font 交替染色句、含 ` --> ` 图表注释、空格包裹公式（抢救 vs 货币文本不触发）、URL 含 4+ 连续下划线/星号不被改写（掩码勿绕过）；排查导入渲染问题**先 dump 库里 `raw_content`**,勿用用户手头"同一篇"本地文件。详见 docs/editor.md §8。
- **绑 DOM 事件的 hook 勿依赖 `containerRef`**：ref 引用恒稳 → `useEffect(deps=[containerRef])` 只跑一次；而阅读页在正文异步加载完成前先 `return <Spin/>`，首挂载时 `ref.current` 为 `null` → effect 早退且**永不重绑**（`useImageLightbox` 图片放大曾因此长期完全不生效）。一律用 **`selector`+`bindKey` 范式**（依赖 `[selector, bindKey]`，内容落地即重绑），与 `TableEnhancer`/`CodeBlockEnhancer` 同构。详见 docs/frontend.md §5。
- **Tiptap v3 三坑**：① Link 扩展协议白名单（`isAllowedUri`）默认**拒收 `doc:`** → markdown 重载时 `[标题](doc:ID)` 的 link mark 被静默剥成纯文本（已修 `Link.configure({protocols:['doc']})`，新增内部协议须同步）；② `useEditor` 默认**不随 transaction 重渲**，组件 render 里直接 `editor.isActive()/getAttributes()` 拿陈旧快照——依赖 editor 实时状态的 React UI 一律走 `useEditorState({editor, selector})` 订阅；③ **`useEditor` 1ms 兜底销毁定时器竞速**：实例在 render 阶段同步创建并挂 `setTimeout(1ms)` 销毁兜底，首次懒加载挂载太重时定时器抢在 passive effect 前 `destroy()` 实例 → 挂载 effect 里 `editor.commands.*` 抛 `null.commands`（首次点「编辑」必现、重试即好；**与 StrictMode 无关，prod 慢设备可触发**）——挂载 effect 守卫一律写 `if (!editor || editor.isDestroyed) return`，同样貌报错先排本竞速再怀疑 vite 缓存 desync。详见 docs/editor.md §9。
- **主题切换 VT 三坑**：① VT 的 **new 快照是 live 的**——body 自身 `background-color` transition 会在溶解里叠出双重动画（过渡期 `jz-vt-live` 关掉）；② `::view-transition` 伪元素树默认**拦截命中测试**、过渡期页面点不动（`pointer-events: none` 放行）；③ **`view-transition-name` 重名 = 整场过渡静默跳过**——分层错峰的 `jz-shell`/`jz-header` 打名必须 JS 取 document 序首个匹配写 inline（编辑器入口 shell 会嵌套，纯 CSS 打名必炸）。canvas 场景由 `AmbientStage` 统一调度交叉溶解（受控 `active` prop），新场景挂 `SCENES` 表、勿自读 theme store。详见 docs/frontend.md §2。
- **主题/背景三坑**：① `background: X !important` 简写把后置普通 `background-*` 长手**全部压死**（布局光晕曾长期是死代码）——改层背景先 `getComputedStyle` 验证在渲染，!important 声明上做动画用 `@property` 变量从 `var()` 内部驱动；② canvas 场景新增大数组须按 `pointer.quality` 前缀截断（自适应降质契约，否则降质失效）；③ `shaderCanvas` cleanup 勿回退为同步 `loseContext`（canvas 仅一个 GL context，StrictMode 双挂载会打死 → 每帧 `undefined.forEach`）。详见 docs/frontend.md §2。
- **数学公式边界规则多处镜像**：阅读端 `katexPlugin` / Tiptap `MathNode` parse.setup + `mathPatterns.ts` / CM6 `inlineMathScan` / 后端 `markdown_render` tokenizer **四处手工对齐**，改任一须全端同步并过货币（`5$ 到 10$`）/行首/表格内三类回归；反斜杠定界归一化 `normalizeLatexDelimiters` 前后端镜像同理。**JS `/\d/.test(ch)` 译 Python 勿写 `ch in digits`——`"" in str` 恒 True**，行首公式曾因此全灭。详见 docs/editor.md §5。
- **导出批次四坑（2026-07-27）**：① Chromium `page.pdf` 的 **`outline` 必须与 `tagged` 同开**——单独 `outline=True` 静默零书签（Chromium 147 实测）；② markdown-it 的 **`gfm_plugin` 已内置 tasklists**，再叠 `tasklists_plugin` 相互干扰致 checkbox 消失，勾选态在 `list_item_open.meta['checked']` 而非 html_inline；③ **静态站 fail-closed**：只收 `published_content` 非空文档、**绝不回落 raw**（与博客端 `resolve_published_html_body` 同规矩），改 `static_site` 勿复活回落；④ **标题渲染是双通路**——markdown 标题走 `_render_heading_open`，而 Word/模板导入文档的标题是**原生 `<h1-6>` html_block** 走 `_process_html_headings`，改锚点/降级/目录收集必须两处同步（曾致真实库导出目录全空、书签顶层被污染）。多篇合订锚点必须带 `anchor_prefix="d{doc.id}-"` 按篇命名空间（同名标题曾撞 id 跳错篇）；PDF/docx 书签层级靠「文档标题独占 1 级 + 正文标题降一级」实现，勿改回同级。导出文件名唯一枢纽 = `common.build_export_filename`（`大类-知识库-[标题|N篇]-时间`），改命名规则勿散落 f-string；exporter 测试有 autouse fixture 隔离 MEDIA_ROOT（勿删，历史上曾污染真实 `exports/` 566 孤儿文件）。详见 docs/export-search.md。
- **动效层四约定（2026-08-04）**：① 新动效一律引用 tokens.css 动效令牌（`--jz-dur-*`/`--jz-ease-*`，弹簧已 `linear()` 真采样），勿写裸 cubic-bezier/硬编码时长；② JS 侧动效开关一律走 `utils/motionPref`（`prefersReducedMotion`/`decorativeMotionEnabled`，含用户三档位），**勿内联 matchMedia**；新增 CSS reduce 块须同步补 `[data-motion='min']` 伴生规则；③ 内链默认 `TransitionLink`（路由 VT），共享元素**源侧只命名被点击那一个**（同名两处=整场 VT 静默跳过）；④ **跨文件同名 @keyframes 后加载者赢**（AI FAB 曾双份、tiptap.css 死份已删）；⑤ **删 CSS 块尾部内容勿连删右花括号**——未闭合 `{` 在 dev 无症状（每文件独立 `<style>` EOF 自动闭合），prod 单 bundle 会把其后 import 的**全部样式文件**按 CSS 嵌套语义吞进该选择器作用域整段失效（2026-08-06 tiptap.css 缺 `}` 致线上书卡/阅读页裸奔而 dev/登录页/后台全正常）；排查同款「部分页面裸奔」先对 `src/styles/*.css` 跑花括号平衡扫描。详见 docs/frontend.md §2 动效令牌小节。
- **改「持久化偏好」的默认值必须同时 bump 存储 key**：KB 页视图偏好（`jz-kb-density*`/`jz-kb-view:<slug>`）挂载 effect 即自动把当前值回写 localStorage——所有老访客都存着旧默认，只改代码默认值对他们永不生效且无从区分「主动选择」与「自动写入」。2026-08-08 密度默认 summary→list 时 key 已升 `jz-kb-density-v2`（代价=既往手动选择一次性重置）。同模式的新偏好项沿用此规矩。
- **题记心境时间戳约定**（2026-08-10）：quotes 每条 `created_at`（摘录日期=心境，用户可编辑，首页「摘录于」只展示它）+ `updated_at`（服务端在正文/朝代/作者/篇名变更时盖章，客户端回传值一律忽略，公开端点不返回）；stamping 唯一收口 `hero.py _stamp_quote_dates`（PATCH 与 batch 两条写入路径都必须过）。`created_at` 是 **key-presence 语义**：请求缺 key=老客户端→继承存量，显式空串=清除，勿改成「空即继承」（会封死清除）。**批量导入缺行尾 `@YYYY-MM-DD` 时刻意不默认今天**——replace 模式还原旧备份会把全部条目伪造成今天的心境日期；仅回填 `created_at` 不算内容变更、不 bump `updated_at`。后台面板的新增草稿放 `data.quotes` 之外独立 state（后端静默丢空正文条目，混入列表会被他行提交的响应抹掉）。正文支持**多行**：批量行式格式用字面量 `\n` 转义换行（前端导出转义 ↔ 后端 `_parse_batch_lines` 还原，两侧须成对改）；后台编辑 TextArea 内 **Enter=换行、Ctrl/⌘+Enter=保存**（勿改回 Enter 提交）；首页 `HeroQuoteCard` 按 `\n` 分行→行内 ` · ` 分段两级拆分，印章跟末行。
- **样式层三约定（2026-07-25）**：① portal 到 body 的弹层（AntD Dropdown/Popover、tippy）**拿不到 `.jz-glass` 作用域令牌**——不透明底一律兜到 `:root` 的 `--jz-overlay-surface`（slash/块面板/AI 菜单暗色曾近全透明）；② 表格**冻结首行/首列必须完全不透明**——格面背景走 `--jz-cell-surface(-2)`（= surface 预合成 bg-app 的实底换算值，改 surface/bg-app 须同步重算）；③ 编辑器标题 `::before` 归**章节编号**专用，折叠箭头等标题装饰一律 `::after`（箭头曾占 `::before` 把 H1–H4 编号整层覆盖）。行内代码供色走 `--jz-code-inline-*` 派生令牌（accent 混墨色，六主题 WCAG AA）。详见 docs/frontend.md §2 自查清单 9–11。

---

## 深度参考（按需 Read，勿内联）

| 主题 | 文件 |
|---|---|
| 架构 / 11 app / 数据模型 / URL / 保存时序 / 扩展索引 | `docs/architecture.md` |
| 编辑器（Tiptap/CM6/表格/KaTeX/Mermaid） | `docs/editor.md` |
| AI 多供应商（模型/降级/预算/用量/价格） | `docs/ai.md` |
| 全文搜索 + 导出（5 格式 + anthology + 离线 SVG） | `docs/export-search.md` |
| 视觉系统 / 主题 / 题记 / 图标 / 布局 | `docs/frontend.md` |
| 部署运维 + LAN HTTPS + 安全控制点 | `docs/deployment.md` |
| **权限 / RBAC 权威清单** | `docs/permissions.md` |
| 版本历史 | `docs/CHANGELOG.md` |
| 人类上手导览（简版 / 详版） | `docs/dev-guide/simple.md` / `docs/dev-guide/detailed.md` |
| 手工验收清单（编辑器 / MD 预览样式） | `docs/dev-guide/editor-qa-checklist.md` / `docs/md-preview-code-block-checklist.md` |
| 历史坑 / 决策复盘 | memory（`MEMORY.md` 索引） |

---

## 红线（叠加全局 `~/.claude/CLAUDE.md`）

- 不自动 `git commit` / `git push`，除非明确要求；提交前先展示变更摘要
- 删文件/目录/git 历史、改 `.env`/密钥/token/CI、`git push`/`rebase`/`reset --hard`/强推 —— **即使 auto-accept 也必须先问**
- 默认中文回复；代码/命令/路径保持英文；结论先行，发现更好做法主动说

---

## 线上状态与实现基线

- **线上**：腾讯云 `www.jianzhai.site`，线上 = main `5e94cfa`（2026-08-07 部署导入体验批次：`DATA_UPLOAD_MAX_NUMBER_FILES=1000` + 失败明细 notification + 上传目标文件夹；含后端 settings 标准路径，无新迁移，最新迁移仍为 `accounts 0008`）。2026-07-27 那次为**含镜像重建**部署：Playwright/Chromium 已进生产镜像（浏览器二进制走 npmmirror，服务器连不通官方 CDN），celery 已带 `-B` beat + `mem_limit 3g`（服务器 concurrency=1 变体保留）。**知识库内容未随 2026-07-27 同步完成**（当时在 media 阶段按用户要求中止，服务器为旧内容 176 篇 vs 本地 194 篇——07-27 快照；重跑 `Local_to_Cloud_Server_kb_sysnc.py` 可续传）。**语雀 URL 腐蚀修复已上线止损，但线上库存量坏 `raw_content` 不会自愈**（本地已重建 444/438，服务器侧需另行重建或随下次内容同步带过）。重部署两条路径与部署后验证绿清单 → `docs/deployment.md` §3
- **实现基线**（v0.9.10+，2026-08-04）：四角色 RBAC + 登录三因子 + 默认要求登录 + 受众可见性/ReadGrant 两道闸 · 6 主题 + 电影级主题过渡 · 三编辑器（Tiptap 3 / CM6 / HTML）+ 章节编号 + `[TOC]` · LaTeX/Mermaid 全链路（含导出端离线渲染）· Word/PPT 保真导入 + 语雀 MD 兼容 · 5 格式导出（结构化命名 / PDF+Word 三层目录体系：层级书签+卷首目录+篇内目录 / 站点 fail-closed / 保留清理与限流）· AI 多供应商 · PDF/PPT 阅读器 + 阅读排版定制/专注模式/位置记忆 · 编辑器/预览样式体系优化（portal/冻结面/行内代码令牌，六主题 WCAG AA）· 动效体系（motion 令牌+`linear()` 真弹簧 / 路由连续性转场+共享元素 / 指针边缘光 / 收藏墨点粒子 / 动效三档位 / 导出实况胶囊 / 骨架屏 / skip-link）。**逐批次详情 → `docs/CHANGELOG.md`（时间序全量）；坑与决策复盘 → memory（`MEMORY.md` 索引）**

> **本段维护约定**：新批次上线后——`docs/CHANGELOG.md` 加一行详情、memory 记坑、有新约束则进上文「不变量/陷阱」，本段只更新「线上 =」指针与基线关键词；**勿在本文追加批次长文**（该段历史上曾膨胀至 11KB 单行，2026-07-25 已全部归档进 CHANGELOG）。
