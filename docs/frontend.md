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

> **切换器**：`ThemeSwitcher.tsx` 为**单按钮 + 下拉菜单**（六项 + 尾部「**随朝暮**」开关；触发钮图标按主题专属色调、当前项打勾；starry 激活时 tooltip 显今夜真实月相），取代旧「4 宫格 Segmented + 主题色 Popover」。**切换过渡走 View Transition，电影级三拍法（2026-07-25 重写）**：`stores/theme.ts` 的过渡指挥器 `transitionTo(kind, origin, commit)`——`switch` 分层错峰溶解（默认：背景 root 0.85s 先行，玻璃外壳 `jz-shell` +120ms、顶栏 `jz-header` +200ms 错峰跟进，旧层 5px 失焦退场；**分层 view-transition-name 由 JS 取 document 序首个匹配写 inline**，纯 CSS 打名在编辑器嵌套 shell 时重名会让整场 VT 静默跳过）/ `reveal` 柔边圆形揭幕（菜单点击：`jz-vt-circle` + `--jz-vt-x/y/r`（JS 半径 +90 羽化余量），`@property --jz-vt-cr` keyframes 内插驱动 mask radial-gradient 半径、90px 羽化，旧层退暗退饱和）/ `clock` 随朝暮长转场（1.8s 慢溶解 + `.jz-dusk-veil` soft-light 暮色/晨光调色层 + canvas 慢交接）。**React 提交以 `flushSync` 塞进 VT 回调**（AntD `algorithm`/`colorPrimary` 与 canvas 交接进入 new 快照，不再过渡后瞬跳）；快速连点 `skipTransition()`；`::view-transition{pointer-events:none}` 过渡期保持可交互；`jz-vt-live` 临时关掉 body 底色 transition（**new 快照是 live 的**，否则双重动画）。CSS 在 theme.css 尾部；无 API / reduced-motion 回退瞬切。**随朝暮**：`followClock`（localStorage `jianzhai:themeFollowClock`），昼 6–18 时 `light`、夜 `starry`（纯函数 `resolveClockMode` 可测），分钟级定时对表，手动选主题即退出。**用户自选 accent preset 体系已删除**（`stores/theme.ts` 不再有 `AccentPreset`/`ACCENT_PRESETS`/`accent`/`setAccent`，`applyToDocument` 只写 `data-theme` + `colorScheme`），调色全交 CSS token；**AntD `colorPrimary` 单源化（2026-07-25）**：`MODE_ACCENT` 色表已删，`main.tsx` 运行时经 `utils/themeAccent.ts` 读根元素 `--jz-accent`（两处硬编码曾实际漂移：dark JS `#02b377` vs CSS `#2ee79c`；store 保证 `applyToDocument` 先于 React 重渲），暗色算法判定用 `stores/theme` 导出的 `isLightTheme`。

### 环境氛围层（4 个氛围主题）

- **2D Canvas**（`ambientCanvas.ts` 脚手架：DPR/rAF/隐藏暂停/reduced-motion 单帧/指针滚动视差 + `flow/curl/fbm/noise/makeGlowSprite/makeBokehSprite/makeNoiseTile/drawFilmGrain/drawVignette` 工具）：`StarryNight` / `DeepSea` / `WinterSnow`。
- **WebGL fragment shader**（`shaderCanvas.ts` 的 ogl 全屏 hook + `waterShader.ts` GLSL）：`SpringWater` 水面 —— 平静水的真实感（角度依赖的天空反射/菲涅尔/连续法线/太阳光带）是 2D canvas 的能力天花板，故用 shader；花瓣/涟漪/柳絮仍走 2D 叠加层。**依赖 `ogl`（~15KB，GLSL 内联为 TS 字符串，未引 vite-plugin-glsl）**。
- **`AmbientStage` 统一调度（2026-07-25）**：`App.tsx` 在路由外挂 `AmbientStage`（外加 `PointerSpotlight`）；四场景组件改受控 `active` prop、**不再自读 theme store**。主题切换时旧场景**保活继续逐帧绘制并淡出**，与新场景淡入交叠（交叉溶解，取代硬切空一拍）：`hooks/useSceneHandoff.ts` render 阶段调状态、普通 1150ms / 随朝暮 2600ms 后卸载，wrapper `.jz-ambient-wrap.is-exiting`/`.is-slow`（CSS 在 starry.css，淡出 transition 稍短于卸载计时）；reduced-motion 直接硬切。**新增场景挂进 `AmbientStage` 的 `SCENES` 表**。
- **亮色氛围主题（春水/冬雪）的玻璃面**须在 `theme.css` 覆盖 `.jz-glass` 的硬编码翡翠重音，否则卡片/登录/后台整体泛绿（基样 `.jz-glass` 把 `--jz-accent` 写死为 `#02b377`）。
- **自适应降质（2026-07-22）**：两套脚手架内置帧时 EMA 三档（quality `1/0.8/0.62` + DPR 同步降；持续 >23.8ms 降档、流畅 4s 回升，滞回+冷却防抖）。**场景大数组循环必须按 `pointer.quality` 前缀截断消费**（星场/雪场/海雪/浮游/气泡/花瓣/柳絮已接；新场景/新大数组照此接入，否则降质失效）。调试覆盖：`window.__ambientForceQ`。
- **指针与点击彩蛋（2026-07-22）**：`PointerState` 含 `px/py`（原始像素指针）与 `clicks`（背景点击队列——命中 `INTERACTIVE_SELECTOR` 的点击被过滤，队列帧末清空）。现有彩蛋：春水点击生涟漪、星空点击放流星（`spawnShootAt`）、深海鱼避光标（`stepFish` 斥力融入转向）、冬雪光标扰雪。每主题**恰好一个**，勿加多。
- **星空月亮 = 真实月相**：`utils/moonPhase.ts`（朔望月均值推算，±0.6 天）+ `drawMoon` 椭圆明暗线（k=cos(2πp) 定明暗线赤道交点，娥眉/弦/凸/满/地照暗盘全形态）。
- **shaderCanvas StrictMode 坑**：cleanup **不可同步 `loseContext()`**——canvas 一生只有一个 GL context，StrictMode 双挂载会把二次挂载的 shader 打死（每帧 `undefined.forEach`，dev 下春水水面曾长期因此全坏）。现为延迟 `setTimeout` 释放 + 重挂载 `clearTimeout` 取消（`pendingLose` WeakMap），改 cleanup 勿回退。

### 界面动效层（2026-07-22）

canvas 之上的「近景」动效，全部尊重 `prefers-reduced-motion`：

- **顶栏滚动态**：`hooks/useScrolled.ts`（rAF 节流）→ `.blog-header.is-scrolled`（blur 16px + 底色变实 + 纵深影；双金线书口线保留）。
- **滚动显现**：`hooks/useRevealOnScroll.ts`（selector+bindKey 范式）——标记 `.jz-reveal` 的元素入视口获 `.is-in`，批内 `--jz-reveal-d` 阶梯。**用 animation（`fill: backwards`）而非 transition**：播完不残留动画值，hover 的 transform/transition 不被劫持（`fill: both` 的终帧 transform 会永久压住 `:hover`）。现接首页 KB 网格，归档/收藏可按需扩展。
- **玻璃 spotlight**：`PointerSpotlight.tsx` 全局单例委托（rAF 节流 mousemove），对 `.jz-book`/`.ant-card.jz-card`/`.jz-feature-card` 写 `--jz-mx/--jz-my` + `.jz-spot-on`；CSS 各在 book-card.css / theme.css（`@media (hover:hover) and (pointer:fine)` 圈定）。新卡片类型加进 `SPOT_SELECTOR` + 补对应 `::after` 即可。2026-08-04 起卡片另有**指针边缘光**（`::before` mask 双层异或抠 1px 环、accent 光随指针方位游走；`.jz-book` 的 `::before` 被 accent 色条占用不参与）；光斑/边缘光在 rAF 回调里经 `decorativeMotionEnabled()` 裁决（reduce / 档位适中即关）。
- **light/dark 呼吸背景**：布局三枚光晕 64s 缓漂。**关键坑**：基样 `.jz-*-glass.ant-layout` 的 `background: …!important` **简写把后置普通 `background-image` 长手全部压死**（布局光晕曾长期是死代码，computed `none`）——复活须 `!important` 长手；动画须 `@property` 注册 `--jz-bg-x/y` 从 `var()` 内部驱动（keyframes 直接动 !important 声明无效）。

### 动效令牌 · 档位 · 路由连续性（2026-08-04 批次）

- **动效令牌（tokens.css）**：`--jz-dur-fast(120ms)/base(200ms)/slow(350ms)/epic(850ms)` + `--jz-ease-standard/decel/spring/vt`。弹簧经 `@supports (transition-timing-function: linear(0,1))` 升级为 **`linear()` 真弹簧采样**（过冲 ~10% + 一次回摆；旧浏览器留 cubic-bezier(.34,1.56,.64,1) 近似）。**新动效一律引用令牌**，勿再写裸 cubic-bezier / 硬编码时长（旧值散落曾致同一弹簧三种书写、`0.15s` vs `140/160ms` 同义分裂）。
- **动效偏好唯一裁决点 `utils/motionPref.ts`**：`prefersReducedMotion()`（系统 reduce **或**用户档位「精简」）与 `decorativeMotionEnabled()`（档位「适中」即关装饰）。**JS 侧勿再内联 `matchMedia('(prefers-reduced-motion…')`**——theme store / AmbientStage / ambientCanvas / shaderCanvas / useRevealOnScroll 曾五处重复，已全部收敛改引。
- **动效档位（HarmonyOS 式三档）**：主题菜单尾部「动效 · 足量/适中/精简」，`setMotionLevel` 持久化 localStorage `jianzhai:motionLevel` + 落根元素 `data-motion`（full 不落保持零痕迹），main.tsx 首帧前应用防闪动。适中=canvas 质量钉 `AMBIENT_LEVELS` 最低档（脚手架初始化读一次，AmbientStage 以 `key` 含档位重挂场景）+ 关光斑/粒子；精简=reduce 语义，纯 CSS 动画由 theme.css 尾部 **`[data-motion='min']` 伴生规则**承接（media query 无法与属性选择器 OR，新增 reduce 块须同步补伴生条目）。React 反应式消费走 `useMotionLevel()`（useSyncExternalStore）。
- **路由级 View Transition**：`utils/routeTransition.ts`——`navigateWithTransition(doNavigate, shared?)` 包 VT，目标页首帧 `signalRouteReady()` 放行 new 快照（**两 Layout 按 `location.pathname` 集中发信号**），600ms 超时兜底防懒 chunk 冻屏；reduce/精简档入口瞬切。**内链默认用 `components/common/TransitionLink`**（`Link` 等价替身：左键同窗走 VT，修饰键/中键/`target` 放行）——博客 5 页面 + 后台三入口已全量替换。**共享元素**：源侧只给被点击那一个元素写 inline `view-transition-name`（主题 VT 同教训：同名两处=整场静默跳过），目标侧由 `:root.jz-vt-route` 前缀的 CSS 打名；现有一对 `jz-kb-hero`（书卡标签→KB 页头标题，KB 名/accent 经 route state 先行渲染页头壳承接）。
- **交互粒子 `utils/inkBurst.ts`**：缃金墨点迸发，仅「加入收藏」成功触发（取消不庆祝）；坐标取最近一次 pointerdown（>4s 过期即静默，键盘操作不放）；一次性 DOM + keyframes 播完自删，不进 rAF 循环；`decorativeMotionEnabled` 门控。**克制约定沿用彩蛋哲学：一个操作一种粒子，勿加多。**
- **导出实况胶囊**：`stores/exportWatch.ts`（观察池 + 单 interval 2.5s 轮询 `getExport`，全部终态自停；done 停留 60s 自动消失、failed 留驻）+ `components/common/ExportCapsule.tsx`（App 级左下角，右下归 AI FAB；底色走 `--jz-overlay-surface` 实底令牌；≤720px 贴边拉通见 responsive.css）。ExportDialog 创建任务后 `watchExport(task)` 注册。
- **骨架屏**：`.jz-skel`（+`.jz-skel-title/-line`，theme.css）——shimmer 扫光走 `--jz-text` 混色令牌六主题自适应，reduce / `[data-motion='min']` 静止不闪（骨架仍显示）。博客端三处（首页书卡网格复用 `.jz-book` 真实几何 / KB 列表行 / 文章 860 版心），**骨架保持目标布局几何、落地不跳版**，新增加载态照此办理勿回退居中 Spin。
- **a11y 地基**：`.jz-sr-only` 工具类 + `.jz-skip-link`「跳到正文」（键盘 Tab 首站显形）在两 Layout 顶部，Content 挂 `id="jz-main"` + `tabIndex={-1}`。
- **同名 keyframes 单源**：AI FAB 呼吸 `jz-ai-fab-pulse` 唯一定义在 editor-ui.css（tiptap.css 曾另有一份 3s 同名、因加载序恒被覆盖的死代码，2026-08-04 已删并留注释）——**跨文件重复定义 keyframes 是静默陷阱，后加载者赢**。

### 排版令牌与正文基类收口（2026-09-01 字体统一批次）

- **令牌阶梯（tokens.css）**：字号 `--jz-fs-3xs(10)/2xs(11)/xs(12)/sm(13)/md(14)/lg(16)/read(16.5)/xl(17)/2xl(18)/3xl(20)/4xl(22)/5xl(24px)`、行高 `--jz-lh-tight(1.4)/ui(1.6)/read(1.85)/loose(2.15)`、字距 `--jz-ls-xs(0.5)~2xl(5px)` 六档。博客侧 7 个 CSS 文件 + 9 个 TSX 约 210 处已全量收编，碎片值就近归档（11.5→12、13.5→13、15/15.5→16、1.05rem→17px、行高 1.3–1.75 归四档）。**新增字号/行高/字距禁写裸值**，三类刻意豁免留字面：26px+ 一次性展示字号（登录印章 32/标题 26、统计数字 28）、clamp() 响应式标题、图标字形度量（`fontSize:24` 图标砖、15px 主题切换图标、30px KB 图标）。
- **`.markdown-preview` 基类 = 正文排版唯一收口**（markdown.css 顶部）：`font-family: var(--jz-article-font, var(--jz-font-serif))` + `font-size: calc(var(--jz-fs-read) * var(--jz-reader-scale,1))` + `line-height: var(--jz-reader-lh, var(--jz-lh-read))`。所有渲染面（阅读页/评论/附件预览/文件预览）同享；theme.css 旧 `.paper .markdown-preview` 双源规则已删。**阅读三件套变量通道（`--jz-article-font`/`--jz-reader-*`，PostDetail 写在 `<article>` 上）勿破坏**——基类里字号必须保持 calc 形式、字体第一顺位必须是 article-font 变量。两个局部覆盖有意保留：AI 面板 `.jz-ai-panel-body .jz-ai-md` 钉 `var(--jz-font-ui)`（工具 UI 非正文），评论面板（编辑器侧栏，**博客读者侧无评论展示组件**）留 `var(--jz-fs-md)` 侧栏密度。
- **标题衬线**：`.blog-content h1-h6` 全档衬线（h4 文章卡片标题曾漏网致「页头宋体、卡片黑体」）；非 heading 的条目标题类（`.jz-post-row-title`/`.jz-related-posts-item-title`）显式声明衬线。hero 题记字号单源 theme.css（归档/标签云/收藏/回收站四页的内联 clamp 覆盖已删）。
- **防回归**：`utils/typographyTokens.test.ts` 双守卫——readerLayout 行距三档 === tokens `--jz-lh-ui/read/loose`（两份手写副本，改须同步）；`styles/*.css` 禁裸 font-family（白名单 `var(--jz-font*)`/`var(--jz-article-font…)`/`inherit`，tokens.css/fonts.css 豁免）。emoji 栈为第 9 枚令牌 `--jz-font-emoji`；阅读器 Verdana/Georgia 预设栈也收进 `fontStacks.ts` 常量。

### 主题适配自查清单（新增组件/页面照此核对）

非默认主题（尤其 starry/deepsea/春水/冬雪）「染绿」的根因永远是**写死的 accent 色绕过了 token**。规律：

1. **「重音」一律走 token**：组件主色、hover 边框/光晕、激活态渐变 → `var(--jz-accent)` / `var(--jz-accent-soft)` / `var(--jz-gold)`，**禁止**写死 `rgba(16,185,129,…)` / `#02b377` / `#10b981` / `#06d6a0`。半透明用 `color-mix(in srgb, var(--jz-accent) N%, transparent)`（与 `rgba(c, 0.N)` 渲染等价）。
2. **`var(--jz-accent, #10b981)` 的 fallback 无害**：token 永有值，fallback 永不触发，无需改。
3. **保持写死的三类**：① 语义色（成功绿 `#10b981`/`.is-success`、错误红、批注琥珀 `#f59e0b`）跨主题恒定；② 图标多彩色板（`jz-ico-tone-*`、`#059669` 等）是固定调色盘；③ 刻意的页面识别色（架构总览 hero 的青蓝 `rgba(58,110,165)`、AI hero 的紫罗兰）。
4. **代码块深底是有意设计**：六主题统一深底（含默认 light），勿改成跟随主题；底色统一走 `var(--jz-code-bg, #282c34)`（编辑器裸 pre 曾另写 `#1f2329`，2026-07-25 已对齐）。**行内代码**供色走派生令牌 `--jz-code-inline-fg/bg/border`（tokens.css，fg = `color-mix(accent 54%, --jz-text)` 六主题自动可读，实测对比度 4.88–10.96 全过 WCAG AA），新增行内代码消费点（阅读/编辑/表格内/AI 面板/导出端五处镜像）一律用它，勿再写纯 accent 前景。
5. **暖宣纸**（`paper-rice/kraft/parchment`）在 `.jz-blog-glass` 已 `!important` 中性化；但**后台编辑器预览**（`.jz-admin-glass`）会露暖色，新增亮色主题须在 `paper.css` 补冷调变体。
6. **亮色集合**：新增亮色主题必须加入 `stores/theme.ts` 的 `LIGHT_MODES`（`colorScheme: light`），否则原生控件/AntD 算法误判暗色。AntD `colorPrimary` 已单源化——运行时读根元素 `--jz-accent`（`utils/themeAccent.ts`），无需再配 JS 色表（旧 `MODE_ACCENT` 已删）。
7. **accent 渐变上的前景一律 `var(--jz-on-accent, <fallback>)`**：主按钮/Segmented 选中态/印章/书卡 CTA 等亮 accent 底上的文字**禁止**写死 `#fff` 或某主题的墨绿——白字压亮 accent 最低只有 1.8:1。六主题各配「accent 墨色」（tokens.css），新增消费点带旧值 fallback 即可。
8. **层背景改动先验证真的在渲染**：`background: X !important` 简写会把**同规则及后续规则的普通 background-* 长手全部压死**（cascade 中 important 恒胜 normal）——布局光晕曾因此长期是死代码。改层背景先 `getComputedStyle` 确认 `backgroundImage ≠ none`；要在 !important 声明上做动画，用 `@property` 注册变量从 `var()` 内部驱动。
9. **portal 弹层不透明底走 `:root` 的 `--jz-overlay-surface`**（2026-07-25）：AntD Dropdown/Popover/tippy 弹层挂 `document.body`，拿不到 `.jz-glass` 作用域的 `--glass-*`/`--jz-ai-*`（slash 菜单/块面板/AI 菜单在 dark 下曾因半透明 `--jz-surface` 近全透明）。新弹层背景写 `var(<作用域令牌>, var(--jz-overlay-surface, #fff))` 兜底链。
10. **表格格面背景走 `--jz-cell-surface(-2)`**（2026-07-25）：冻结首行/首列靠单元格自身背景遮挡滚动内容，**必须完全不透明**——light/dark 的 `--jz-surface` 是半透明玻璃令牌，直接用会透底。该令牌 = surface 预合成到 bg-app 的实底换算值（tokens.css），**改任一主题的 surface/bg-app 须同步重算 cell 值**。
11. **编辑器标题装饰伪元素分工**（2026-07-25）：`.tiptap` 标题的 `::before` 归**章节自动编号**专用（`.jz-has-heading-num::before`），折叠箭头等其他标题装饰一律用 `::after`——折叠箭头曾占 `::before` 且特异性更高，把 H1–H4 编号整层覆盖（编号只在 H5/H6 出现）。

---

## 3. 图标体系（2026-06-06 定稿视觉语言；2026-09-02 收编体系）

三个区域三种视觉语言（视觉定稿不动，收编只做体系与一致性）：

| 区域 | 实现 | 语言 |
|------|------|------|
| **个人空间侧栏** | `JzIconKit.tsx` §1 填充族（10 枚，用户设计稿 SVG） | 0.72 淡染填充、无底座裸放（40px 占位 + 悬停微放大）；同明度多彩 tone（`jz-ico-tone-*` 十色 + 暗主题提亮 + starry/deepsea 校准；`hero` 改缃黄 `#a16207` 与 `tags` 区分，菜单选中光晕跟随 `--jz-ico-c`）；尺寸 = `ICON_SIZE.tile ± n` 光学补偿就地注释 |
| **博客顶栏** | `JzIcon.tsx` 最初版 v0.9 浅染族 | 归档/标签/搜索/RSS 走 `--jz-icon-fill/spot` + 翡翠 hover；圆角方块底座 + 光泽扫过；尺寸 `ICON_SIZE.nav` |
| **主题切换六枚** | AntD Sun/Moon/Star + `JzIconKit.tsx` §2 描边族三枚（春水/冬雪/水波，16 网格 strokeWidth 1 ≡ 24 网格 1.5） | 初始风格；设计稿版四枚主题图标已删 |
| **动作类（关闭/复制/更多/全屏/裁剪/恢复/导出/新标签/文字颜色/批注…）** | AntD，经 **`common/actionIcons.ts` 语义别名**引用 | 单一定义处；`ExportIcon`=导出 / `OpenInNewIcon`=新标签、`TextColorIcon`=文字色 / `HighlightColorIcon`=底色、`CommentIcon`=批注 / 「包裹为色块」用 `JzCalloutIcon`、`RestoreIcon`=恢复·回滚 / `UndoIcon`=撤销、`BookOutlined` 只留 EPUB 书签（KB 面包屑 `JzBookIcon`、EPUB 附件 `ReadOutlined`） |
| **innerHTML 面**（阅读页代码块工具条 / 图表动作行 / 图表·图片全屏 / 文档卡片） | `utils/actionIconSvg.ts` | 24×24 / 1.8 / currentColor，只输出 DOMPurify 放行属性（测试锁定）；曾是 `▾ ⧉ ⋯ ⤢ ⤓ ✕ 📄` 字形 |

`JzIcon.tsx` 共 **48 枚**：24×24 / 1.5px stroke / `currentColor` / linecap round；`--jz-icon-fill/-fill-strong/-spot` 三枚填色令牌**在 tokens.css `:root` 兜底、`.jz-glass` 细化**（portal 弹层坑，`iconTokens.test`）。`tone` prop / `JZ_ICONS` 注册表 / 默认导出已删。

- **尺寸阶梯** `common/iconSize.ts`：`ICON_SIZE = { xs:12, sm:14, md:16, lg:18, xl:20, nav:22, tile:24, hero:28 }`，`iconSize.test` 锁单调。
- **插入/斜杠菜单瓷砖 tone**：`toolbar/insertIconTone.ts`（全部 id 显式登记，`insertIconTone.test` 遍历斜杠命令），CSS 折叠为 `[class*='jz-insert-icon--']` 一条基规则 + 十行 `--jz-insert-tone`，激活环 `--jz-insert-ring`。
- **色块菜单色点** `callouts.ts` 每预设带 `color/icon`（镜像 markdown.css `.jz-callout-<slug>` 的 `--c/--c-icon`），`calloutSwatch()` 渲染 `.jz-callout-swatch`，菜单与正文同色同字形。裸 emoji 当图标挂 `.jz-emoji`（`--jz-font-emoji`）。
- **状态胶囊** `editor/SaveStatusPill`（`saveStatus.ts` 五态 union + 文案表；spin / 实心勾 / 实心叉 / 时钟 / 空心勾，`role=status`），三编辑器共用。
- **品牌方印** `common/BrandSeal`（`.jz-seal` 一组规则：xs 28/r5/700 顶栏、md 42/r12/800 后台、lg 56/r14/800 登录；悬停由 `.jz-seal-host` 触发）。
- **按钮体系（2026-09-03 收编）**：**`common/IconButton`** 是全站唯一图标钮（AntD text 钮 + 稳定类 `.jz-icon-btn`；`size` xs 22 / sm 26 / md 30 / lg 36 方形热区、`tone` accent/gold/danger、`active` 压下态 `aria-pressed`+`.is-on`、`tooltip` 可选），四态全走 tokens.css 新令牌（`--jz-radius-xs…pill`、`--jz-hover-bg`/`--jz-hover-accent-bg`/`--jz-active-bg`/`--jz-focus-ring`），后台 `.jz-admin-glass .ant-btn` 的 `!important` 刷白对它豁免（`:not(.jz-icon-btn)`）；`iconButtonDiscipline.test` 禁新裸 `<Button type="text" icon={…} />`（编辑器 `.jz-toolbar-icon-btn` 是既有成熟范式豁免）。**披露与方向分工（2026-09-03 第四轮，用户拍板）**：`common/Disclosure` = 圆角实心小三角（macOS 披露三角 / 有道云 / Notion toggle 语汇，`stroke-linejoin:round` 同色描边做圆角，弹簧旋转 90°、hover 放大 1.12），承担一切「下方还有内容」——博客目录树 / EPUB 目录 / KB 页折叠标题 / 代码块折叠 / 后台 AntD Tree switcher / 全局 Collapse expandIcon / 编辑器 details 与标题折叠伪元素（同一路径经 `mask`）；`common/Chevron`（圆头描边尖角号）只做方向/导航（面包屑、上下篇、下拉 caret）。树行叶子位 3–4px 圆点、活动行亮 accent。全展/全折用 `JzExpandAllIcon`/`JzCollapseAllIcon`（三行 + 披露三角），替换 AntD 方框加减：博客目录树 / EPUB 目录 / KB 页折叠标题 / 代码块折叠 / 后台 AntD Tree `switcherIcon` / 全局 `ConfigProvider.collapse.expandIcon` 都渲染它（AntD Tree 自带的 svg -90° 已 `!important` 中和），编辑器标题折叠伪元素改单字形 `▸` 旋转。**收藏/置顶** `common/DocPinFavoriteButtons`（泛型 doc；图标是自绘双色 `JzStarIcon`/`JzPinIcon`——静态态金色星/墨色钉带 16% 淡染底、点亮实心 + 星芒/倾斜 -35°，用户否决了 AntD 星/钉「丑、不达意」，第二轮再改圆角相接 1.75 描边几何（Tabler 式）与圆形热区、弹簧 hover（星缩放 -12° / 钉 -18° 抬起）；**默认常驻显示**兼作状态徽标，`reveal` hover 显现改为可选项；树行/后台树的动作区从标题前移到**行尾（格式标签之后）**，静态 0.78 不透明、行 hover 满亮；星标点亮 `jz-star-pop` 弹簧 + 金色光晕）四处共用：博客目录树、后台 KB 树（手抄副本已删）、**KB 页行/卡片（新）**、**文章页工具条（新，详情序列化器补 `is_pinned/is_favorited`）**；收藏成功由各处 handler 触发 `burstAtPointer` 墨点。
- **第三档收编（2026-09-03）**：① 后台 KB 树去掉 Folder/FileText 节点图标，改「三角 + 叶子圆点」与博客树同语言，已发布 `✓` 文本改 `.jz-doc-status` 绿点，文件夹三动作改 xs IconButton 行 hover 显现（`.jz-tree-row-actions`），选中态覆盖 AntD 蓝底为 accent 13%、圆角画到 content-wrapper 同层；② 芯片同骨架：`.jz-post-tag` 22px/11px 圆角/xs 与格式胶囊同排同形，`.jz-folder-tag` 18px 小号，三种计数徽标统一为 2xs 等宽无壳，`DocFormatTag` 七色改 `--jz-fmt-*` 令牌；③ 行 hover 收口 `--jz-hover-bg`/`--jz-hover-accent-bg` + `--jz-radius-*` + `--jz-dur-fast`（目录树 / KB 列表 / KB 页行 / 卡片 / 后台树）；④ KB 页工具条改两组 `Segmented`（视图：分组·平铺 / 密度：摘要·列表，`JzGroupView/FlatView/CardView/RowsView` 四枚 Jz 图标），阅读工具条字体 `JzFontIcon`(Aa)、纸张 `JzPaperIcon`、专注 `JzFocusIcon` 双态；⑤ `common/JzEmpty` 唯一空态（线稿托盘 + 一句话 + 可选动作，sm/md），26 处 AntD Empty 全替换；⑥ callout 角标改白色线稿 SVG（`editor/calloutGlyphs.ts` 单源 → markdown.css `--c-glyph` data URI / 菜单 `calloutSwatch` / 导出端 `export-markdown.css`，`calloutGlyphs.test` 锁三处一致，数字块用 SVG text 渲染纯数字）；⑦ 符号层 `common/symbols.tsx`（`SepDot` 分隔点单一规则、`CheckMark` 选中记号）+ `actionIcons.CheckIcon`，`←/→/▾/×/✓/·/●○` 字符全部退场，编辑器大纲圆点改 CSS 三档。
- **可访问性**：纯图标按钮一律 `aria-label`（约 60 处补齐，`Test/scripts/icon_token_probe.py` 第二段扫描零缺名）；图标 hover/scale 的 `[data-motion='min']` 与 reduced-motion 伴生规则已补。

### 3.1 快捷键体系（2026-09-02）

- **注册表** `src/shortcuts/registry.ts`：`ShortcutDef { id, chord, scope, group, label, owner, when?, allowInTyping?, conflict?, file?, hidden? }`，15 个 scope（global / admin / blog / post / editor / editor.rich / editor.markdown / editor.html / code-block / find / menu / reader.epub·pdf·pptx / lightbox），`editor.*` 继承 `editor`；`INPUT_RULES` 输入规则单列；`CM_KEYS` 供 CM6 keymap。chord 语法 `Mod+Shift+X` / `Alt+Mod+1` / `Shift+ArrowLeft` / `Mod+Shift+code:Space`（物理键）。
- **绑定** `useShortcut(id, handler, {enabled, capture, target})`（IME / defaultPrevented / allowInTyping 三守卫，handler 返回 `false` 放行）或 `matchesChord(e, getChord(id))`；CM6 `keymap.of([{ key: CM_KEYS['editor.markdown.bold'] … }])`。
- **显示** `format.ts`：`detectPlatform()`（userAgentData → platform → userAgent，可 `setPlatformOverride`）、`formatShortcut(id)`（mac Apple HIG `⌥⇧⌘` 无分隔如 `⇧⌘X`、win `Ctrl+Shift+X`）、`withShortcut('加粗', id)` → `加粗 (⌘B)`、`ariaKeyshortcuts(id)` → `Meta+B Control+B`、`kbdHtml(id)`（innerHTML 面）；组件 `<Kbd id|chord>` 单套 `.jz-kbd`。
- **速查表** `common/ShortcutCheatSheet` + `shortcuts/cheatSheetStore`（`useActiveScopes([...])` 页面登记作用域）+ App 级 `GlobalShortcuts`（`Mod+/` capture、`?` 输入区外）；按 scope 分组、`when` 上下文、`conflict` 小字、筛选、编辑器作用域多「快捷输入」页。
- **测试**：`keys.test`（匹配矩阵）、`registry.test`（id 唯一 / 同 scope 不撞键 / cm6 条目键串在源文件）、`format.test`（两平台全表快照）、`useShortcut.dom.test`、`kbdDiscipline.test`（目录级禁裸 `Ctrl+X`/`⌘`/`<kbd>`）；冒烟 `Test/scripts/shortcuts_smoke.py` 21 项。
- **决策**：`Mod+/` 两编辑模式统一为速查（富文本「插入 /」已删）；速记 `Mod+Shift+Space`（`Shift+N` 被浏览器无痕窗口截胡）；`Mod+P` 快速跳转保留并标注冲突；P3 未做：PDF 翻页键、CM 列表 Tab 逃生、列宽 ±16px 两份实现合并。

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
- **原地缩放（2026-09-01）**：缩放/resize 用**比例锚定**——`prevScaleRef` 记旧 scale、滚动位置按新旧之比换算，正在看的内容点保持视口原位（可连点 +/- 微调）；全屏切换（滚动容器换元素、ratio 无意义）fallback 跳当前页顶。**全组件禁用 `scrollIntoView`**（会滚所有可滚祖先含 window，inner 模式把工具条推出视口），跳页/锚定统一走 `scrollPageIntoView`（inner 只滚容器 / flow 滚窗口并扣 sticky chrome 高度）。flow 工具条 sticky top = 运行时量 `.blog-header` 高度（顶栏 sticky `z-index:30 height:60px` 会盖住 `top:0` 的工具条；响应式窄屏顶栏变高，勿硬编码）。页面容器 `overflow-anchor:none`（缩放重绘几百个占位符+清画布时防浏览器滚动锚定把 scroll 拖走）。**测滚动行为勿用 Playwright `locator.click()`**——对 sticky 元素其 actionability 自动滚动走 CDP scrollIntoViewIfNeeded（JS hook 不可见、按元素流内位置滚窗口），一律 `page.evaluate` 里 DOM `el.click()`。

### PPT 阅读器（`PptxReader.tsx`，有道云式，2026-07-04 / 07-10）

附件为 `.pptx` 时用该阅读器；后端转换管线（LibreOffice→JPEG + 缩略图 + 讲者备注 + 转换状态）见 [editor.md §8](./editor.md#8-office-文档导入--阅读word-一体化--ppt-有道云式)。前端要点：

- **布局**：左侧缩略图导轨 `.jz-pptx-rail` + 中间全分辨率主图 + 工具栏（页码 / 缩放 / 备注 / 全屏）+ 键盘导航（←/→、PageUp/Down、Esc 退全屏）。缩略图轨用 `thumb_url`、主图才拉全分辨率。
- **缩略图变横线修复**（纯前端，后端数据完好）：`.jz-pptx-rail` 是有界 flex-column，~90 个缩略图按钮默认 `flex-shrink:1` 在 `overflowY` 滚动生效前被压扁到 ~4px、`overflow:hidden` 再把 84px 图裁成一条线 → 缩略图按钮加 **`flexShrink:0`** + img 补 `aspectRatio`（防慢加载瞬间塌陷），交给导轨自身滚动。
- **讲者备注面板**：主图下方可折叠面板，工具栏「备注」开关（`showNotes`），逐页显示 `slide.notes`，空页显「此页无备注」，可复制，全屏亦支持；无任一页有备注时隐藏开关（`hasAnyNotes`）。
- **转换态轮询**：`slides` 为空时按 `slide_status` 轮询（`MAX_POLLS` ~7min，覆盖 worker 2×180s soffice+pdftoppm 超时），`failed` 即停并显真实原因，pending 放宽到硬上限。`PptxReader` 带 `key`（postId）防失败态跨文章粘连。

### EPUB 阅读器（`EpubReader.tsx` / `EpubSidebar.tsx`，foliate-js，2026-09-01）

附件为 `.epub` 时（`doc_format='epub'`，与 PDF/PPT 同属「文件即文章」的二进制路径）用该阅读器；内核是 vendor 进 `src/vendor/foliate-js/`（固定 commit、MIT，见其 `VENDOR.md`）的 **foliate-js**——Foliate/Readest/Koodo 三家开源阅读器的共同内核；不选 epub.js（npm 自 2023-09 停更）与 Readium Web（需 Go 服务端 manifest 体系）。

- **渲染模型**：`<foliate-view>` 自定义元素在浏览器解 zip（zip.js）→ 每章一个 `blob:` iframe；**翻页**（CSS multi-column，1–2 栏，`max-inline-size` 720px ≈ 中文 45 字/行）与**滚动**两种版式免重载切换；桌面默认翻页、窄屏默认滚动（`prefs.flow='auto'`，`PAGINATED_MIN_WIDTH` 720）。翻页态有页眉（书名 / 当前章）与页脚（位置 / 百分比）`::part(head|foot)`；键盘 ←/→/PageUp/PageDown/Space（含 iframe 内 keydown 转发）、页面两侧 18% 边缘点击翻页（经 `frameElement` 换算坐标）。
- **主题 = Readium CSS 模型**：出版社样式保留，`renderer.setStyles([before, after])` 注入一张用户表（纯函数 `utils/epubReader.ts buildEpubUserCss`）——颜色一律跟主题（`getComputedStyle(wrapper)` 读令牌，**底色必须用预合成实底 `--jz-cell-surface`**，半透明玻璃 `--jz-surface` 会在 iframe 与分页背板叠两层出现色差），结构元素文字色 `!important` 中和出版社写死的灰字、行内 `<span style=color>` 强调保留；排版只覆盖读者明确拧过的旋钮：字号 70–200%（根 `font-size` 百分比）、行距三档、对齐、**字体是显式开关**（`auto`=书未嵌字体则沿用简斋阅读字体 / 嵌了则尊重出版社；`publisher`；或任一 `ARTICLE_FONT_PRESETS`），暗色主题图片 `brightness(.88)`。主题切换时订阅 `useThemeStore.mode` 重注入。
- **进度与位置**：一切来自 foliate `relocate`（`fraction`/`section`/`tocItem`/`cfi`）；进度条可拖（`goToFraction`），文案「12% · 第 3/117 节 · 章名」，**不承诺总页数**。位置记忆 `jz-epub-pos:v1`（按附件路径 key，存 CFI + fraction 冗余，200 条修剪）：回访先 `init({lastLocation: cfi})`，CFI 失效再按 fraction 回落，工具条显「· 续读」。
- **目录高亮 = 页顶标题语义**（`pickActiveTocId`）：foliate 自带 `tocItem` 取「可见范围内最后一个锚点」，细粒度目录（一屏三个小节）点 1.2 会亮 1.3；父层用 `book.resolveHref` 把本节目录锚点与可见范围起点比较，取「起点之前/之处的最后一个」，与 Apple Books 一致。侧栏含封面缩略图 + 书名/作者、目录（嵌套缩进、活动项自动滚到中间，**只滚侧栏自身勿 scrollIntoView**）、全书搜索（foliate `search()` 逐章流式出结果，命中高亮 + 点击跳 CFI）；≥960px 为固定右栏，窄屏为 Drawer。
- **脚注**：foliate `FootnoteHandler`（`epub:type=noteref` / `sup>a` 启发式）把注释渲成第二个 `<foliate-view>` 挂进右下弹卡（`.jz-epub-footnote`，滚动版式、同一张用户表），可「跳转到原文」。
- **全屏走 Fullscreen API 作用于同一 wrapper**，不用 portal：搬移元素会让章节 iframe 重载、分页器状态全丢。
- **安全三层**：后端上传即净化（`epub_sanitize.py`：剥 `<script>`/`on*`/`javascript:`/iframe·object·embed、丢 `.js` 与 manifest `scripted` 标记，拒路径穿越/压缩炸弹/无 `mimetype`；干净文件字节原样存、脏文件重写为 `mimetype` 首位 STORED）→ 前端 `transformTarget` 加载时再剥一次（存量老文件）→ 生产 Caddy `Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval'`（`blob:` 文档继承父页策略；iframe `sandbox` 因 WebKit bug 218086 必须 `allow-scripts`，**不可作为防线**）。
- **一期 b 批（2026-09-01，用户三点反馈 + P1 十项）**：① **目录拖宽**——rail 与 stage 之间 `.jz-epub-grip`（pointer capture + rAF 节流，180–440px，`prefs.railWidth` 持久化，键盘 ←/→ 16px；拖动期间 `.is-resizing` 让 iframe `pointer-events:none` 否则吞掉 pointermove），侧栏头部（封面/书名/目录·搜索）固定、列表独立滚动区 `.jz-epub-side-scroll`；目录改**折叠树**（`defaultExpandedTocKeys` 默认展开两级、chevron 展开三级、活动章路径自动展开 `tocAncestorKeys`），点击的目录项在其锚点仍在可见范围内时保持高亮（`clickedTocRef`，否则单栏下一页装下章标题+1.1–1.3 时「页顶标题」会回跳章标题）。② **书页归一化**（`normalizeChapter`，每章 `load` 一次）：出版社带底色的块（`BOX_SELECTOR`）打 `data-jz-box`（只含 `<pre>` 的框打 `"code"`）、带边框的打 `data-jz-frame`，用户表把它们重绘成主题化框（`rgba(ink,.045/.06)` 底 + 8px 圆角）而不再删框；`pre` 统一为简斋代码块（等宽栈、.88em、1.6 行高、内边距、圆角、按空格折行）；**XHTML 章节 `tagName` 是小写**，比较一律用 `localName`。③ **字体语义映射**（`classifyFontFamily` + `buildFontMappingCss`）：只在正文字体覆盖生效时，收割出版社样式表（`doc.styleSheets`，跳过带 `/*jz-user*/` 标记的用户表与 `data-jz` 样式）与内联 `style` 的 `font-family`，按角色重定向——楷→`FONT_STACK_KAI`、黑→`FONT_STACK_SANS`、宋/serif→所选正文字体、等宽→`FONT_STACK_MONO`、其它（音标/图标字体）不动——写入每章 `<style data-jz="font-map">`；`pre/code/kbd/samp` 一律等宽。「出版社原样」则零映射。④ 栏数 `'auto'`（stage ≥ 1120px 才双栏，`resolveColumns`）；页脚「本章 x / y 页 · 12%」（`renderer.page/pages`，内容页 = pages−2）；工具条改胶囊分组 + 上一章/下一章按钮（Shift+←/→、Home/End）；进度条 tooltip 带章名（`getSectionFractions` 边界同步算）；书内图片点击→AntD Image 预览（blob URL 同源，`getContainer` 挂 wrapper 以兼容全屏）；专注模式（`body.jz-reader-focus` MutationObserver）时盒高 `calc(100vh - 72px)`；33MB 下载用流式 fetch 显示进度条。
- **一期 c 批（2026-09-01，用户四点 + 自审 ★ 七项）**：① **代码块复制**——`pre::after` 伪元素画按钮（悬停显现、触屏常显），点击落在 `pre` 右上 72×30 热区即复制、`data-jz-copied` 切「已复制 ✓」1.5s；**零 DOM 注入**（CFI 位置记忆安全）；剪贴板必须用**章节 iframe 自己的 `navigator.clipboard`**（点击发生在 iframe、父文档未聚焦会被拒 "Document is not focused"），父文档与 `execCommand` 只作回退。② **翻页动画 = View Transitions**：`withTurn(dir, fn)` 包住 `goLeft/goRight/goTo`，过渡期给 `.jz-epub-stage` 打 `view-transition-name: jz-epub-page`、`<html data-jz-turn=滑动|覆盖|淡入|上下|仿真 data-jz-turn-dir=next|prev>` 选关键帧（reader.css），**`html[data-jz-turn]{view-transition-name:none}` 让根元素退出快照**——否则 theme.css 的 `::view-transition-old(root)` 溶解规则会在每次翻页整页重放；跳转（目录/搜索/进度条）一律淡入；「仿真」= 绕左缘 `rotateY(-100deg)` + 明暗渐变的 3D 近似；`prefersReducedMotion`/无 VT 浏览器（Firefox）降级为 foliate 自带 `animated` 滑动或无动画；spike 证实 VT 能截到 closed shadow root 内 iframe 的画面。③ **全屏沉浸**：所有 AntD 弹层（Popover/Select/Tooltip/Slider tooltip/Drawer/Image/Modal）`getPopupContainer` 指向 wrapper——Fullscreen API 只显示全屏元素子树，portal 到 body 的弹层全部不可见；工具条 `position:absolute` 悬浮、指针空闲 2.6s 后 `is-chrome-hidden` 上滑隐藏，移动鼠标/点页面中央呼出，弹层打开时不隐藏；foliate `autohide-cursor`。④ **字体与 MD 阅读页统一**：EPUB 字体列表 = `useArticleFontPresets()`（共享预设 + `localFonts.ts` 本机字体探测：canvas 双兜底测宽，`document.fonts.check` 对系统字体恒 true 不可用），新增思源黑体（`@fontsource-variable/noto-sans-sc`）与站酷小薇预设，选项用自身字体渲染预览；`ReaderFontPicker` 同 hook。⑤ ★：滚轮/触控板翻页（iframe 内 `wheel` 累计 48px、420ms 锁）；前进/后退（foliate `history` + `index-change`）；剩余时间（`relocate.time` 按 1600 字节/分钟估算 → 工具条「剩约 N 分钟」+ 页脚 + tooltip 全书）；目录筛选框（>12 条时显示，匹配忽略折叠）；**代码语法高亮走 CSS Custom Highlight API**（lowlight 动态导入 `highlightAuto` 限定语言子集、relevance≥4，`tokenSpansFromHast` 算偏移 → `Range` → `CSS.highlights.set('jz-hl-*')`，`::highlight()` 上色，零 DOM 改动）；超宽表格打 `data-jz-wide` 点击开 Modal 全宽查看；纸色（跟随主题/米黄/护眼/羊皮纸/夜墨，`EPUB_PAPERS` 覆盖 bg/fg 且 wrapper 同色）。
- **字体/字号/行距与文章阅读页共用同一份偏好**（2026-09-01，用户要求「MD 里生效的字体类型和效果在 EPUB 一致」）：EPUB 不再持有自己的 `font/fontScale/lineHeight`，直接读写 `jz-article-font`（`articleFont.ts`）与 `jz-reader-font-scale`/`jz-reader-line-height`（`readerLayout.ts`），取值范围、档位、默认值（16.5px `--jz-fs-read` × 缩放、行高 1.85）全部与 `.markdown-preview` 相同，任一端改动另一端下次渲染即跟随（跨标签页监听 `storage`）；EPUB 专属只剩「出版社原样」开关（`publisherFont`）、首行缩进（`indent` 跟随书籍 / 无）、版式/栏数/翻页动画/纸色/对齐。旧 `prefs.font` 预设键首次挂载迁移进共享键（`legacyEpubFontKey`）。CDP `getPlatformFontsForNode` 逐预设对比 MD 与 EPUB：9 个预设渲染字体、字号、行高、字重、字距完全一致；**Verdana 无汉字**，其预设栈的中文回退改为自托管思源黑体（`FONT_STACK_VERDANA_READER` 第二位 `Noto Sans SC Variable`），任何设备上中英混排观感都一致；Georgia 预设同理回退 Noto Serif SC。
- **边栏目录重排（2026-09-01，用户反馈「目录样式丑」）**：借 Apple Books / Readest 的目录语言——去掉面板 3px 竖条与活动/悬停行竖条，活动行改**圆角柔色底 + 强调色文字**（`--jz-toc-accent` 统一用站点 `--jz-accent`，勿用知识库金色，否则与阅读器内绿色分段控件撞色）；三层排版：篇 = 衬线小标签（字距 .06em、淡色、组前留白）、章 = 主行 500 字重、节 = 小一号 + 左侧 1px 导引线代替空箭头槽；标题经 `splitTocTitle` 拆成编号（tabular 淡色小一号）+ 正文（最多两行 clamp），两 span 之间保留一个文本空格以维持 `textContent`「第1章 路由器…」（flex 不渲染空格、复制/测试语义不变）；头部封面 46×64 带书脊高光、无封面用图标占位、书名两行、作者字距、**已读进度条**（`progress.fraction` + 节计数）；分段控件扁平柔色、筛选框 `variant="filled"` 圆角带搜索图标；搜索命中行同圆角柔色。翻页动画默认改「无」（用户拍板，选项顺序「无」居首）。**目录二轮（用户五点）**：各层统一 `--jz-font-ui` 与 `--jz-text`（字体纪律测试只认 `var(--jz-font-*)`，勿引中间变量），层级只靠字重 600/500/400 + 缩进 + 导引线；标题**默认单行省略**（`data-wrap=on` 切两行 clamp）；每条右侧**约页码**——EPUB 无固定页，`estimateTocPages` 按 foliate 节字节表把各节起点映射到「总页数 = 总字节 ÷ 每页字节」，每页字节由**实际渲染过的多页章节**实时校准（`addCalibration`，封面等单页节不参与；默认 3500B），同节多条目按序线性分布，头部显示「约 N 页」；「全部展开 / 全部折叠」按钮；「目录设置」弹层（间距三档 / 字号三档 / **字体**：界面·衬线·楷体·文楷·跟随正文（正文栈以内联 style 挂在 nav 上，CSS 侧 `font-family: inherit`，绕开字体纪律测试对中间变量的限制）/ **颜色**：正文色·淡显·分层淡显（篇与节淡、章正常，即首版的淡色分层观感）/ 长标题换行 / 显示页码，`prefs.toc` 持久化，弹层容器指向 wrapper 以兼容全屏）。
- **自托管字体必须注入章节文档**（2026-09-01 修）：`@font-face` 只声明在父页面 CSS 里，章节 iframe 自有文档看不到 → 宋体/思源黑体/文楷/等宽在书里全部静默退化为系统字体（CDP `getPlatformFontsForNode` 实测「宋体」渲染成 Liberation Serif、「思源黑体」成 Liberation Sans，预设之间几乎无差别，用户感知「切字体没变化」）。修=`collectSiteFontFaces()` 从父页 `document.styleSheets` 收集阅读预设/角色栈涉及家族的 `CSSFontFaceRule`，`url()` 按样式表 href 解析为**绝对地址**（blob: 文档解析不了根相对路径），`injectSiteFonts(doc)` 在每章与脚注视图 `load` 时前置 `<style data-jz="fonts">`；字体文件与父页同 URL 走 HTTP 缓存。验证：章节内 `document.fonts` 出现 loaded 的 `Noto Sans SC Variable`。
- **vendor 补丁**仅一处：`paginator.js setStylesImportant` 加 `if (!el) return`——ResizeObserver 可能在新章节 iframe 尚未解析出 body 时触发 `render()`，上游会抛未捕获错误（无功能影响）。
- **二期 ① 划线 · 笔记（2026-09-02，`apps.reading` + `EpubSelectionBar` / `EpubHighlightCard` / `EpubNotesExportModal` / 侧栏「笔记」tab + 纯函数 `utils/epubNotes.ts`）**：选中章节文字 → 浮条（复制 / 七色（黄绿蓝粉紫 + 2026-09-03 红橙；`utils/epubNotes.ts HIGHLIGHT_SWATCHES` 单源，`reader.css ::highlight()` 副本由 `highlightCss.test` 锁一致）划线 / 下划线 / 写笔记 / 搜本书 / 引用为 Markdown）；划线经 foliate 自带 overlayer **SVG 覆盖层**绘制（`view.addAnnotation({value: cfi, color, style})` + `draw-annotation` 里按 style 选 `Overlayer.highlight/underline`），**零 DOM 注入**（CFI 稳定）；overlayer 的下划线/波浪线画在文字矩形底边、贴 CJK 下缘，`offsetUnderline` 包装绘制函数整体下移 3px（`UNDERLINE_GAP`，竖排沿行外侧偏移）。要点：① foliate 一次只活一章、翻章即重建 overlayer → 应用层必须持有列表（`highlightsRef`）并在 `create-overlay` 回放；`addAnnotation` 对未渲染章节静默 no-op，对**未 `open` 的 view 会抛**（列表先于书到达时）→ 绘制/闪烁/跳转前守卫 `view.book`。② 选区在章节 iframe 里，父文档收不到 `selectionchange`：在 `load` 的 `doc` 上监听 `selectionchange`+`pointerup`（160ms 防抖，按下期间不出条），矩形经 `frameElement.getBoundingClientRect()` 映射到 stage 坐标（`anchorFromRange`），浮条/卡片渲染在 wrapper 内（全屏可见）。③ **章节加载后分页器会连发多次 `relocate`**（字体/ResizeObserver 重排）——`relocate` 里勿一刀切关卡片：卡片按当前章节 `resolveCFI(cfi).anchor(doc)` 重新锚定，只在划线离开可视区/换章时关闭；浮条只在页首 CFI 变化时清除。④ 点击已有划线：foliate 在 `doc` 上做 `hitTest` 发 `show-annotation`，自家 click 处理器先 `overlayer.hitTest(ev)`，命中即返回（不翻页不关卡）；从笔记列表跳转走 `view.showAnnotation()`（跨章导航后再发同一事件）。⑤ 划线章节名取 `view.getProgressOf(index, range).tocItem`（一个 spine 节可含多个目录项，页顶章节会错）。⑥ 覆盖层不透明度/混合模式走 wrapper 上的 `--overlayer-highlight-opacity/blend-mode`（自定义属性穿透 shadow root；亮纸 multiply、暗纸 `data-dark` 时 screen）。⑦ 引用/导出 Markdown 的回链统一 `/d/<id>?cfi=`（`DocLinkResolver` 透传 query；`PostDetail`/`DocEditorPage` 读 `cfi` 传 `initialCfi`，开书时优先于位置记忆并用 `Overlayer.outline` 闪烁 1.8s，**闪烁 key 就是 CFI**——与同 CFI 划线共用 overlay key，删闪烁后需重绘该划线）。⑧ 笔记导出：`buildNotesMarkdown` 按章分组、CFI 阅读序（`epubcfi.compare`），读者下载 `.md`、作者可「存为文档」（`createDocument`，仅 `is_staff`）；「发到评论」= `createComment(doc, 引文+笔记)`。Escape 关闭浮条/卡片的处理放在 `keyNav` 的 `isTypingTarget` 早退之前（焦点常落在 Segmented 的 `<input>`）。固定版式（FXL）书无 overlayer → `canHighlight` 关闭。Playwright 冒烟 27 项（读者 + 作者各一遍）。
- 一期未做：书签 tab / 搜索上一处下一处 / 章末卡片 / 读完页（二期 ②）、AI 与金句卡片（二期 ③）；固定版式 EPUB 走 foliate 的 `foliate-fxl` 渲染器但未专门调优。

**全屏「自己向上跳」修复（2026-09-02）**：全屏工具条是**纯覆盖层**（`position:absolute` 盖在 44px 页眉带上，显隐只动 `transform/opacity`），`.jz-epub-body` 盒子在显隐前后必须完全不变——foliate `Paginator` 对容器挂了 ResizeObserver，stage 尺寸每变一次就整章重排并 `#scrollToAnchor`，过渡动画会让这件事逐帧发生。配套两处 vendor 补丁（`paginator.js`，记录在 `VENDOR.md`）：视口无文字时锚点不再退化为 body 起点（滚动模式存「视口顶所在元素 + 像素偏移」，翻页模式存分数），`#justAnchored` 只在真会产生 scroll 事件时置位。排查套路：`view.renderer.addEventListener('relocate')` 能拿到 `detail.reason`（`anchor`/`scroll`/`page`…，view.js 转发时丢掉），`renderer.start/size/page/pages` 是公开 getter；给 `.jz-epub-stage` 挂 ResizeObserver 计数即可判断是不是布局触发。

### Markdown 阅读页划线 · 笔记（2026-09-02，批次 A）

EPUB 划线的同款体验移植到 `/posts/:slug` 的 Markdown 读路径（HTML 沙箱 iframe、PDF 无文字层、PPT 图片流明确不做）。组件 `components/blog/MdAnnotator.tsx`（挂在 `<article>` 内、绝对定位复用 `EpubSelectionBar`/`EpubHighlightCard`/`EpubNotesExportModal`）+ 右栏 `PostSidePanel`（目录 / 笔记 Segmented，`TocPanel` 加 `hideHeader`）+ 纯函数 `utils/textAnchor.ts`（12 单测）。

- **锚 = TextQuote**：`{quote, prefix, suffix, heading}`（heading=最近 H1–H4 slug 用于消歧加权；章节显示名存 `chapter` 字段）。重锚两遍：精确匹配（上下文逐字符打分 + 命中标题节 +1000）→ 空白归一化（`normalizeWithMap` 带索引映射）；找不到=「已失效」Tag 保留（用户拍板勿删）。**锚定排除子树** `ANCHOR_EXCLUDE_SELECTOR`（button/svg/代码块/链接卡/doc 卡/KaTeX）——CardEnhancer 异步注水、LongImageEnhancer resize 包裹节点，不排除则全文偏移不稳。
- **绘制 = CSS Custom Highlight API**（主文档首次使用）：15 组注册名 `jz-md-{hl|un|sq}-<color>` + `jz-md-flash`，规则在 reader.css（`::highlight()` 只支持 color/background-color/text-decoration/text-shadow；波浪线 = `text-decoration-style: wavy`；下划线 `text-underline-offset: 5px`、波浪线 4px——2026-09-02 用户反馈「离字太近」上调）。零 DOM 注入；无点击目标 → 点击 `caretPositionFromPoint` + `Range.isPointInRange` 命中；`article.paper` 加 `position: relative` 供浮条/卡片锚定。
- **与 SelectionAI 合并**（用户拍板）：读态 `hideTrigger` 隐藏其浮标，划线浮条挂 AI Dropdown（仅 staff，`MD_BAR_AI_OPS` 与 `SELECTION_OPS` 同集须同步），选中操作经 `externalRequest={text,op,seq}` 转发进 SelectionAI 的流式面板；编辑态维持原浮标 + 编辑面回写不变。新增 `explain` op（`prompts.py` + `aiOps.ts` 镜像）。
- **深链 `/d/<id>?hl=<highlightId>`**：`DocLinkResolver` 透传 query，`PostDetail` 读 `hl` → 加载+重锚完成后滚动、闪烁（`jz-md-flash` 1.8s）、开卡。引用/导出 Markdown 的回链按锚类型自动选 `?cfi=`（EPUB）或 `?hl=`（MD）。**同 slug 文档跨 KB 存在**：测试/排查勿硬编码 doc id，用 `resolve_public_post_by_slug` 取页面实际那篇。
- 排序：MD 无 CFI，按重锚后的过滤文本偏移排（失效行按 created_at 殿后）；分组沿用 `groupByChapter`；浮条/卡片/笔记列表样式复用 `.jz-epub-selbar/.jz-epub-hlcard/.jz-epub-note`。
- Playwright 冒烟 `Test/scripts/md_notes_smoke.py`（读者 25 + 作者 26 项）。

### 知识库目录 EPUB 范式移植 + 大类标识（2026-09-02，批次 B）

用户拍板：落左栏知识库列表 + KB 页右侧文档列表两处、目录设置全套。零后端改动。

- **通用树工具 `utils/treeToc.ts`**：EPUB 目录的七个纯函数（`splitTocTitle`/`tocParentKey`/`tocAncestorKeys`/`tocHasChildren`/`defaultExpandedTocKeys`/`visibleTocEntries`/`filterTocEntries`）泛型化抽出，`epubReader.ts` 原地 re-export（EPUB 侧零调用方改动，单测经 re-export 继续锁行为）。`utils/kbToc.ts`：`flattenKbTree`（渲染序 docs-先-子文件夹-后，点路径 key）、`KbTocPrefs` 全局单 blob `jz-kb-toc-prefs:v1`（只在显式操作写入——冻结默认值陷阱）、`loadKbFolds/saveKbFolds`（`jz-kb-folds-v1:<slug>`）、`groupKbsByCategory`（按 order,id 排、未分类殿后）。
- **`PublicKbFolderTree` 重写**：整树复用 `.jz-epub-toc-*` CSS（`.jz-kb-toc` 只重置容器面），默认两级展开、活动文档祖先自动展开且**树重载（pin/收藏后 reload）不重置用户折叠**（`seededRef` 只播种一次）、活动行自动滚动（自实现 scroll-parent 查找，**勿 scrollIntoView**）、筛选（>12 条）、全展/全折、目录设置弹层全套（间距/字号/字体四选/颜色三档/换行/**显示篇数**——EPUB「页码」槽位的 KB 对应物）；文档行保留 DocFormatTag + pin/收藏按钮，`splitTocTitle` 拆编号。旧 props（density/showCounts/canManage）保留兼容但由 prefs 接管。
- **大类标识**：`/public/kbs/` payload 本就带 `category`（前端此前从未消费）——左栏知识库列表按大类分组（`.jz-kb-nav-cat` 组头：衬线小字 + `--jz-cat-accent` 色点，未分类殿后），「当前知识库」卡 meta 前缀大类名。**知识库列表自有设置键**（用户追加，2026-09-02）：`jz-kb-list-prefs:v1` 独立 blob——间距/字号/字体/颜色（正文色·淡显）/大类分组开关/显示篇数，data 属性挂 `.jz-kb-nav-kbs` section，同「只在显式操作写入」纪律。
- **KB 页右侧文档列表**：文件夹分组标题可折叠（chevron + 点击/Enter，`.is-foldable/.is-folded`），折叠集按 KB 持久化 `jz-kb-folds-v1:<slug>`（默认全展开、只在显式切换写入）；工具条加「展开/折叠全部分组」。
- Playwright 冒烟 `Test/scripts/kb_toc_smoke.py` 19 项。

### 目录设置：站点默认 + 本地覆盖（2026-09-03）

用户拍板：右侧目录个性化 + 默认不换行、后台独立 `/admin/toc` 全局设置、更多字体。

- **一份偏好形状 `utils/tocPrefs.ts`**（`TocPrefs`：density / size / font / color / **weight(细·标准·粗，各层级整体减/加一档，文楷仅 400 会合成加粗)** / depth(2·3·4·全部) / wrap / counts / numbers；`TOC_FONT_OPTIONS` 九项字体：界面·宋体·楷体·文楷·思源黑·小薇·书法(马善政)·等宽·跟随正文，令牌引用或 `fontStacks.ts` 阅读预设栈；键名/取值与后端 `TOC_PREF_CHOICES` 镜像）。**两层合成**：`stores/tocSettings.ts` 一次拉 `/public/toc-settings/` 作站点默认，`useTocPrefs(scope)` 叠本地覆盖 `jz-toc-prefs:v2:<article|kb>`——**只存显式改过的键**、只在显式操作写入、`reset` 清空即「跟随站点设置」（齿轮右上角点表示有覆盖）。字体经 `--jz-font-toc` 内联变量下发（命名以 `--jz-font` 开头才过 `typographyTokens` 纪律），CSS 只保留一条 `font-family: var(--jz-font-toc, var(--jz-font-ui))`，旧 `[data-font]` 规则删除。
- **层级引导线（有道云式，2026-09-03 用户追加）**：`.jz-epub-toc-item.is-l2/3/4` 用多重 1px 背景条纹在每个祖先的尖角号中心（`--jz-toc-guide-x + k × --jz-toc-indent`）画连续竖线，最近一级略深、活动行那一级亮 accent（`:has(> .is-active)`）；行距从 margin 改 padding 保证线不断。同一套规则覆盖博客目录树 / EPUB 目录 / 文章目录 / 后台预览；KB 页嵌套文件夹分组 `.jz-kb-folder-section.is-nested` 左侧竖线 + 标题肘线。
- **`TocPanel`（MD/Docx）与 `PdfTocPanel` 重写**为 data-* 驱动 + 复用 `.jz-epub-toc-*` 行（`.jz-article-toc` 只重置容器面并把 accent 指向 `--jz-doc-accent`）：默认单行省略、层级按最浅标题归一（`relativeTocLevel`）、层级深度裁剪、编号开关、>12 条出筛选框、齿轮弹层 `common/TocSettingsPopover`（`TocPrefsControls` 表单 + `TocFontSelect` 逐项以自身字体预览）。`PublicKbFolderTree`（scope `kb`）、`EpubSidebar` 与左栏 `BlogKbNavPanel` 列表的字体项都换成同一份九项列表；EPUB 目录偏好仍在自己的 `jz-epub-prefs` blob（不吃站点默认，刻意）。旧 `jz-kb-toc-prefs:v1` 键废弃（默认值从代码迁到服务端属改默认值，按约定 bump key）。
- **后端 `TocSettings` 单例**（`apps/accounts/models.py` pk=1 JSONField + `repair_toc_prefs`，`save()` 先修复再清 `toc:public:v1` 缓存）+ `apps/accounts/toc.py` 两端点：`GET /public/toc-settings/`（`PublicOrLoginGated`，5 分钟缓存）、`GET/PATCH /auth/toc/`（`IsContentAuthor` 读、staff 写，严格校验 400、`{reset:true}` 恢复出厂）。迁移 `accounts 0009`。
- **后台 `/admin/toc`**（`pages/admin/TocSettingsPage`，侧栏「目录设置」用 `JzIconKit.JzTocIcon` + 靛蓝 `jz-ico-tone-toc`）：页头作用范围芯片 + 粘性操作条（保存 / 恢复出厂、脏态文案），三张分区卡（排版 / **字体画廊**九款逐款字样 radio 卡 / 颜色与显示开关行带说明），右侧粘性「仿真右栏」实时预览（文章目录 / 知识库目录两页，含引导线与篇数），保存即全站生效（同会话经 `setDefaults` 立即更新）。样式块在 theme.css「目录设置页」。
- 冒烟 `Test/scripts/ui_batch_smoke.py`（读者+员工双流程 44 项：目录 nowrap/覆盖只存改动键/跟随站点设置、后台保存→公开端点→新设备继承、七色浮条、行内 hover 显现、Tree/Collapse 尖角号、后台图标钮逃逸 36px 规则）。

### EPUB 导航批次 C：搜索导航 / 书签 / 章末卡 / 读完页（2026-09-02）

- **搜索上一处/下一处**：命中列表在 `EpubSidebar` 内摊平为阅读序 `allHits` + 游标（计数「n / N 处」、循环步进、当前命中行 `.is-current`）；跳转走 `onJumpToSearchHit`（reader 侧 `jumpCfi` + `flashCfi` 闪烁）。命中描边改站点 accent（`view.search({drawOptions:{color}})`——`foliate-search:` key 空间仍归 view 管，闪烁用裸 CFI key 不冲突）。
- **书签**（`Bookmark` 模型批次 A 已预置）：工具条书签按钮按「当前页首 CFI === 已存书签 CFI」判定实/虚（页首 CFI 每次 relocate 稳定可比对），excerpt 取 `relocate.range` 页面可见文本前 100 字；侧栏第四 tab「书签」（章名/摘录/时间/删除，点击跳转+闪烁）。
- **章末「下一章」卡**：仅分页态；条件 `chapterPages.page >= chapterPages.pages`（marginals 已把 padding 两页扣掉；**裸 `renderer.pages` 含 2 页 padding**，末内容页 = pages−2——脚本/逻辑勿用错，且 foliate `next()` 会**跨节**，循环翻页须以此为停止条件）；标题 = 下一 spine 节的第一个 TOC 条目（`tocSectionRef` 里 > 当前节的最小节）；末节变「读完这本书」入口。
- **读完页**：stage 内覆盖层（勿 portal）——完成时间 `jz-epub-done:v1`（`markEpubDone` 首开盖章、幂等）、划线/书签计数、「导出读书笔记」、同书架相关书籍（`listPublicPosts({kb, doc_format:'epub'})`——后端 `PublicPostViewSet` 新参数按「任一 EPUB 附件」近似 `doc_format` 派生语义；**参数名勿用 `format`**，那是 DRF 内容协商保留参数）。`kbSlug` prop 经 `PublicAttachmentPreview` 从 PostDetail 穿入。
- 冒烟 `Test/scripts/epub_nav_smoke.py`（搜索段 12 项 + 导航段 14 项；`SKIP_SEARCH=1` 跳过全书扫描段）。**冒烟坑**：KB 左栏树与 EPUB 目录共用 `.jz-epub-toc-*` 类，选择器须限定 `.jz-epub-rail`；点过侧栏其它 tab 后目录列表不在 DOM。

### 阅读端 UX 修复第一批（2026-07-24）

两轮全量 UI/UX 审查（8 份报告）后的第一批落地，读者侧要点：

- **移动端 / 专注模式 TOC·KB 抽屉（根治死 FAB）**：`PostDetail` 新增 `tocDrawerOpen/kbDrawerOpen`（**刻意不持久化**，防移动端开页即遮正文）+ `useTocDrawer = focusMode || !tocRailWide`、`useKbDrawer = !layoutWide`——FAB 在宽屏开侧栏 rail、窄屏（<1281px / <1101px）与专注模式改开 AntD Drawer（点目录项自动收起）。修复两个存量缺陷：961–1280px 区间 FAB 点击设置的 `tocOpen` 无任何面板消费（死按钮）、`reader.css` 曾在 ≤960px 直接 `display:none` 隐藏 FAB（手机完全无目录入口，规则已删）；专注模式的隐藏清单放行 `.jz-toc-fab`（沉浸读长文恰恰最需要跳节）。
- **阅读位置记忆**：新 `utils/readingPosition.ts`（单 localStorage map `jz-reading-pos:v1`；save 带 0.03–0.97、resume 带 0.05–0.95、上限 200 条按时间戳剪枝；纯函数 + happy-dom 共 9 单测）。`PostDetail` 在 read 模式 rAF 节流保存滚动百分比，回访命中 resume 带时浮出「继续上次阅读 · N%」pill（`.jz-resume-pill`，12s 自动消失，点击平滑跳转）。
- **阅读默认值**：默认字体 Verdana → **宋体**（`ARTICLE_FONT_PRESETS` 宋体提至首位，`loadArticleFont` 兜底 `[0].key`；Verdana 无 CJK 字形，旧默认实为「西文 Verdana + 中文苹方」混排且与宣纸调性相悖）；默认版心 满栏 → **860px**（宽屏满栏轻易超 45 字/行）。两者对 localStorage 已有存值的用户零影响。
- **纸张 swatch 不再骗人**：`.jz-blog-glass` 把宣纸/牛皮纸/羊皮卷中性化为同一玻璃面（有意，见 §2 自查清单 5），但 PaperPicker 的 swatch 预览（portal 在 glass 外）仍显真实暖纹——`PaperPicker` 加 `hiddenKeys` prop（当前选中值恒保留），`PostDetail` 传三种暖纸隐藏；字体/纸张控件改为仅 `isMarkdownReadPath || edit` 显示（sandbox iframe / 二进制阅读器两者均不生效，展示即破坏「控件即有效」契约）。
- **读者/作者边界收口**：GlobalSearch 去 `rank` 分值、「草稿」Tag 仅 `is_staff`、空查询提示 + `scrollIntoView` 跟随；博客搜索非公开结果改走 `/d/:id`（作者被弹进编辑器、读者得体面 404）；`DocLinkResolver` 404 补「返回首页」（该路由在 BlogLayout 外，原是无 chrome 死路）；FavoritesPage 按 `is_staff` 隐藏「编辑」/状态 Tag、读者 KB 链接走 `/kb/:slug`、空态 CTA 分流（读者→`/`）、取消收藏加 Popconfirm、`/admin/favorites` 挂载不再渲染古风 hero；退出登录仅 `/admin` 路径回登录页（博客路径回 `/`）；**侧栏收藏星标对登录读者开放**（收藏端点本就绕作者 scope——`BlogKbNavPanel` 的 `favHandler` 按 `sessionUser` 门控、pin 仍 `canManage`，`PublicKbFolderTree.showActions` 只看 handler 存在性）。
- **外链**：`markdown.ts` link_open 对 `https?://` 统一 `target="_blank" rel="noopener noreferrer"`（与链接卡片对齐；`target/rel` 本就在 DOMPurify 白名单）。
- 后台顺带批：品牌默认色 `#1677ff`→`#10b981` 清扫（KBListPage/UsersPage/TagPicker 六处）；UsersPage 标签重命名 `window.prompt`→受控 Modal、新建密码下限 4→8 与重置对齐；暗色主题变量泄漏修复（BacklinkPanel/CommentsPanel `#f0f0f0`、DocHoverCard 阴影/错误红、TagPicker `#ddd`）；ExportsPage 失败态 Alert 收敛为单行 danger + Tooltip、ExportDialog PDF 提示去运维命令。

---

## 6. favicon + PWA + OG（2026-09-02 重做）

- 全部由 `Test/scripts/gen_favicon.py` 生成（gitignore；依赖 backend venv `fonttools brotli Pillow` + 主机 `rsvg-convert`），改图改脚本重跑：
  - `favicon.svg` 翡翠方印（`#02b377→#19d191` 对齐 `--jz-accent`）+「簡」**字形 path**（Noto Serif SC 700，从 @fontsource 第 47 分片提取；此前 `<text>` 依赖系统字体，无中文字体环境豆腐块），无 `feDropShadow`（librsvg 2.50 不支持且 16px 下糊）
  - `favicon-32.png` / `favicon.ico`(16·32·48) / `apple-touch-icon.png`(180 实底，iOS 不支持 SVG) / `icon-192.png` / `icon-512.png` / `maskable-512.png`（全出血 + 字形收进 80% 安全圆）/ `og-image.png`(1200×630)
- `manifest.webmanifest` icons 拆 `any` 与 `maskable`；`index.html` `theme-color` 两条 `prefers-color-scheme` media（`#02b377` / `#2ee79c`），补 `og:site_name/og:locale/og:image` 与 `twitter:card`
- `html / body / #root` 全局 reset margin/padding 铺满整屏

---

## 7. 布局要点

- **完整编辑两栏铺满**（≥1280）：editor `flex:1`、大纲改流内 sticky 右栏、正文限宽 860 居中
- **坑**：`.jz-doc-body` 内联 `flexDirection` 会盖掉 CSS media query，必须删（见 memory `project_doc_editor_fill_layout`）
- vite `manualChunks` 拆 codemirror / tiptap 独立 chunk；懒加载 pdfjs + mammoth（DocAIPanel chunk 2.25MB→660KB）
