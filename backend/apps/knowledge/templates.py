"""Built-in document templates exposed via `GET /api/v1/document-templates/`.

These are intentionally hardcoded for the first cut — the user is single-
tenant on a personal app, so adding a full DocumentTemplate model + migration
+ admin UI is overkill until usage motivates it. Templates support the
placeholders `{{date}}`, `{{title}}`, `{{user}}` (substituted client-side at
new-doc time).
"""
from __future__ import annotations

from typing import TypedDict


class TemplateEntry(TypedDict):
    id: str
    name: str
    description: str
    body: str


BUILTIN_TEMPLATES: list[TemplateEntry] = [
    {
        "id": "blank",
        "name": "空白文档",
        "description": "从零开始",
        "body": "",
    },
    {
        "id": "meeting",
        "name": "会议纪要",
        "description": "时间 · 参会 · 议题 · 决议 · 行动项",
        "body": (
            "# 会议纪要 · {{date}}\n\n"
            "**时间**: {{date}}\n"
            "**参会**: \n"
            "**主持**: {{user}}\n\n"
            "## 议题\n\n- \n\n"
            "## 讨论\n\n- \n\n"
            "## 决议\n\n- [ ] \n\n"
            "## 行动项\n\n"
            "| 负责人 | 任务 | 截止 |\n"
            "| --- | --- | --- |\n"
            "|  |  |  |\n"
        ),
    },
    {
        "id": "daily",
        "name": "日记",
        "description": "今日要做 · 感想 · 明日计划",
        "body": (
            "# {{date}} 日记\n\n"
            "## 今日要做\n\n- [ ] \n\n"
            "## 感想 / 记录\n\n\n\n"
            "## 明日计划\n\n- \n"
        ),
    },
    {
        "id": "project",
        "name": "项目笔记",
        "description": "目标 · 范围 · 里程碑 · 风险",
        "body": (
            "# 项目: {{title}}\n\n"
            "**启动**: {{date}}\n\n"
            "## 目标\n\n- \n\n"
            "## 范围\n\n**包含**:\n\n**不包含**:\n\n"
            "## 里程碑\n\n"
            "| 日期 | 事件 |\n"
            "| --- | --- |\n"
            "|  |  |\n\n"
            "## 风险与缓解\n\n- \n"
        ),
    },
    {
        "id": "reading",
        "name": "读书笔记",
        "description": "金句 · 摘录 · 思考",
        "body": (
            "# {{title}} 读书笔记\n\n"
            "**作者**: \n"
            "**开始**: {{date}}\n\n"
            "## 一句话总结\n\n\n\n"
            "## 金句 / 摘录\n\n> \n\n"
            "## 我的思考\n\n\n\n"
            "## 行动\n\n- [ ] \n"
        ),
    },
]
