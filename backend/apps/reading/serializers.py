from __future__ import annotations

from rest_framework import serializers

from .models import CFI_MAX_LENGTH, Bookmark, Highlight, ReadingPosition

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


PDF_QUADS_MAX = 200


def _validate_pdf_selector(value: dict) -> dict:
    """``{kind:"pdf", page, quads:[[x1,y1,…x4,y4], …]}`` — PDF user-space quads
    (same shape as /QuadPoints), one highlight per page (2026-09-08)."""
    page = value.get("page")
    if not isinstance(page, int) or isinstance(page, bool) or page < 1:
        raise serializers.ValidationError("selector.page must be a positive integer")
    quads = value.get("quads")
    if not isinstance(quads, list) or not quads:
        raise serializers.ValidationError("selector.quads required")
    if len(quads) > PDF_QUADS_MAX:
        raise serializers.ValidationError("selector.quads too many")
    clean = []
    for q in quads:
        if not isinstance(q, list) or len(q) != 8 or not all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in q):
            raise serializers.ValidationError("selector.quads entries must be 8 numbers")
        clean.append([round(float(n), 2) for n in q])
    return {"kind": "pdf", "page": page, "quads": clean}


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
        if value.get("kind") == "pdf":
            return _validate_pdf_selector(value)
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
        fields = ["id", "document", "cfi", "page", "chapter", "excerpt", "created_at"]
        read_only_fields = ["id", "document", "created_at"]
        extra_kwargs = {
            "cfi": {"allow_blank": True, "required": False},
            "page": {"required": False, "allow_null": True, "min_value": 1},
            "chapter": {"allow_blank": True, "required": False},
            "excerpt": {"allow_blank": True, "required": False},
        }

    def validate_cfi(self, value: str) -> str:
        value = (value or "").strip()
        return _validate_cfi(value) if value else ""

    def validate(self, attrs):
        cfi = attrs.get("cfi", "") or ""
        page = attrs.get("page")
        if bool(cfi) == (page is not None):
            raise serializers.ValidationError("exactly one of cfi / page required")
        return attrs


class ReadingPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingPosition
        fields = ["document", "cfi", "fraction", "page", "offset", "slide", "updated_at"]
        read_only_fields = ["document", "updated_at"]
        extra_kwargs = {
            "cfi": {"allow_blank": True, "required": False},
            "fraction": {"required": False, "allow_null": True, "min_value": 0.0, "max_value": 1.0},
            "page": {"required": False, "allow_null": True, "min_value": 1},
            "offset": {"required": False, "allow_null": True, "min_value": 0.0, "max_value": 1.0},
            "slide": {"required": False, "allow_null": True},
        }

    def validate_cfi(self, value: str) -> str:
        value = (value or "").strip()
        return _validate_cfi(value) if value else ""

    def validate(self, attrs):
        if not any(attrs.get(k) not in (None, "") for k in ("cfi", "fraction", "page", "slide")):
            raise serializers.ValidationError("at least one of cfi / fraction / page / slide required")
        return attrs

