"""Prompt templates for AI writing assistance.

We keep prompts in one module so they're easy to audit and tweak without
having to chase strings across views. All prompts are written in 简体中文
because the entire product is Chinese-first.

v0.9.7 rewrite: the v0.9.6 SYSTEM_PROMPT was 3 lines long and provided no
output discipline beyond "output Markdown". Real Claude / Qwen output
under that prompt would routinely:
  - wrap the whole response in ``` ``` fences (then the panel renders an
    empty code block);
  - prefix the answer with "好的，我来…" filler;
  - break KaTeX ``$$..$$`` blocks when "polishing";
  - drop code blocks during "translate".

The new prompt:
  - explicit anti-patterns ("不要做什么"),
  - explicit preservation rules (math / code / @-mentions / image links),
  - one-line tone control,
  - and a worked example showing the exact shape we want back.

Length budget: ~600 chars. Anthropic charges full system tokens unless
prompt caching is on; we mark the system prompt as ``cache_control:
ephemeral`` in services.py so the per-call cost stays ~5% of uncached.
"""
from __future__ import annotations


# ── System prompt ────────────────────────────────────────────────────────
# Cached via ``cache_control: ephemeral`` in services._run_*_anthropic, so
# its length is paid for once per 5 minutes regardless of call volume.
SYSTEM_PROMPT = """你是简斋知识库的写作助手，帮助用户改进 Markdown 笔记。

输出规则（务必遵守）：
1. 必须使用简体中文回应。
2. 直接输出 Markdown 正文，不要在外面再套 ``` 代码栅栏。
3. 不要写"好的，我来…""以下是…"之类的开场白；直接给结果。
4. 不要在最后补"以上就是…"之类的结尾说明。
5. 严格保留原文中的：
   - KaTeX 数学公式（$$..$$ 块级 / $..$ 行内），不要改公式
   - 代码块（``` 围栏），不要翻译注释外的代码
   - @[标题](doc:N) 双向链接，不要改 N
   - 图片链接 ![](url)，不要改 url
   - HTML 标签（<details>, <summary>, <kbd> 等）
6. 保留原作者的语气与术语；仅在用户操作明确要求的方面调整。

示例：用户请求「润色」并给出
```
# 标题
ai 是个 **trend**, 用着挺香
```
你的回复应该恰好是：
```
# 标题
AI 是当前的 **趋势**，使用起来非常顺手。
```
（无开场白、无尾注，原 `# 标题` 与 `**...**` 强调保持）
"""


# ── Per-operation instructions ─────────────────────────────────────────
# Each instruction is concatenated with the user's content to form the
# single ``user`` message we send. Keep them short — the system prompt
# already enforces output discipline.
OPERATION_INSTRUCTIONS: dict[str, str] = {
    "continue": (
        "请基于以下内容自然续写 1-2 段，保持原作者的语气与术语风格。"
        "只返回续写部分（不要重复原文）。"
    ),
    "polish": (
        "请对以下内容进行润色：让文字更通顺、更书面，但保留作者的观点与结构。"
        "返回润色后的完整版本。"
    ),
    "expand": (
        "请对以下内容进行扩写：在不偏离原意的前提下补充细节、例子或解释。"
        "返回扩写后的完整版本。"
    ),
    "summarize": (
        "请用 3-5 句话总结以下内容的核心观点，使用项目符号列表（每点 1-2 句）。"
    ),
    "translate_en": (
        "请把以下内容翻译为英文。保留 Markdown 结构、保留代码块与数学公式不译。"
    ),
    "translate_zh": (
        "请把以下内容翻译为简体中文。保留 Markdown 结构、保留代码块与数学公式不译。"
    ),
    "fix": (
        "请修正以下内容的语法错误、错别字与标点问题，但不要改变原意与结构。"
        "返回修正后的完整版本。"
    ),
    "outline": (
        "请基于以下主题或片段，生成一份结构化的 Markdown 大纲："
        "用 ## H2 作主章节、### H3 作子节，每个节点附 1 句话提示要点。"
    ),
}


def build_messages(
    operation: str,
    content: str,
    extra: str = "",
    *,
    images: list[str] | None = None,
) -> list[dict]:
    """Construct the user-side messages array for an AI call.

    ``operation`` resolves to a fixed instruction; ``content`` is the user's
    selection / document text; ``extra`` is an optional free-form note
    (e.g. "用更轻松的语气" tacked onto a polish call).

    ``images`` (v0.9.7+) is a list of base64-encoded image data URLs
    (``data:image/png;base64,...``). When present we return Anthropic-shape
    content blocks so the same builder works for vision models — Qwen-VL
    callers transform the shape further in services._qwen_messages.
    """
    instruction = OPERATION_INSTRUCTIONS.get(operation)
    if not instruction:
        raise ValueError(f"unknown AI operation: {operation}")
    parts = [instruction]
    if extra:
        parts.append(f"补充说明：{extra}")
    parts.append("---\n" + (content or "").strip())
    text = "\n\n".join(parts)

    if images:
        blocks: list[dict] = []
        for url in images:
            # Anthropic accepts ``{type:'image', source:{type:'base64', media_type, data}}``.
            # We pass through the data URL prefix split: ``data:image/png;base64,xxx``.
            if not url.startswith("data:"):
                continue
            try:
                head, b64 = url.split(",", 1)
                # ``data:image/png;base64`` → media_type ``image/png``
                media_type = head.split(";")[0].split(":", 1)[1]
            except (ValueError, IndexError):
                continue
            blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": b64},
            })
        blocks.append({"type": "text", "text": text})
        return [{"role": "user", "content": blocks}]
    return [{"role": "user", "content": text}]


def build_messages_multiturn(
    history: list[dict],
    instruction: str | None = None,
) -> list[dict]:
    """Build messages from a prior conversation + an optional follow-up.

    ``history`` is a list of ``{role: 'user'|'assistant', content: str}``
    dicts — usually the trimmed-to-N-turns conversation surfaced from
    ``AIConversation.messages``. ``instruction`` is the new user turn.

    Used by the multi-turn ``/ai/chat/`` endpoint (v0.9.7+). Single-turn
    callers should stick to ``build_messages()`` above.
    """
    msgs: list[dict] = []
    for m in history[-10:]:  # cap to last 10 messages so prompts stay bounded
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            msgs.append({"role": role, "content": content})
    if instruction:
        msgs.append({"role": "user", "content": instruction.strip()})
    return msgs
