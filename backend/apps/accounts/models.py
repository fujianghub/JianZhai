from __future__ import annotations

from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Profile({self.user_id})"


# ── Hero quote settings ────────────────────────────────────────────────────
#
# The blog homepage shows a 题记 ("epigraph") banner at the top — one quote
# at a time, optionally rotating through several. Defaults to the
# project's seed quote (诸葛亮·诫子书) so a fresh install still shows
# something pretty.
#
# Why a singleton and not a per-user record?  The public blog is one page
# shared across all visitors; whichever owner deployed the site decides
# what the visitor sees. Same shape as ``apps.ai.AISettings`` — simpler
# than carrying ownership around for a feature that has exactly one
# truth at a time.
DEFAULT_HERO_QUOTES = [
    {
        "id": "seed-1",
        "text": "年与时驰 · 意与日去 · 遂成枯落",
        "dynasty": "三国",
        "author": "诸葛亮",
        "source": "诫子书",
    },
]

# Animation slugs map 1:1 to the keyframes in styles/theme.css. The
# ``ink-wash`` slug replaced the earlier ``zoom`` in v0.9.4 — old DB rows
# carrying ``"zoom"`` are migrated to ``"ink-wash"`` via the 0003 data
# migration so the management UI never offers a value the renderer can't
# resolve.
HERO_ANIMATIONS = ("fade", "slide", "typewriter", "ink-wash")

# Play order for multi-quote rotation. ``random`` shuffles a fresh
# permutation on every page load (no repeats within one full cycle);
# ``sequential`` walks the list top-to-bottom as authored.
HERO_PLAY_ORDERS = ("random", "sequential")


class HeroSettings(models.Model):
    """Singleton row (pk forced to 1) holding the blog homepage hero quotes.

    ``quotes`` is a list of ``{id, text, attribution}`` dicts. The admin
    Tab edits this directly (CRUD + drag-reorder + batch import); the
    public ``/api/v1/public/hero/`` returns the same shape so the
    homepage can rotate through them without further parsing.
    """

    enabled = models.BooleanField(
        default=True,
        help_text="主开关；关闭后首页隐藏题记区。",
    )
    quotes = models.JSONField(
        default=list,
        blank=True,
        help_text="[{id, text, attribution}, …]，由后台维护。",
    )
    rotation_seconds = models.PositiveIntegerField(
        default=8,
        help_text="多条时每隔多少秒切到下一条。",
    )
    animation = models.CharField(
        max_length=24,
        default="fade",
        choices=[(a, a) for a in HERO_ANIMATIONS],
        help_text="切换动画样式。",
    )
    play_order = models.CharField(
        max_length=16,
        default="random",
        choices=[(o, o) for o in HERO_PLAY_ORDERS],
        help_text="播放顺序：random 每次打开页面随机洗牌；sequential 按列表顺序。",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "题记设置"
        verbose_name_plural = "题记设置"

    def __str__(self) -> str:
        return f"题记设置 (enabled={self.enabled}, quotes={len(self.quotes or [])})"

    def save(self, *args, **kwargs) -> None:
        # Enforce singleton — same trick as AISettings.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "HeroSettings":
        obj, created = cls.objects.get_or_create(
            pk=1,
            defaults={
                "enabled": True,
                "quotes": list(DEFAULT_HERO_QUOTES),
                "rotation_seconds": 8,
                "animation": "fade",
            },
        )
        # Migrate legacy rows that pre-date this model — empty ``quotes``
        # would render an empty banner, which looks broken. Seed once.
        if not created and not obj.quotes:
            obj.quotes = list(DEFAULT_HERO_QUOTES)
            obj.save(update_fields=["quotes"])
        return obj
