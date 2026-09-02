from __future__ import annotations

from rest_framework import serializers

from .models import CFI_MAX_LENGTH, Bookmark, Highlight

TEXT_MAX = 2000
NOTE_MAX = 10000
SELECTOR_CONTEXT_MAX = 500
SELECTOR_KEYS = {"quote", "prefix", "suffix", "heading"}


def _validate_cfi(value: str) -> str:
    value = (value or "").strip()
    if not value.startswith("epubcfi(") or not value.endswith(")"):
        raise serializers.ValidationError("cfi must look like epubcfi(...)")
    if len(value) > CFI_MAX_LENGTH:
        raise serializers.ValidationError("cfi too long")
    return value


class HighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = Highlight
        fields = [
            "id",
            "document",
            "cfi",
            "selector",
            "text",
            "chapter",
            "color",
            "style",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "document", "created_at", "updated_at"]
        extra_kwargs = {
            "cfi": {"allow_blank": True, "required": False},
            "text": {"max_length": TEXT_MAX, "allow_blank": True, "required": False},
            "note": {"max_length": NOTE_MAX, "allow_blank": True, "required": False},
            "chapter": {"allow_blank": True, "required": False},
        }

    def validate_cfi(self, value: str) -> str:
        if not value:
            return ""
        return _validate_cfi(value)

    def validate_selector(self, value):
        if value is None:
            return None
        if not isinstance(value, dict):
            raise serializers.ValidationError("selector must be an object")
        quote = value.get("quote")
        if not isinstance(quote, str) or not quote.strip():
            raise serializers.ValidationError("selector.quote required")
        if len(quote) > TEXT_MAX:
            raise serializers.ValidationError("selector.quote too long")
        out = {"quote": quote}
        for key in ("prefix", "suffix", "heading"):
            v = value.get(key)
            if v is None:
                continue
            if not isinstance(v, str):
                raise serializers.ValidationError(f"selector.{key} must be a string")
            out[key] = v[:SELECTOR_CONTEXT_MAX]
        return out

    def validate(self, attrs):
        # Exactly one anchor. On partial update fall back to the stored value
        # so a note-only PATCH never has to resend the anchor.
        cfi = attrs.get("cfi", getattr(self.instance, "cfi", "") or "")
        selector = attrs.get("selector", getattr(self.instance, "selector", None))
        if bool(cfi) == bool(selector):
            raise serializers.ValidationError("exactly one of cfi / selector required")
        return attrs


class BookmarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bookmark
        fields = ["id", "document", "cfi", "chapter", "excerpt", "created_at"]
        read_only_fields = ["id", "document", "created_at"]
        extra_kwargs = {
            "chapter": {"allow_blank": True, "required": False},
            "excerpt": {"allow_blank": True, "required": False},
        }

    def validate_cfi(self, value: str) -> str:
        return _validate_cfi(value)
