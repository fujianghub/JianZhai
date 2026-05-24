from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self) -> "SoftDeleteQuerySet":
        return self.filter(is_deleted=False)

    def deleted(self) -> "SoftDeleteQuerySet":
        return self.filter(is_deleted=True)


class SoftDeleteManager(models.Manager):
    def get_queryset(self) -> SoftDeleteQuerySet:
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class AllObjectsManager(models.Manager):
    def get_queryset(self) -> SoftDeleteQuerySet:
        return SoftDeleteQuerySet(self.model, using=self._db)


def _unique_slug(model: type[models.Model], base: str, scope: dict) -> str:
    candidate = slugify(base, allow_unicode=True) or "untitled"
    candidate = candidate[:200]
    suffix = 0
    qs = model.objects.filter(**scope)
    while qs.filter(slug=candidate).exists():
        suffix += 1
        candidate = f"{slugify(base, allow_unicode=True)[:195]}-{suffix}"
    return candidate


class KnowledgeBase(models.Model):
    VISIBILITY_CHOICES = [("private", "Private"), ("public", "Public")]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_bases",
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, allow_unicode=True)
    description = models.TextField(blank=True)
    cover_image = models.CharField(max_length=500, blank=True)
    accent_color = models.CharField(max_length=20, blank=True)  # "#1677ff" etc.
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default="private")
    order = models.IntegerField(default=0)

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "slug"],
                condition=models.Q(is_deleted=False),
                name="unique_owner_kb_slug_alive",
            ),
        ]
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = _unique_slug(
                KnowledgeBase, self.name, {"owner": self.owner, "is_deleted": False}
            )
        super().save(*args, **kwargs)

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])


class Folder(models.Model):
    knowledge_base = models.ForeignKey(
        KnowledgeBase, on_delete=models.CASCADE, related_name="folders"
    )
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["knowledge_base", "parent"]),
        ]

    def __str__(self) -> str:
        return self.name

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])
        for child in self.children.all():
            child.soft_delete()
        for doc in self.documents.all():
            doc.soft_delete()


class Document(models.Model):
    STATUS_CHOICES = [("draft", "Draft"), ("published", "Published")]
    VISIBILITY_CHOICES = [("private", "Private"), ("public", "Public")]

    knowledge_base = models.ForeignKey(
        KnowledgeBase, on_delete=models.CASCADE, related_name="documents"
    )
    folder = models.ForeignKey(
        Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name="documents"
    )
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, allow_unicode=True)

    raw_content = models.TextField(blank=True)
    published_content = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default="private")

    # Paper-style preset for the blog reader background (e.g. "marble", "rice-paper").
    # Empty string means use the default (plain).
    paper_style = models.CharField(max_length=40, blank=True, default="")

    search_vector = SearchVectorField(null=True, blank=True)

    order = models.IntegerField(default=0)
    # Optimistic-concurrency token. Increments on every save where content
    # actually changed; the API uses it to detect "you and another tab edited
    # the same doc" and refuse a stale overwrite.
    version = models.PositiveIntegerField(default=1)
    # Authorship attribution — surfaced in the doc stats panel.
    # `created_by` is set once on creation; `last_edited_by` is updated on
    # every content-altering PATCH.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents_created",
    )
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents_last_edited",
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["knowledge_base", "slug"],
                condition=models.Q(is_deleted=False),
                name="unique_kb_doc_slug_alive",
            ),
        ]
        indexes = [
            GinIndex(fields=["search_vector"]),
            models.Index(fields=["knowledge_base", "folder"]),
            models.Index(fields=["visibility", "status", "-published_at"]),
        ]
        ordering = ["order", "-updated_at"]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = _unique_slug(
                Document,
                self.title,
                {"knowledge_base": self.knowledge_base, "is_deleted": False},
            )
        super().save(*args, **kwargs)

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

    def publish(self) -> None:
        from apps.knowledge.html_content import resolve_html_body

        body = (self.raw_content or "").strip()
        if not body:
            resolved = resolve_html_body(self)
            if resolved.strip():
                self.raw_content = resolved
                self.published_content = resolved
            else:
                self.published_content = self.raw_content
        else:
            self.published_content = self.raw_content
        self.status = "published"
        if not self.published_at:
            self.published_at = timezone.now()
        self.save(
            update_fields=[
                "raw_content",
                "published_content",
                "status",
                "published_at",
                "updated_at",
            ]
        )

    def unpublish(self) -> None:
        self.status = "draft"
        self.save(update_fields=["status", "updated_at"])
