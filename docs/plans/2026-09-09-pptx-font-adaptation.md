# PPT 字体识别与自动适配 —— 探索报告 + 实施方案（2026-09-09）

> 状态：**2026-09-09 已拍板并实施（Phase 0–5 全部落地，Phase 2 度量用公开近似值）**。实现细节以 `docs/editor.md` §8「字体识别与自动适配」为准，本文保留探索证据与决策依据。
> 落地坐标：`backend/apps/editor/services/office_fonts.py`（识别/解析/fontconfig/EOT）· `manage.py build_font_pack`（度量包）· `manage.py office_fonts_conf`（静态配置）· `DerivedFile(deck_pdf).meta.fonts` → `slide_font_report` · 前端 `PptxReader`「字体」弹层 · `Test/scripts/pptx_font_smoke.py` / `pptx_font_audit.py`。
> 与原计划的偏差：Phase 4 报告未新增 `ConversionJob.meta` 字段，改用既有 `DerivedFile.meta` JSONField（零迁移）；字体包默认不子集化（CFF 子集化每面 7 分钟，`--subset` 可选）。
> 相关：`docs/editor.md` §8「PPT 有道云式阅读器」、`backend/apps/editor/tasks.py`、`infra/backend.Dockerfile`。

---

## 0. 结论先行

1. **后端 PPT 管线对字体零处理**：`tasks.py _run()` 给 soffice 的 env 只有 `HOME`+`PATH`（无 locale、无 `FONTCONFIG_*`），镜像只装 `fonts-noto-cjk`+`fonts-dejavu`，无替换规则、无内嵌字体提取、无字体清单记录。前端主区已因「pdf.js 渲染 LO 嵌入子集跨平台不一致被读作乱码」改为**服务端 JPEG 打底 + pdf.js 只叠文字/链接层**（`PdfPageView visual="image"`），因此**视觉保真 100% 由服务端 LibreOffice 的字体可用性决定，前端无法补救**。
2. **实测三类偏差**（本机 LO 7.1.8 转真实样本，`pdffonts` 佐证）：
   - 拉丁字母（Huawei Sans / 微软雅黑 / 方正兰亭黑 的西文部分）全部落到 **DejaVu Sans**（fontconfig 默认 sans），字宽偏宽 → 换行点变化 → 文本框溢出/多出一行，是「渲染错乱」的头号机制。
   - **宋体变无衬线**（fontconfig `宋体`→DejaVu Sans→逐字回退 Noto **Sans** CJK），衬线/黑体语义丢失。
   - 所有 CJK 替代字体（Noto CJK）的竖向度量 **hhea 1.160/0.288 = 1.448 倍行高**，而 宋体/黑体/方正兰亭黑 约 1.0、微软雅黑约 1.33：同一文本框在 LO 里行距膨胀最多 **45%**，是溢出的第二机制。仅靠 fontconfig 别名无法修（fontconfig 不能改度量）。
3. **两个方向已验证可行**：`FONTCONFIG_FILE` 指向自定义配置 + `<match target="pattern"> … mode="assign"` 强替换后，`pdffonts` 中 DejaVu 消失、宋体落 Noto **Serif** CJK；LO 完整尊重 fontconfig 规则，无需改 LO 自身的 VCL.xcu 替换表。
4. **两个误报，勿追**：① `pdffonts` 显示 `NotoSansCJKjp-Regular-VKana` 不代表用了日文字形——Noto CJK OTC 各语言面共享一个 CFF，其 FontName 就是 `…jp`，字形由 cmap 面决定，探针（骨/直/曜）显示 zh-CN 段为 SC 字形；② Wingdings/Symbol 项目符号（1690 处引用）LO 内置重编码到 OpenSymbol，`pdffonts` 可见 `OpenSymbol`，已正确。
5. **内嵌字体**：库内 92 份 pptx **零份**含 `ppt/fonts/*.fntdata`，且 LO 7.x 完全忽略 pptx 内嵌字体（24.x 才开始支持）。列为低优先级独立阶段。

---

## 1. 现状证据

### 1.1 样本字体普查（`backend/media/uploads/**/*.pptx`，92 份，52 份是历史坏 zip 跳过，有效 40 份）

| 字体 | 出现文件数 | 说明 |
|---|---|---|
| Huawei Sans | 19 | 主题 latin 字体（112 处主题引用），**商用、无开源同名**；西文落 DejaVu |
| 方正兰亭黑简体 | 19 | 主题 ea 字体，商用；落 Noto Sans CJK（度量 1.448 vs ≈1.0） |
| 宋体 | 36 | 主题 ea/cs；**落无衬线** |
| 黑体 / 华文细黑 | 5 / 8 | 落 Noto Sans CJK |
| Calibri / Calibri Light / Cambria | 40 / 19 | 已有度量兼容替代 Carlito / Caladea（fontconfig 30-metric-aliases 生效） |
| Arial / Times New Roman | 40 | Liberation Sans/Serif 度量兼容，已生效 |
| Segoe UI | 19 | 落 Cantarell（本机）/ DejaVu（镜像），无度量兼容 |
| Wingdings | 22（1690 处） | LO→OpenSymbol，正常 |
| 新細明體 / 맑은 고딕 / ＭＳ Ｐゴシック / MS PGothic | 40 / 40 / 33 | 主题 `<a:font script=…>` 兜底表，几乎不落到实际文本；映射到 Noto CJK TC/KR/JP 即可 |
| 内嵌字体 `p:embeddedFont` | **0** | — |

（统计脚本：`Test/scripts/pptx_font_audit.py`，见 §4；本次临时版在 job tmp）

### 1.2 转换实测（样本 A：宋体/黑体/华文细黑 47 页；样本 B：Huawei Sans+方正兰亭黑 32 页）

- 基线 `pdffonts`：`DejaVuSans(+Bold/Oblique)`、`NotoSansCJKjp-*`、`LiberationSans/Mono`、`OpenSymbol`。**无 Noto Serif**（宋体丢衬线）、**DejaVu 大量出现**（西文全错）。
- 只加 `LANG=zh_CN.UTF-8`：**无变化**（LO 字体回退不看 locale）。
- `FONTCONFIG_FILE` + `<alias binding="same"><prefer>`（绝对路径）：宋体开始落 Noto Serif CJK；DejaVu 仍在（prefer 只前置候选，不能替掉 fontconfig 对未知拉丁名的默认解析）。
- `FONTCONFIG_FILE` + `<match target="pattern"><edit name="family" mode="assign" binding="strong">`：探针 deck 里 **DejaVu 完全消失**，宋体→Noto Serif CJK、Huawei Sans/微软雅黑/黑体→Noto Sans CJK。**推荐 assign 模式**。
- 注意：`FONTCONFIG_FILE` 必须是**绝对路径**，相对路径 fontconfig 静默报 `Cannot load default config file` 并退化成无配置（我在探针里踩过一次）。

### 1.3 度量对照（fonttools 读取）

| 字体 | hhea ascent/descent | 行高倍数 |
|---|---|---|
| Noto Sans CJK SC | 1.160 / 0.288 | **1.448** |
| Noto Serif CJK SC | 1.151 / 0.286 | **1.437** |
| 宋体 SimSun / 黑体 SimHei（Windows） | ≈0.859 / 0.141 | ≈1.00 |
| 微软雅黑（Windows） | ≈1.058 / 0.273 | ≈1.33 |
| DejaVu Sans | 0.928 / 0.236 | 1.164，xAvg 0.507 |
| Liberation Sans | 0.905 / 0.212 | 1.117，xAvg 0.580 |

`useTypoMetrics=0` → LO 用 hhea/win 值。Windows 字体值来自公开度量（Phase 0 用 fonttools 对真机字体文件核一次再定表）。

### 1.4 代码坐标

- 派发：`backend/apps/editor/views.py:342-352`（`convert_pptx_to_slides.delay`）
- 子进程 env：`backend/apps/editor/tasks.py:41-64 _run()`；soffice 命令：`tasks.py:73-98 render_deck_pdf()`；补 PDF：`tasks.py:156-173 ensure_deck_pdf()`
- 状态：`Document.slide_status/slide_error`（`knowledge/models.py:248-264`）；`ConversionJob`（`editor/models.py:215-281`）；`DerivedFile(deck_pdf)`
- 命令：`backfill_pptx_pdf` / `reconvert_pptx` / `backfill_pptx_notes`；端点 `POST documents/<id>/reconvert-slides/`
- 镜像：`infra/backend.Dockerfile:30-32`；compose `celery-convert`（`docker-compose.prod.yml:155-176`，只挂 media/exports 卷）
- 前端：`PptxReader.tsx:531-556`（`visual="image"`）、`PdfPageView.tsx:33-40`

---

## 2. 目标定义

「PPT 支持字体识别，自动适配源字体」拆成四个可交付能力：

- **A 识别**：转换时解析 pptx 得到字体清单（主题 latin/ea/cs + 运行级 typeface + `embeddedFontLst`），分类（衬线/黑体/楷/仿宋/圆/等宽/符号/未知）+ 是否本机可用。
- **B 适配**：按「精确 → 度量兼容替代 → 同类开源替代 → 语义兜底」四级生成**本次转换专用**的 fontconfig 配置，soffice 用 `FONTCONFIG_FILE` 加载；内嵌字体（若有）解包进临时字体目录并优先命中。
- **C 度量兼容包**：对最高频的商用 CJK 字体（宋体/黑体/微软雅黑/方正兰亭黑/华文细黑/等线/Huawei Sans）用 fonttools 生成**改名 + 改竖向度量**的 Noto 派生字体，消除 1.448 行高膨胀（Carlito-for-Calibri 的做法）。
- **D 可观测**：清单与最终解析结果落 `ConversionJob`/新字段，阅读器角标「本 PPT 含 N 种未安装字体，已用 X 替代」，后台可查；冒烟脚本量化「溢出率」并作为回归门。

---

## 3. 分阶段实施

### Phase 0 — 基线固化（半天，纯脚本，不改产品代码）

1. `Test/scripts/pptx_font_audit.py`：普查库内 pptx 字体（§1.1 表的正式版）+ 对每份有效 deck 跑 soffice 输出 `pdffonts` 汇总 + **溢出率指标**：用 python-pptx 取每个文本框 bbox，`pdftotext -bbox-layout` 取 PDF 文本块 bbox，统计「文本块超出所属形状/超出页面」的比例；结果存 JSON 作为基线。
2. 用 fonttools 从一台 Windows 机器（或用户提供的字体文件）读 宋体/黑体/微软雅黑/等线/华文细黑/方正兰亭黑/Huawei Sans 的 hhea/OS2/xAvgCharWidth，写进 §1.3 表（Phase 2 依赖真实值）。
3. 确认 Debian bookworm apt 可得字体包名：`fonts-noto-cjk fonts-noto-cjk-extra fonts-wqy-microhei fonts-wqy-zenhei fonts-arphic-ukai fonts-arphic-uming fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea fonts-noto-core fonts-unfonts-core fonts-ipafont-gothic`；LXGW 文楷（楷体替代）不在 bookworm，走 Phase 2 字体卷。

### Phase 1 — 静态替换表 + 转换环境修正（1 天，见效最快）

**后端**
- 新模块 `backend/apps/editor/services/office_fonts.py`：
  - `FONT_RULES`：`{源字体名(含别名/PostScript 名/中英文): 目标 family, 类别}`，首批覆盖 §1.1 全部 + 常见 Windows/Office CJK：宋体/SimSun/NSimSun/新宋体/华文宋体/STSong→Noto Serif CJK SC；黑体/SimHei/华文黑体/华文细黑/STHeiti/微软雅黑/Microsoft YaHei/等线/DengXian/方正兰亭黑*/Huawei Sans/HarmonyOS Sans/阿里巴巴普惠体/思源黑体→Noto Sans CJK SC；楷体/KaiTi/STKaiti/华文楷体→AR PL UKai（Phase 2 换 LXGW 文楷）；仿宋/FangSong/STFangsong→Noto Serif CJK SC（无好开源仿宋，标注 known limitation）；新細明體/PMingLiU/MingLiU→Noto Serif CJK TC；맑은 고딕/Malgun Gothic/Batang/Gulim→Noto CJK KR；ＭＳ Ｐゴシック/MS PGothic/游ゴシック/Meiryo→Noto Sans CJK JP；Segoe UI/Tahoma/Verdana→Liberation Sans（无 Selawik 时）；Calibri/Cambria/Arial/Times/Courier 交给系统 metric-aliases 不重复写。
  - `classify_font_name(name)`：未登记名按关键词分类（宋/Song/Ming/明/Serif→serif；黑/Hei/Sans/Gothic/雅黑/兰亭→sans；楷/Kai→kai；仿宋→fangsong；圆/Yuan/Round→sans；Mono/Code/Consol→mono；其它拉丁名→sans），给出兜底目标。
  - `build_fontconfig(font_names, extra_dirs, cache_dir) -> Path`：渲染一份 fonts.conf（`<include>/etc/fonts/fonts.conf</include>` + `<dir>` 内嵌字体目录 + `<cachedir>` 持久缓存 + 每个源名一条 `assign` 规则），**绝对路径**。
- `tasks.py`：
  - `_run()` env 增加 `FONTCONFIG_FILE`、`XDG_CACHE_HOME`（持久目录，避免每次转换重建 fontconfig 缓存）、`LANG=zh_CN.UTF-8`（不解决字体，但修 LO 日期/排序 locale）。
  - `render_deck_pdf()`/`ensure_deck_pdf()` 前先 `inspect_pptx_fonts(path)`（python-pptx 已依赖，用 zip+regex 扫 theme/slideMaster/slideLayout/slides 更快更全），结果传给 `build_fontconfig`。
- 静态基础配置 `infra/fonts/60-jianzhai-office.conf`（同一套 `FONT_RULES` 由 `manage.py dump_font_rules` 生成，避免双源），Dockerfile `COPY` 到 `/etc/fonts/conf.d/`——让**导出端 Playwright Chromium** 同享（顺带缩小「PDF 导出字体与网页不同」的已知限制，但本批不扩展导出范围）。
- Dockerfile 字体层追加 Phase 0 §3 确认的 apt 包 + `fc-cache -f`。

**验收**：探针 deck `pdffonts` 无 DejaVu；样本 A 出现 Noto Serif；`pptx_font_audit.py` 溢出率不高于基线。单测：`test_office_fonts.py` 覆盖规则表命中/别名归一（全角空格、大小写、`,`分隔的多族名）/分类兜底/生成配置 XML 合法。

### Phase 2 — 度量兼容字体包（1–2 天，解决行高膨胀）

- `backend/apps/editor/management/commands/build_font_pack.py`（或 `Test/scripts/`）：从 Noto Sans/Serif CJK SC 的 OTC 抽单面（fonttools `TTCollection` → 单 OTF），按 §1.3 真实值改 `hhea.ascent/descent/lineGap`、`OS/2 typo*/win*`、置 `useTypoMetrics`，`name` 表改为目标族名（`宋体`+`SimSun` 双名、`微软雅黑`+`Microsoft YaHei`…），Regular/Bold 两字重；输出到 **字体卷** `infra/fonts/pack/`。产物 ~100 MB **不入 git**（gitignore），本地生成后 rsync，compose 三个 celery 服务 + backend 绑挂 `./fonts:/usr/share/fonts/jianzhai:ro`。
- 许可核对：Noto CJK 为 OFL 1.1；确认无 Reserved Font Name 后才允许改名派生（Phase 0 顺手核）。
- 有了同名字体后，Phase 1 的 `assign` 规则对这些名自动失效（精确命中优先），规则表保留作无包环境兜底。
- 楷体：把 LXGW 文楷（OFL）全量 TTF 放进字体卷（前端 npm 包是 woff2 分片，不能给 LO 用）。
- **验收**：溢出率相对 Phase 1 再降；抽 3 份真实 deck 人工对照原稿截图（用户在 PowerPoint 里截 3 页即可）。

### Phase 3 — 内嵌字体提取（可选，1 天）

- `p:embeddedFontLst` → `ppt/fonts/*.fntdata`：EOT 容器；未压缩 EOT 去头即 TTF/OTF，MTX 压缩需 libeot（先只支持未压缩，压缩记 warning）。解包到本次转换 tmp 目录，`build_fontconfig` 的 `<dir>` 收进去，`assign` 规则对内嵌名不生成（让精确命中）。
- 库内零样本，优先级最低；但「防后续问题」价值高——用户导出时勾「嵌入字体」的 deck 将原样还原。

### Phase 4 — 可观测与用户提示（半天）

- `ConversionJob` 增 `meta JSONField`（或 `DerivedFile(deck_pdf)` 上）：`{"fonts": {"referenced": [...], "embedded": [...], "resolved": {"宋体": "Noto Serif CJK SC (metric pack)"}, "fallback": ["Huawei Sans"]}}`；一次迁移。
- 序列化器 `slide_font_report` 暴露给作者（读者不显）；`PptxReader` 工具条角标 + Popover 列出替换明细，`reconvert-slides` 旁加「字体报告」。
- 后台 `ConversionJob` 列表已有，补一列。

### Phase 5 — 存量重建 + 文档（半天）

- 部署后 `manage.py reconvert_pptx --all`（40 份有效 deck，单 worker 串行约 20–30 min）；坏 zip 的 52 份跳过（本就 failed）。
- docs：`editor.md` §8 加「字体适配」小节；`deployment.md` 加字体卷与 apt 包；`CLAUDE.md` 陷阱区加一行（FONTCONFIG_FILE 绝对路径 / pdffonts `jp` 名是 CFF 共享名 / Noto 1.448 行高 / assign 而非 prefer）。

---

## 3.5 实施结果（2026-09-09，本机 LO 7.1.8，40 份有效 deck，`Test/out/font_audit_compare.txt`）

| 指标 | 基线 | Phase 1+2 后 |
|---|---|---|
| 使用 DejaVu Sans 的 deck | 22/22（含西文的全部） | **0** |
| 超出页面的文本行占比（均值） | 0.68%（5 份 deck 非零） | **0.00%** |
| 文本块不落在任何文本形状内（均值） | 4.15% | 3.42%（22 份中 20 份下降或持平） |
| 探针 宋体 段落行距 | ≈1.45× 字号（Noto 度量） | **1.20×**（= PowerPoint 单倍行距） |

探针 `pptx_font_smoke.py` 全过：宋体/黑体/微软雅黑/Huawei Sans 命中字体包（PDF FontDescriptor 859/141、1058/262、930/240），Wingdings 项目符号仍走 OpenSymbol，文字层可抽全部探针字。

## 4. 验证方法（贯穿各阶段）

- `Test/scripts/pptx_font_audit.py`：库内普查 + 溢出率（Phase 0 建，之后每阶段跑一次对比 JSON）。
- `Test/scripts/pptx_font_smoke.py`：程序化生成探针 deck（宋体/黑体/微软雅黑/Huawei Sans/楷体/Wingdings 各一行 + 长段落文本框），走真实 Celery 任务（`called_directly`），断言 `pdffonts` 集合 ⊆ 允许集合、无 DejaVu、页数/文本块数不变、文字层 `pdftotext` 能提取全部探针字符。
- pytest：`office_fonts` 单测 + `tasks` 现有测试补 env 断言（`FONTCONFIG_FILE` 绝对路径存在）。
- 人工：3 份真实 deck 与 PowerPoint 截图对照（Phase 2）。

---

## 5. 风险与决策点

| 项 | 风险 | 处理 |
|---|---|---|
| 商用字体（Huawei Sans、方正兰亭黑、微软雅黑、宋体）不能装进镜像 | 法律 | 只做开源替代 + 度量派生，**不分发原字体** |
| Noto 派生改名 | OFL RFN | Phase 0 核许可；若有 RFN 改用「JZ Song Compat」等名 + fontconfig assign 指向 |
| 字体卷需 rsync，不在镜像里 | 部署多一步 | 与 `Local_to_Cloud_Server_kb_sysnc.py` 同一流程；缺卷时 Phase 1 规则表兜底不致崩 |
| 内嵌字体 MTX 压缩 | 解不开 | 只支持未压缩 + warning，不阻塞 |
| 生产 LO 7.4（bookworm）vs 本机 7.1 | 行为差异 | 都走 fontconfig，assign 语义一致；Phase 1 部署后跑 smoke 复核 |
| 存量重建触发 40 次转换 | 队列占用 | `celery-convert` 单并发本就串行，夜间跑 |

**需要你拍板的两点**：
1. Phase 2 度量包是否要做（它是唯一能修「行高膨胀溢出」的手段，代价是 100 MB 字体卷 + 一次 fonttools 生成脚本）。我的建议：做，且 Phase 1 与 2 一并上线，否则 Phase 1 只修字形不修排版。
2. 是否需要从你的 Windows 机器提供 宋体/黑体/微软雅黑/等线 的度量数值（我只需 hhea/OS2 数字，不需要字体文件），否则 Phase 2 用公开资料的近似值。
