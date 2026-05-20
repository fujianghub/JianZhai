"""Prompt templates for AI writing assistance.

We keep prompts in one module so they're easy to audit and tweak without
having to chase strings across views. All prompts are written in 简体中文
because the entire product is Chinese-first.
"""
from __future__ import annotations


SYSTEM_PROMPT = (
    "你是简斋知识库的写作助手，帮助用户改进 Markdown 笔记。"
    "回答必须使用简体中文，输出 Markdown 内容本身（不要包裹代码块、不要附加说明），"
    "尊重作者原意与语气，仅在用户要求的方面进行调整。"
)


OPERATION_INSTRUCTIONS: dict[str, str] = {
    "continue": (
        "请基于以下内容自然续写 1-2 段，保持原作者的语气与术语风格。"
        "只返回续写的部分，不要重复原文。"
    ),
    "polish": (
        "请对以下内容进行润色：让文字更通顺、更书面，但保留作者的观点与结构。"
        "返回润色后的完整版本，使用同样的 Markdown 结构。"
    ),
    "expand": (
        "请对以下内容进行扩写：在不偏离原意的前提下补充细节、例子或解释。"
        "返回扩写后的完整版本。"
    ),
    "summarize": (
        "请用 3-5 句话总结以下内容的核心观点，使用项目符号列表形式。"
    ),
    "translate_en": "请把以下内容翻译为英文，保留 Markdown 结构。",
    "translate_zh": "请把以下内容翻译为简体中文，保留 Markdown 结构。",
    "fix": (
        "请修正以下内容的语法错误、错别字与标点问题，但不要改变原意与结构。"
        "返回修正后的完整版本。"
    ),
    "outline": "请基于以下主题或片段，生成一份结构化的 Markdown 大纲（H2 + H3）。",
}


def build_messages(operation: str, content: str, extra: str = "") -> list[dict]:
    instruction = OPERATION_INSTRUCTIONS.get(operation)
    if not instruction:
        raise ValueError(f"unknown AI operation: {operation}")
    parts = [instruction]
    if extra:
        parts.append(f"补充说明：{extra}")
    parts.append("---\n" + content.strip())
    return [
        {"role": "user", "content": "\n\n".join(parts)},
    ]
