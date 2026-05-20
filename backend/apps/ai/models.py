"""Persistent AI settings + usage log.

`AISettings` is a singleton holding cross-cutting AI configuration
(default model, hard-disable switch, etc.) editable from the admin UI
without a code deploy.

`AIUsageLog` is a row-per-call audit trail used by the admin Usage panel
to show how much each model is being used and by whom. Kept lightweight —
we only retain the metadata, never the prompt / response contents.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models


class AISettings(models.Model):
    """Singleton row (pk forced to 1) holding global AI behaviour."""

    default_model = models.CharField(
        max_length=80,
        default="claude-opus-4-7",
        help_text="缺省调用的 Claude 模型 ID",
    )
    enabled = models.BooleanField(
        default=True,
        help_text="主开关；关闭后所有 AI endpoint 返回 503",
    )
    max_tokens = models.PositiveIntegerField(
        default=1024,
        help_text="单次调用允许的最大 output token 数",
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

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["model", "-created_at"]),
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
