import { useId } from 'react';

/**
 * 简斋系统架构图 — 手写 SVG。
 *
 * v2 布局：4 列 / 9 主盒子，加大列宽与列间距，所有连接线走列间空白通道避免穿越盒子。
 * 颜色全部走 ``var(--jz-*)`` CSS 变量，主题切换自动跟随。主请求路径上有三颗交错出发
 * 的紫色光点。viewBox 1440×900，外层按容器宽度等比缩放并保留最小宽度防止文字挤成一团。
 */
export default function ArchitectureSVG() {
  const uid = useId().replace(/:/g, '');
  const arrow = `jz-arch-arrow-${uid}`;
  const arrowAccent = `jz-arch-arrow-accent-${uid}`;
  const flowPath = `jz-arch-flowpath-${uid}`;
  const bgGrad = `jz-arch-bg-${uid}`;
  const bgGlow = `jz-arch-glow-${uid}`;
  const gridPat = `jz-arch-grid-${uid}`;

  return (
    <div
      className="jz-arch-svg-wrap"
      style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}
    >
      <svg
        viewBox="0 0 1440 900"
        xmlns="http://www.w3.org/2000/svg"
        className="jz-arch-svg"
        role="img"
        aria-label="简斋系统架构图"
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: 'block',
          width: '100%',
          minWidth: 1040,
          fontFamily:
            '"Noto Serif SC", "Songti SC", "PingFang SC", system-ui, -apple-system, sans-serif',
        }}
      >
        <defs>
          <marker
            id={arrow}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="strokeWidth"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--jz-text-muted)" />
          </marker>
          <marker
            id={arrowAccent}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="strokeWidth"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--jz-accent)" />
          </marker>
          {/* 动态光点路径：在所有盒子顶端上方的空白带横向流动，避免压住盒内文字 */}
          <path id={flowPath} d="M 175 58 H 1240" fill="none" />

          {/* 画布底色：左上偏暖、右下偏冷的对角线渐变，给画面"光感" */}
          <linearGradient id={bgGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--jz-surface)" stopOpacity="1" />
            <stop offset="55%" stopColor="var(--jz-surface)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--jz-accent)" stopOpacity="0.07" />
          </linearGradient>

          {/* 中央高光：径向亮斑，让视线自然落到 Django 区 */}
          <radialGradient
            id={bgGlow}
            cx="55%"
            cy="35%"
            r="55%"
            fx="55%"
            fy="35%"
          >
            <stop offset="0%" stopColor="var(--jz-accent)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--jz-accent)" stopOpacity="0" />
          </radialGradient>

          {/* 蓝图风格网格：40px 方格、细线、超低透明度 */}
          <pattern id={gridPat} width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 L 0 40"
              fill="none"
              stroke="var(--jz-text-muted)"
              strokeWidth="0.5"
              opacity="0.07"
            />
          </pattern>
        </defs>

        {/* ─── 画布底色 (顺序：纯色→渐变→网格→径向高光→列分组色带) ─── */}
        <rect x={0} y={0} width={1440} height={900} fill="var(--jz-surface)" />
        <rect x={0} y={0} width={1440} height={900} fill={`url(#${bgGrad})`} />
        <rect x={0} y={0} width={1440} height={900} fill={`url(#${gridPat})`} />
        <rect x={0} y={0} width={1440} height={900} fill={`url(#${bgGlow})`} />

        {/* 列分组色带：每层一个色调（~6% 透明），把同一列内的盒子在视觉上归组 */}
        {LAYERS.map((l) => (
          <rect
            key={`band-${l.label}`}
            x={l.x - 8}
            y={56}
            width={l.w + 16}
            height={770}
            rx={14}
            ry={14}
            fill={l.bandColor}
            opacity={0.07}
          />
        ))}

        {/* ─── 层标题 ───────────────────────────────────────────── */}
        <g>
          {LAYERS.map((l, i) => (
            <g key={l.label}>
              <rect
                x={l.x}
                y={20}
                width={l.w}
                height={28}
                rx={4}
                ry={4}
                fill="var(--jz-surface)"
                stroke="var(--jz-border)"
                strokeDasharray="3,4"
                opacity={0.9}
              />
              <text
                x={l.x + l.w / 2}
                y={39}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--jz-text-muted)"
                letterSpacing="0.5"
              >
                {`${i + 1}. ${l.label}`}
              </text>
            </g>
          ))}
        </g>

        {/* ════ C1 客户端 ════════════════════════════════════════ */}
        <Box
          x={20}
          y={64}
          w={320}
          h={360}
          title="浏览器 SPA"
          accent="var(--jz-accent)"
          tip="React 18 + TypeScript · Vite 构建 · 单页应用"
          lines={[
            ['React 18', 'TypeScript'],
            ['React Router v6', 'Zustand 状态'],
            ['Ant Design 5', '主题 4 套'],
            ['axios + ensureCsrf()', 'Session Cookie'],
            ['─ 编辑器 ─', ''],
            ['Tiptap', 'ProseMirror 内核'],
            ['StarterKit · Table · TaskList', ''],
            ['CodeBlock(lowlight) · Mermaid · KaTeX', ''],
            ['HtmlEditor · HtmlPostReader', ''],
            ['SelectionAI · DocAIPanel', '三模式编辑'],
          ]}
        />
        <Box
          x={20}
          y={444}
          w={320}
          h={260}
          title="公开阅读 · 博客前台"
          tip="完全匿名，无需登录"
          lines={[
            ['/', 'BlogHome'],
            ['/kb/:slug', 'KBPostsPage'],
            ['/posts/:slug', 'PostDetail'],
            ['?kb= slug 消歧', 'HTML iframe 阅读'],
            ['/archive', 'ArchivePage'],
            ['/tags', 'TagCloudPage'],
            ['/d/:id', 'DocLinkResolver'],
            ['/feed.xml', 'RSS / Atom'],
          ]}
        />

        {/* ════ C2 边缘 ════════════════════════════════════════ */}
        <Box
          x={365}
          y={64}
          w={170}
          h={240}
          title="Vite Dev · :3001"
          tip="开发期反向代理；生产可换 Nginx"
          lines={[
            ['/api/* → :8002', ''],
            ['/media/* → :8002', ''],
            ['HMR WebSocket', ''],
            ['同源 Cookie', ''],
            ['SameSite=Lax', ''],
          ]}
        />
        <Box
          x={365}
          y={324}
          w={170}
          h={280}
          title="安全 / 权限"
          tip="CSRF + Session + 速率限制 + DRF 权限类"
          lines={[
            ['corsheaders', ''],
            ['CSRF_TRUSTED_ORIGINS', ''],
            ['X-CSRFToken header', ''],
            ['Session Auth', ''],
            ['─ DRF Throttle ─', ''],
            ['anon 120/min', ''],
            ['IsAuthenticated', ''],
            ['IsStaffUser', ''],
            ['IsSuperUser', ''],
            ['ai_write 30/min', ''],
          ]}
        />

        {/* ════ C3 应用层 ═══════════════════════════════════════ */}
        <Box
          x={565}
          y={64}
          w={490}
          h={440}
          title="Django 5.2 + DRF · :8002"
          accent="var(--jz-accent)"
          tip="Python 3.12；ASGI / WSGI 均可"
          lines={[]}
        >
          <text x={577} y={108} fontSize={11.5} fill="var(--jz-text-muted)">
            <tspan fontWeight={700} fill="var(--jz-text-muted)" letterSpacing="0.5">
              中间件
            </tspan>
            {'  '}Session · CSRF · CORS · Auth · Common · Messages
          </text>

          <SubLabel x={577} y={142} text="apps/" />

          {/* 4 列 × 3 行的 app 网格；cell w=110 h=52，水平间距 8（保证最右列在 Django 盒内） */}
          <AppCell x={577} y={150} label="accounts" desc="登录·权限·系统信息" />
          <AppCell x={695} y={150} label="knowledge" desc="KB · Folder · Doc" />
          <AppCell x={813} y={150} label="editor" desc="附件 · 上传" />
          <AppCell x={931} y={150} label="versioning" desc="快照·diff·回滚" />

          <AppCell x={577} y={216} label="linking" desc="@提及 · 反向链接" />
          <AppCell x={695} y={216} label="search" desc="tsvector·jieba" />
          <AppCell x={813} y={216} label="tags" desc="标签 · 多对多" />
          <AppCell x={931} y={216} label="comments" desc="文档级·段落级" />

          <AppCell x={577} y={282} label="exporter" desc="MD/HTML/PDF/DOCX" />
          <AppCell x={695} y={282} label="blog" desc="公开 API · slug 消歧" />
          <AppCell x={813} y={282} label="ai" desc="Claude 代理 · SSE" />

          {/* signal → on_commit → .delay() 说明区，留充足上边距避免压到第三行 */}
          <SubLabel x={577} y={362} text="post_save signal" />
          <text x={577} y={382} fontSize={11.5} fill="var(--jz-text)">
            transaction.on_commit
            <tspan fill="var(--jz-text-muted)"> → 任务入队（避免 worker 拉到未提交状态）</tspan>
          </text>
          <text x={577} y={402} fontSize={11.5} fill="var(--jz-text)">
            refresh_document_vector.delay()
            <tspan fill="var(--jz-text-muted)"> · </tspan>
            sync_document_links.delay()
          </text>
          <text x={577} y={422} fontSize={11.5} fill="var(--jz-text-muted)">
            自动保存 PATCH 返回 ≈ 30–50ms（重活已剥离）
          </text>
          <text x={577} y={442} fontSize={11.5} fill="var(--jz-text-muted)">
            ORM 全部 select_related / prefetch_related 优化
          </text>
          <text x={577} y={462} fontSize={11.5} fill="var(--jz-text-muted)">
            软删除 · 回收站永久保留
          </text>
        </Box>

        <Box
          x={565}
          y={524}
          w={490}
          h={260}
          title="Celery Worker"
          accent="#7a4dbf"
          tip="异步任务消费者；从 Redis broker 拉取任务"
          lines={[]}
        >
          <SubLabel x={577} y={566} text="tasks" />
          <TaskRow
            x={577}
            y={578}
            name="search.refresh_document_vector"
            desc="jieba 中文分词 → search_vector (tsvector)"
          />
          <TaskRow
            x={577}
            y={622}
            name="linking.sync_document_links"
            desc="正则解析 @[doc:id] → DocumentLink 重建"
          />
          <TaskRow
            x={577}
            y={666}
            name="exporter.run_export"
            desc="Playwright(PDF) / python-docx / Jinja2 整站"
          />
          <text x={577} y={720} fontSize={11.5} fill="var(--jz-text-muted)">
            并发 4 · 失败自动重试 · 导出任务串行避免内存峰值
          </text>
          <text x={577} y={740} fontSize={11.5} fill="var(--jz-text-muted)" fontStyle="italic">
            未启动 worker → 保存仍 OK；但搜索 / 双向链接索引不更新
          </text>
          <text x={577} y={760} fontSize={11.5} fill="var(--jz-text-muted)">
            celery -A jianzhai worker -l info
          </text>
          <text x={577} y={778} fontSize={11.5} fill="var(--jz-text-muted)" fontStyle="italic">
            apps.ai → Anthropic API（仅后端，key 不暴露前端）
          </text>
        </Box>

        {/* ════ C4 持久层 ══════════════════════════════════════ */}
        <Box
          x={1080}
          y={64}
          w={340}
          h={360}
          title="PostgreSQL 14+"
          accent="#3a6ea5"
          tip="主存储；中文全文搜索通过 jieba 预切分写入 tsvector"
          lines={[]}
        >
          <SubLabel x={1092} y={108} text="schema · 主要表族" />
          <DBRow x={1092} y={124} table="knowledge_base · folder · document" />
          <DBRow x={1092} y={148} table="document_version  (快照)" />
          <DBRow x={1092} y={172} table="document_link  (反向链接)" />
          <DBRow x={1092} y={196} table="attachment · tag · documenttag" />
          <DBRow x={1092} y={220} table="comment · export_task" />
          <DBRow x={1092} y={244} table="ai_settings · ai_usage_log" />
          <DBRow x={1092} y={268} table="auth_user · django_session" />

          <SubLabel x={1092} y={308} text="索引 / 约束" />
          <text x={1092} y={326} fontSize={11.5} fill="var(--jz-text-muted)">
            · GIN (search_vector)
          </text>
          <text x={1092} y={346} fontSize={11.5} fill="var(--jz-text-muted)">
            · 软删除 partial index
          </text>
          <text x={1092} y={366} fontSize={11.5} fill="var(--jz-text-muted)">
            · slug 唯一 (按 KB 分区)
          </text>
          <text x={1092} y={386} fontSize={11.5} fill="var(--jz-text-muted)">
            · psycopg 3 · conn_max_age=600
          </text>
          <text x={1092} y={424} fontSize={11.5} fill="var(--jz-text-muted)" fontStyle="italic">
            备份: pg_dump 每日 + 文件夹
          </text>
        </Box>

        <Box
          x={1080}
          y={444}
          w={340}
          h={180}
          title="Redis 7+"
          accent="#c0392b"
          tip="缓存 + 会话 + Celery"
          lines={[]}
        >
          <DBRow x={1092} y={490} table="DB 0  —  django-redis 缓存" />
          <DBRow x={1092} y={520} table="DB 1  —  Celery broker (队列)" />
          <DBRow x={1092} y={550} table="DB 2  —  Celery 结果后端" />
          <text x={1092} y={590} fontSize={11.5} fill="var(--jz-text-muted)">
            docker-compose · healthcheck: ping
          </text>
        </Box>

        <Box
          x={1080}
          y={644}
          w={340}
          h={180}
          title="MEDIA_ROOT · 本地文件系统"
          accent="#6b8e23"
          tip="未引入对象存储；备份纳入 pg_dump + 文件夹打包"
          lines={[]}
        >
          <DBRow x={1092} y={690} table="uploads/YYYY/MM/uuid.ext" />
          <DBRow x={1092} y={720} table="exports/*.zip · *.pdf · *.docx" />
          <text x={1092} y={758} fontSize={11.5} fill="var(--jz-text-muted)">
            单文件上限 50 MB · Pillow 缩略图
          </text>
          <text x={1092} y={778} fontSize={11.5} fill="var(--jz-text-muted)">
            kind: image / document / other
          </text>
        </Box>

        {/* ─── 主连接线 (所有路径走列间通道，不穿越盒子) ───────── */}

        {/* 1. Browser → Vite */}
        <path
          d="M 340 175 H 365"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.6}
          markerEnd={`url(#${arrow})`}
        />
        <text x={352} y={168} fontSize={11} fill="var(--jz-text-muted)" textAnchor="middle">
          HTTP
        </text>

        {/* 2. Vite → Django */}
        <path
          d="M 535 175 H 565"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.6}
          markerEnd={`url(#${arrow})`}
        />
        <text x={550} y={168} fontSize={11} fill="var(--jz-text-muted)" textAnchor="middle">
          :8002
        </text>

        {/* 3. Django → PG */}
        <path
          d="M 1055 175 H 1080"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.6}
          markerEnd={`url(#${arrow})`}
        />
        <text x={1067} y={168} fontSize={11} fill="var(--jz-text-muted)" textAnchor="middle">
          ORM
        </text>

        {/*
          C3↔C4 通道（x=1055–1080，宽 25px）里要走多条线。为避免视觉重叠：
            · Django→Redis 垂直段走 x=1063
            · Celery→PG    垂直段走 x=1072
            · 横向 Redis↔Celery 在 y=540 / y=560
          标签因通道太窄塞不下，仅在最关键的几条线上保留（HTTP / :8002 / ORM / .delay()），
          其它语义靠箭头方向 + 节点的 <title> tooltip 表达。
        */}

        {/* 4. Django → Redis (session / cache) */}
        <path
          d="M 1055 400 H 1063 V 470 H 1080"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.5}
          markerEnd={`url(#${arrow})`}
        />

        {/* 5. Django → Celery (列内垂直；强调色 = 异步入队) */}
        <path
          d="M 810 504 V 524"
          fill="none"
          stroke="var(--jz-accent)"
          strokeWidth={1.8}
          markerEnd={`url(#${arrowAccent})`}
        />
        <text x={818} y={518} fontSize={11.5} fill="var(--jz-accent)" fontWeight={600}>
          .delay()
        </text>

        {/* 6. Celery → PG (折线上行至 PG 左下角) */}
        <path
          d="M 1055 600 H 1072 V 410 H 1080"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.5}
          markerEnd={`url(#${arrow})`}
        />

        {/* 7a. Redis → Celery (拉任务) */}
        <path
          d="M 1080 540 L 1055 540"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.5}
          strokeDasharray="4,3"
          markerEnd={`url(#${arrow})`}
        />
        {/* 7b. Celery → Redis (写结果) */}
        <path
          d="M 1055 560 L 1080 560"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.5}
          strokeDasharray="4,3"
          markerEnd={`url(#${arrow})`}
        />

        {/* 8. Celery → MEDIA_ROOT */}
        <path
          d="M 1055 700 H 1080"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.5}
          markerEnd={`url(#${arrow})`}
        />

        {/* 9. Django → MEDIA_ROOT (图片 / 附件上传，弧线下行) */}
        <path
          d="M 1055 480 C 1066 488 1066 660 1078 678"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.2}
          strokeDasharray="3,3"
          markerEnd={`url(#${arrow})`}
        />

        {/* 10. 匿名读者 → Vite (全程走 C1↔C2 通道) */}
        <path
          d="M 340 470 C 352 410 352 280 365 240"
          fill="none"
          stroke="var(--jz-text-muted)"
          strokeWidth={1.4}
          strokeDasharray="5,4"
          markerEnd={`url(#${arrow})`}
          opacity={0.85}
        />
        <text x={343} y={408} fontSize={10.5} fill="var(--jz-text-muted)">
          匿名读者
        </text>

        {/* ─── 动态光点 ───────────────────────────────────────── */}
        {/* 微弱的轨迹底线，让光点的运动方向有视觉锚点 */}
        <line
          x1={175}
          y1={58}
          x2={1240}
          y2={58}
          stroke="var(--jz-accent)"
          strokeWidth={1}
          strokeDasharray="2,6"
          opacity={0.25}
        />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle r={4.5} fill="var(--jz-accent)" opacity={0}>
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                begin={`${i * 1.33}s`}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="linear"
              >
                <mpath href={`#${flowPath}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.05;0.95;1"
                dur="4s"
                begin={`${i * 1.33}s`}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}

        {/* ─── 图例 ──────────────────────────────────────────── */}
        <g transform="translate(20, 836)">
          <rect
            x={0}
            y={0}
            width={1400}
            height={48}
            rx={4}
            fill="var(--jz-surface)"
            stroke="var(--jz-border)"
            strokeDasharray="3,4"
          />
          <text x={14} y={20} fontSize={12} fill="var(--jz-text-muted)" fontWeight={700}>
            图例
          </text>
          <line x1={60} y1={16} x2={92} y2={16} stroke="var(--jz-text-muted)" strokeWidth={1.5} />
          <text x={100} y={20} fontSize={11.5} fill="var(--jz-text)">
            同步调用
          </text>
          <line
            x1={170}
            y1={16}
            x2={202}
            y2={16}
            stroke="var(--jz-text-muted)"
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
          <text x={210} y={20} fontSize={11.5} fill="var(--jz-text)">
            异步 / 匿名访问
          </text>
          <line x1={320} y1={16} x2={352} y2={16} stroke="var(--jz-accent)" strokeWidth={1.8} />
          <text x={360} y={20} fontSize={11.5} fill="var(--jz-text)">
            任务入队 .delay()
          </text>
          <circle cx={476} cy={16} r={4} fill="var(--jz-accent)" />
          <text x={490} y={20} fontSize={11.5} fill="var(--jz-text)">
            动态光点 · 主请求路径 浏览器 → Vite → Django → PG
          </text>
          <text x={14} y={38} fontSize={11} fill="var(--jz-text-muted)">
            11 个 Django app（含 ai 代理）· 盒子描边：accent / 紫=Celery / 蓝=PG / 红=Redis / 橄榄=文件系统。悬停查看说明。
          </text>
        </g>
      </svg>
    </div>
  );
}

// ─── 布局常量 ─────────────────────────────────────────────────

/** 每层一个色调；色带 opacity 6–8% 所以哪怕在亮/暗/星空/深海主题下都只是淡淡的提示色。
 *  挑色逻辑：暖（accent）→ 中性 → 偏紫（应用 + 异步色系呼应）→ 偏蓝（数据库色系呼应）。 */
const LAYERS = [
  { label: '客户端 / SPA', x: 20, w: 320, bandColor: 'var(--jz-accent)' },
  { label: '边缘 / 代理', x: 365, w: 170, bandColor: 'var(--jz-text-muted)' },
  { label: '应用层 / Django + Celery', x: 565, w: 490, bandColor: '#7a4dbf' },
  { label: '持久层', x: 1080, w: 340, bandColor: '#3a6ea5' },
];

// ─── 子组件 ───────────────────────────────────────────────────

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  tip?: string;
  accent?: string;
  lines: Array<[string, string]>;
  children?: React.ReactNode;
}

/** 主容器盒子。``lines`` 每项 [main, secondary] 双栏小字；``children`` 用于自由布局。 */
function Box({ x, y, w, h, title, tip, accent, lines, children }: BoxProps) {
  return (
    <g>
      <title>{tip ?? title}</title>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--jz-surface-2)"
        stroke={accent ?? 'var(--jz-border)'}
        strokeWidth={accent ? 1.8 : 1.2}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={28}
        rx={8}
        ry={8}
        fill={accent ?? 'var(--jz-border)'}
        opacity={0.12}
      />
      <text x={x + 12} y={y + 19} fontSize={13} fontWeight={700} fill="var(--jz-text)">
        {title}
      </text>
      {lines.map(([a, b], i) => (
        <g key={i}>
          <text x={x + 12} y={y + 52 + i * 22} fontSize={12} fill="var(--jz-text)">
            {a}
          </text>
          {b && (
            <text
              x={x + w - 12}
              y={y + 52 + i * 22}
              fontSize={11.5}
              fill="var(--jz-text-muted)"
              textAnchor="end"
            >
              {b}
            </text>
          )}
        </g>
      ))}
      {children}
    </g>
  );
}

function SubLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={11}
      fontWeight={700}
      fill="var(--jz-text-muted)"
      letterSpacing="0.5"
    >
      {text.toUpperCase()}
    </text>
  );
}

/** Django app 小卡 110×52 */
function AppCell({
  x,
  y,
  label,
  desc,
}: {
  x: number;
  y: number;
  label: string;
  desc: string;
}) {
  return (
    <g>
      <title>{`apps.${label} — ${desc}`}</title>
      <rect
        x={x}
        y={y}
        width={110}
        height={52}
        rx={5}
        ry={5}
        fill="var(--jz-surface)"
        stroke="var(--jz-border)"
      />
      <text x={x + 8} y={y + 20} fontSize={12} fontWeight={700} fill="var(--jz-text)">
        {label}
      </text>
      <text x={x + 8} y={y + 38} fontSize={10} fill="var(--jz-text-muted)">
        {desc}
      </text>
    </g>
  );
}

function TaskRow({
  x,
  y,
  name,
  desc,
}: {
  x: number;
  y: number;
  name: string;
  desc: string;
}) {
  return (
    <g>
      <title>{`${name} — ${desc}`}</title>
      <circle cx={x + 6} cy={y + 7} r={4} fill="#7a4dbf" />
      <text x={x + 18} y={y + 12} fontSize={12} fontWeight={600} fill="var(--jz-text)">
        {name}
      </text>
      <text x={x + 18} y={y + 30} fontSize={11} fill="var(--jz-text-muted)">
        {desc}
      </text>
    </g>
  );
}

function DBRow({ x, y, table }: { x: number; y: number; table: string }) {
  return (
    <text x={x} y={y} fontSize={11.5} fill="var(--jz-text)">
      <tspan fill="var(--jz-text-muted)">·</tspan> {table}
    </text>
  );
}
