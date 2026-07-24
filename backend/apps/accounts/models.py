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


class UserTag(models.Model):
    """An author-assigned label on reader accounts (WeChat-contact style).

    Global / shared across authors — same role-based shared pool philosophy as
    the content scoping (``apps.accounts.scoping``): any staff user manages the
    one tag vocabulary, no per-owner isolation. Tags drive both user-list
    filtering and the KB/category audience targeting (``include`` / ``exclude``
    by tag). They are author-facing only; readers never see their own tags.

    The reverse accessor is ``user.account_tags`` — NOT ``user.tags``, which is
    already taken by ``apps.tags.Tag.owner`` (content tags).
    """

    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=20, blank=True)  # "#1677ff" etc.
    created_at = models.DateTimeField(auto_now_add=True)

    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="account_tags",
        blank=True,
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ReadGrant(models.Model):
    """A per-user reading whitelist entry (user-side, not content-side).

    Complements the content-side audience visibility (KB / category
    ``audience_mode``): a user with **no** grant rows is unrestricted and
    sees whatever the audience rules allow (legacy behaviour); a user with
    one or more rows is *restricted* — only content matched by at least one
    grant is readable, AND the content-side audience rules still apply
    (both gates must pass; enforced in ``apps.knowledge.audience``).

    Exactly one of the four target FKs is non-null (DB CheckConstraint):

    - ``knowledge_base`` — the whole KB
    - ``category``       — every KB in that category
    - ``folder``         — that folder's subtree (descendants included)
    - ``document``       — that single document

    Semantics by design:
    - Authors (``is_staff``) bypass all reader filtering, so grants on a
      staff user are inert; the serializer refuses to create them.
    - Soft-deleted targets fail closed: the grant row survives (the user
      stays restricted) but the target itself is naturally invisible via
      the default managers. Hard deletes CASCADE the grant away.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="read_grants",
    )
    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="read_grants",
    )
    category = models.ForeignKey(
        "knowledge.KnowledgeBaseCategory",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="read_grants",
    )
    folder = models.ForeignKey(
        "knowledge.Folder",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="read_grants",
    )
    document = models.ForeignKey(
        "knowledge.Document",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="read_grants",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                name="readgrant_exactly_one_target",
                condition=(
                    models.Q(
                        knowledge_base__isnull=False,
                        category__isnull=True,
                        folder__isnull=True,
                        document__isnull=True,
                    )
                    | models.Q(
                        knowledge_base__isnull=True,
                        category__isnull=False,
                        folder__isnull=True,
                        document__isnull=True,
                    )
                    | models.Q(
                        knowledge_base__isnull=True,
                        category__isnull=True,
                        folder__isnull=False,
                        document__isnull=True,
                    )
                    | models.Q(
                        knowledge_base__isnull=True,
                        category__isnull=True,
                        folder__isnull=True,
                        document__isnull=False,
                    )
                ),
            ),
            models.UniqueConstraint(
                fields=["user", "knowledge_base"],
                condition=models.Q(knowledge_base__isnull=False),
                name="uniq_readgrant_user_kb",
            ),
            models.UniqueConstraint(
                fields=["user", "category"],
                condition=models.Q(category__isnull=False),
                name="uniq_readgrant_user_category",
            ),
            models.UniqueConstraint(
                fields=["user", "folder"],
                condition=models.Q(folder__isnull=False),
                name="uniq_readgrant_user_folder",
            ),
            models.UniqueConstraint(
                fields=["user", "document"],
                condition=models.Q(document__isnull=False),
                name="uniq_readgrant_user_document",
            ),
        ]

    def __str__(self) -> str:
        target = (
            f"kb:{self.knowledge_base_id}"
            if self.knowledge_base_id
            else f"category:{self.category_id}"
            if self.category_id
            else f"folder:{self.folder_id}"
            if self.folder_id
            else f"document:{self.document_id}"
        )
        return f"ReadGrant(user={self.user_id}, {target})"


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

    # Public homepage rotator payload cache — invalidated on every save so an
    # edit in /admin/hero shows up immediately (not after a TTL).
    PUBLIC_CACHE_KEY = "hero:public:v1"
    PUBLIC_CACHE_TTL = 300

    def save(self, *args, **kwargs) -> None:
        # Enforce singleton — same trick as AISettings.
        self.pk = 1
        super().save(*args, **kwargs)
        from django.core.cache import cache

        cache.delete(self.PUBLIC_CACHE_KEY)

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
