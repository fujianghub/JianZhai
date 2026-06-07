from __future__ import annotations

from django.utils.text import slugify
from rest_framework import serializers

from apps.accounts.scoping import scope_queryset

from .models import Tag


class TagSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ["id", "name", "slug", "color", "document_count", "created_at"]
        read_only_fields = ["id", "slug", "document_count", "created_at"]

    def get_document_count(self, obj: Tag) -> int:
        # TagViewSet annotates ``_doc_count`` to avoid a COUNT per tag row.
        annotated = getattr(obj, "_doc_count", None)
        if annotated is not None:
            return annotated
        return obj.documents(manager="objects").count()

    def create(self, validated_data):
        name = validated_data["name"].strip()
        owner = self.context["request"].user
        slug = slugify(name, allow_unicode=True) or "tag"
        base = slug[:55]
        i = 0
        while Tag.objects.filter(owner=owner, slug=slug).exists():
            i += 1
            slug = f"{base}-{i}"
        return Tag.objects.create(
            owner=owner, name=name, slug=slug, color=validated_data.get("color", "")
        )


class TargetTagsSerializer(serializers.Serializer):
    """PATCH body for re-setting the tag list on a Document or KnowledgeBase."""

    tag_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)

    def set_on(self, target, user) -> list[Tag]:
        ids = self.validated_data["tag_ids"]
        # Superusers can attach any tag in the system; everyone else is scoped
        # to tags they personally own.
        tags = list(
            scope_queryset(Tag.objects.all(), user, field="owner").filter(id__in=ids)
        )
        target.tags.set(tags)
        return tags


# Backwards-compat alias for callers that still import the old name.
DocumentTagsSerializer = TargetTagsSerializer
