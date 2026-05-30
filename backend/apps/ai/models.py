"""Persistent AI settings + usage log + per-user prompt templates +
multi-turn conversations.

v0.9.7 adds:
  - AISettings: enable_thinking / daily_budget_usd_per_user / fallback_enabled
  - AIUsageLog: + fallback_from / document / knowledge_base / prompt_chars
  - AIPromptTemplate: user-authored custom AI operations
  - AIConversation: multi-turn chat history

Kept lightweight — we only retain metadata, never the prompt / response
contents (except in AIConversation, where the user explicitly opts into
saving the chat).
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class AISettings(models.Model):
    """Singleton row (pk forced to 1) holding global AI behaviour."""

    default_model = models.CharField(
        max_length=80,
        default="claude-opus-4-7",
        help_text="缺省调用的模型 ID（Claude 或 Qwen）",
    )
    enabled = models.BooleanField(
        default=True,
        help_text="主开关；关闭后所有 AI endpoint 返回 503",
    )
    max_tokens = models.PositiveIntegerField(
        default=1024,
        help_text="单次调用允许的最大 output token 数",
    )
    # v0.9.7+
    enable_thinking = models.BooleanField(
        default=False,
        help_text="Claude 4 extended thinking：开启后难题用扩展推理（贵但准）",
    )
    daily_budget_usd_per_user = models.FloatField(
        default=0.0,
        help_text="每用户每日预算（USD）。0 = 不限。超出后调用返回 429。",
    )
    fallback_enabled = models.BooleanField(
        default=True,
        help_text="调用失败（限流/超时）时自动降级到下一档模型",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "AI 设置"
        verbose_name_plural = "AI 设置"

    def __str__(self) -> str:
        return f"AI 设置 (default={self.default_model}, enabled={self.enabled})"

    def save(self, *args, **kwargs) -> None:
        # Enforce singleton.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "AISettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class AIUsageLog(models.Model):
    """Audit row for a single AI call.

    Tokens are best-effort: the streaming API reports usage in the final
    chunk; non-streaming has it on the response. When unavailable (network
    error, abort, etc.) we still record the call with tokens=0 so the
    counter accurately reflects attempts.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage",
    )
    operation = models.CharField(max_length=32)   # continue / polish / ...
    model = models.CharField(max_length=80)
    streaming = models.BooleanField(default=False)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    duration_ms = models.PositiveIntegerField(default=0)
    succeeded = models.BooleanField(default=True)
    error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # v0.9.7+ context attribution. When AI is invoked from inside a specific
    # document (editor toolbar / inline editor), we tag the row so admins
    # can see which docs / KBs consume the most tokens. Both optional —
    # selection-AI fired from blog-only context will leave them null.
    document = models.ForeignKey(
        "knowledge.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # If a fallback ladder fired (Opus → Sonnet because Opus 429'd), this
    # holds the originally-requested model. ``model`` above is the one
    # that actually served the request.
    fallback_from = models.CharField(max_length=80, blank=True)
    # Approximate prompt character count — used to validate the frontend's
    # cost preview against actual delivered cost (mostly for debugging).
    prompt_chars = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["model", "-created_at"]),
            # Two-column lookups for budget enforcement.
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self) -> str:
        return (
            f"AI #{self.id} {self.operation}@{self.model} "
            f"in={self.input_tokens} out={self.output_tokens} "
            f"{'ok' if self.succeeded else 'fail'}"
        )

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class AIPromptTemplate(models.Model):
    """User-authored prompt template — appears alongside built-in operations
    in the AI menu / panel.

    Owned per-user (so different users can have different "polish in 论文
    style" templates without stepping on each other). Built-in operations
    (continue / polish / etc.) live in apps.ai.prompts.OPERATION_INSTRUCTIONS
    and are not represented here — frontend merges both sources.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_prompt_templates",
    )
    name = models.CharField(max_length=60, help_text="菜单显示名 · 60 字内")
    icon = models.CharField(
        max_length=10,
        blank=True,
        default="✨",
        help_text="单字符 emoji，用于菜单图标",
    )
    instruction = models.TextField(
        help_text="发给 AI 的指令模板，会与用户当前选区拼接",
    )
    requires_selection = models.BooleanField(
        default=True,
        help_text="是否需要先选中文字才能用",
    )
    REPLACE_MODE_CHOICES = [
        ("none", "仅显示，不替换"),
        ("replace", "替换选中"),
        ("before", "插入到上方"),
        ("after", "插入到下方"),
    ]
    replace_mode = models.CharField(
        max_length=10,
        choices=REPLACE_MODE_CHOICES,
        default="none",
    )
    order = models.PositiveIntegerField(default=0, help_text="排序权重，越大越靠前")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-order", "-created_at"]
        indexes = [models.Index(fields=["owner", "-order"])]

    def __str__(self) -> str:
        return f"Prompt[{self.owner_id}] {self.name}"


class AIConversation(models.Model):
    """Multi-turn AI chat saved for later replay.

    Stored as a JSON list of ``{role, content, ts}`` dicts. Truncated to
    50 turns max; older turns drop off the front during /ai/chat/.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
    )
    title = models.CharField(max_length=120, blank=True, help_text="首条用户消息前 60 字")
    messages = models.JSONField(
        default=list,
        help_text="[{role: user|assistant, content: str, ts: ISO}, ...]",
    )
    model = models.CharField(max_length=80, blank=True)
    document = models.ForeignKey(
        "knowledge.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user", "-updated_at"])]

    def __str__(self) -> str:
        return f"Conv[{self.user_id}] {self.title or '(untitled)'}"
