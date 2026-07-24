# 简斋 · AI 助手（多供应商）

> 前端永不持 API key，所有调用走 `apps/ai/` 后端代理。
> 架构见 [architecture.md](./architecture.md)。基于源码核对（2026-06-21）。

---

## 1. 架构

```
浏览器 ──POST /api/v1/ai/stream|chat/──► Django apps.ai ──路由 provider──► Anthropic SDK（Claude）
       │                                      └────────────────────────► DashScope OpenAI 兼容（通义千问）
       ◄──── SSE: data:{"delta":"..."} ──
```

- 用户偏好存 `localStorage['jz-ai-model']`，每次调用带 `model` 字段
- 后端校验 `AVAILABLE_MODELS` 白名单（`apps/ai/services.py`），每项带 `provider`（`anthropic`/`qwen`）、`vision`、`thinking`
- `_provider_for(model)` 选客户端：Qwen 走 DashScope **OpenAI 兼容**端点（`DASHSCOPE_API_KEY`，复用 `openai` SDK）
- `provider_configured(provider)` 独立检查两把 Key；`/ai/capabilities` 回传各供应商配置状态，任一未配置该供应商优雅降级

---

## 2. 模型白名单（`services.py` AVAILABLE_MODELS）

| 模型 ID | provider | vision | thinking | 说明 |
|---------|----------|:------:|:--------:|------|
| `claude-opus-4-7` | anthropic | ✓ | ✓ | **默认** / 最强推理 |
| `claude-sonnet-4-6` | anthropic | ✓ | ✓ | 平衡 / 更快 |
| `claude-haiku-4-5-20251001` | anthropic | ✓ | ✗ | 最快 / 短任务 |
| `qwen-max` | qwen | ✗ | ✗ | 阿里 · 中文优势 / 最强 |
| `qwen-plus` | qwen | ✗ | ✗ | 性价比平衡 |
| `qwen-turbo` | qwen | ✗ | ✗ | 速度优先 |
| `qwen-vl-max` | qwen | ✓ | ✗ | 视觉旗舰（图片输入） |
| `qwen-vl-plus` | qwen | ✓ | ✗ | 视觉平价 |

默认值：env `CLAUDE_MODEL_DEFAULT`（缺省 `claude-opus-4-7`）+ DB `AISettings.default_model`（默认 `claude-opus-4-7`）。

---

## 3. AISettings（单例，`/admin/ai` 设置）

```python
class AISettings(models.Model):
    default_model = CharField(default="claude-opus-4-7")  # 可为 Claude 或 Qwen
    enabled = BooleanField(default=True)                  # 主开关；关闭时所有 /ai/* 返 503
    max_tokens = PositiveIntegerField(default=1024)
    enable_thinking = BooleanField(default=False)         # Claude 4 扩展思考
    daily_budget_usd_per_user = FloatField(default=0.0)   # 0 = 不限；超出 429
    fallback_enabled = BooleanField(default=True)         # 首 token 前失败自动降级
```

单例经 `pk=1` 强制；**缓存 300s**（`CACHE_KEY="ai-settings-v1"`，save 时失效），每次 AI 调用读缓存。

---

## 4. 操作集：8 内置 + 自定义模板

| operation | 语义 |
|-----------|------|
| `continue` 续写 / `polish` 润色 / `expand` 扩写 / `fix` 纠错 | |
| `summarize` 总结 / `outline` 大纲 / `translate_en` 中→英 / `translate_zh` 英→中 | |

完整 prompt 在 `apps/ai/prompts.py`（系统 prompt 对 Anthropic 标 `cache_control: ephemeral` 做 **prompt caching**）。

**自定义模板** `AIPromptTemplate`（owner / name / icon / instruction / requires_selection / replace_mode），操作 id 形如 `tpl_<id>`，并入 `/ai/capabilities` 与各 AI 菜单（零代码扩展）。

---

## 5. 进阶能力

- **多轮对话**：`POST /ai/chat/`（SSE）+ `AIConversation`（owner / title / `messages` JSON / model / document），UI 上限 50 轮，可在 `/admin/ai` 查看/删除
- **视觉输入**：请求带 `images`（`data:image/*;base64`），传给 Claude 或 `vision=True` 的 Qwen-VL
- **扩展思考**：`enable_thinking=True` 且模型支持时，分配 `max_tokens//2` 思考预算

---

## 6. 限流、日预算、失败降级

- **限流**：`AIWriteThrottle`（`UserRateThrottle scope=ai_write`）= 30/min/user
- **日预算**：`daily_budget_usd_per_user`（0 = 不限）；`check_daily_budget(user)` 调用前按当日 `AIUsageLog.estimated_usd` 的 DB SUM 估算，超额 **429**；`budget_reservation()` 经 Redis 做**调用前原子预留**（避免并发击穿）
- **失败降级**（`FALLBACK_CHAIN`，**首 token 前**异常自动换模型重试，记 `fallback_from`）：

```
claude-opus-4-7   → [sonnet-4-6, haiku-4-5]
claude-sonnet-4-6 → [haiku-4-5]
qwen-max          → [qwen-plus, qwen-turbo]
qwen-plus         → [qwen-turbo]
qwen-vl-max       → [qwen-vl-plus]
```

---

## 7. 用量审计与日历热图

每次 `run_once` / `run_stream` / `run_chat_stream` 写一行 `AIUsageLog`：user / operation / model / streaming / input_tokens / output_tokens / duration_ms / succeeded / error / document / knowledge_base / fallback_from / prompt_chars / **`estimated_usd`**（save 时由 `pricing.estimate_cost_usd()` 自动算，供预算 DB SUM 聚合）。

- `/ai/usage/?days=30` 按模型/日/操作/KB/文档聚合 + `recent` + `pricing`；`/ai/usage/csv/` 导出
- 前端 `UsageHeatmap.tsx`：GitHub 风格 5 级色深（基于当日 USD），`color-mix` 跟主题，hover 弹明细
- `/ai/estimate/` 真正调用前预览 token / 花费

---

## 8. 价格表（`apps/ai/pricing.py`）

Claude 单位 USD/MTok；Qwen 原价 CNY/MTok 经 `CNY_TO_USD = 0.14` 换算后统一 USD：

| 模型 | input | output |
|------|------:|-------:|
| claude-opus-4-7 | $15.0 | $75.0 |
| claude-sonnet-4-6 | $3.0 | $15.0 |
| claude-haiku-4-5 | $1.0 | $5.0 |
| qwen-max / qwen-vl-max | ¥20.0 | ¥60.0 |
| qwen-plus | ¥4.0 | ¥12.0 |
| qwen-turbo | ¥1.5 | ¥6.0 |
| qwen-vl-plus | ¥8.0 | ¥24.0 |

更新价格只改这一个文件；热图与日预算共用同一张表。

---

## 9. 前端入口

编辑器工具栏 `AIAssistantMenu`（含模型切换；富文本模式的专属选区入口）、选区 `SelectionAI`（✨，挂 MD/HTML/PDF/PPT——**富文本不挂载**防与 AIAssistantMenu 双入口误触；润色/扩写/纠错/翻译在 MD/HTML 可经 `EditorSurface` **一键回写原选区**：发起时快照选区偏移、应用前校验原文未变，流式期间改过原文则拒绝替换）、右下角 `DocAIPanel`（🤖 抽屉；全文塞 prompt **截断 2 万字**并注明，防超上下文/烧预算）、斜杠 `/ai`、顶栏 `AIModelBadge`；AI 输出**实时 Markdown 渲染**。覆盖阅读端 + 全部编辑模式。

**富文本 AI 闭环（2026-07-24）**：`AIAssistantMenu` 的「替换选中」不再静默覆写——先弹 `AIDiffPreview`（diff-match-patch 语义 diff Modal，`diffBefore` 在开 Modal 时冻结）确认后才落笔；流式错误以 `AIErrorPayload` 传入 `AIAssistantPanel` 的分类 Alert（`describeAIError` 出标题/提示，预算/未配置/网络分型），替换旧的一闪而过 toast；「再来一次」经 `lastRunRef` 复用发起时的内容与选区快照真正可用。此前 `AIDiffPreview` 与面板的 error/重试 UI 均为**已实现未接线**的死代码。
