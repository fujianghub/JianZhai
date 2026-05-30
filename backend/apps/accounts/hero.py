"""Hero quote settings — public read + admin manage + batch import.

These three endpoints stay together in one file because they share the
same model (``HeroSettings``) and the same payload-shape helpers. Pulling
them out of ``views.py`` keeps that file focused on user / session / avatar.
"""
from __future__ import annotations

import re
import uuid
from typing import Iterable

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import HERO_ANIMATIONS, HeroSettings

MAX_QUOTES = 100
MAX_TEXT = 200
MAX_DYNASTY = 16
MAX_AUTHOR = 60
MAX_SOURCE = 60

# A dynasty marker appearing right before the author in either form:
#   [先秦]孔子   〔三国〕诸葛亮   【宋】苏轼
# Captured group 1 is the dynasty without brackets. Anchored to the start
# of the trimmed "rest" string so we don't accidentally chew brackets that
# appear inside the source title.
_DYNASTY_PREFIX_RE = re.compile(r"^[\[\(（〔【]([^\]\)）〕】]+)[\]\)）〕】]\s*")


# Inner separators we use to split a legacy ``attribution`` string into
# ``author`` and ``source``. Same set as the batch parser's weak/strong
# separators — gives consistent semantics across "load existing data" and
# "import a textarea full of new lines".
_ATTR_INNER_RE = re.compile(r"\s+[—–\-]{1,2}\s+|\s+by\s+|\s*[·•]\s*", re.IGNORECASE)


def _split_attribution(raw: str) -> tuple[str, str]:
    """Best-effort split of a legacy ``attribution`` into (author, source).

    A bare ``"诸葛亮 · 诫子书"`` → ``("诸葛亮", "诫子书")``.
    A standalone author with no source → ``("作者", "")``.
    Used both by the model-load backfill and the API validator when a
    client PATCH still sends the old ``attribution`` shape.
    """
    s = (raw or "").strip()
    if not s:
        return "", ""
    parts = _ATTR_INNER_RE.split(s, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return s, ""


def _serialize_quote(q: dict) -> dict:
    """Return the canonical wire shape: id / text / dynasty / author / source
    plus a convenience ``attribution`` field that joins everything for
    older clients that still render a single line."""
    qid = str(q.get("id") or uuid.uuid4().hex[:12])
    text = str(q.get("text") or "").strip()
    dynasty = str(q.get("dynasty") or "").strip()
    author = str(q.get("author") or "").strip()
    source = str(q.get("source") or "").strip()
    # Backfill from a legacy single-string attribution if all of dynasty +
    # author + source are absent. Post-migration rows shouldn't have this,
    # but it defends against upgraded fixtures / imported JSON dumps.
    if not (dynasty or author or source):
        legacy = str(q.get("attribution") or "").strip()
        if legacy:
            author, source = _split_attribution(legacy)
    # Derived attribution for v0.9.3 clients — joins whichever pieces are
    # present in a sensible reading order: 〔朝代〕作者 · 篇名.
    pieces = []
    if dynasty:
        pieces.append(f"〔{dynasty}〕")
    if author:
        pieces.append(author)
    head = "".join(pieces[:1]) + (pieces[1] if len(pieces) >= 2 else "")
    if source:
        attribution = f"{head} · {source}" if head else source
    else:
        attribution = head
    return {
        "id": qid,
        "text": text,
        "dynasty": dynasty,
        "author": author,
        "source": source,
        "attribution": attribution,
    }


def _serialize_settings(obj: HeroSettings) -> dict:
    return {
        "enabled": obj.enabled,
        "rotation_seconds": obj.rotation_seconds,
        "animation": obj.animation,
        "animations": list(HERO_ANIMATIONS),
        "quotes": [_serialize_quote(q) for q in (obj.quotes or [])],
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
    }


def _serialize_public(obj: HeroSettings) -> dict:
    """The visitor-facing slim shape: only what the homepage needs."""
    return {
        "enabled": obj.enabled,
        "rotation_seconds": obj.rotation_seconds,
        "animation": obj.animation,
        "quotes": [
            {
                "id": q["id"],
                "text": q["text"],
                "dynasty": q["dynasty"],
                "author": q["author"],
                "source": q["source"],
                "attribution": q["attribution"],
            }
            for q in (_serialize_quote(q) for q in (obj.quotes or []))
            if q["text"]
        ],
    }


def _validated_quotes(raw) -> list[dict] | str:
    """Validate a quotes array. Returns the cleaned list or an error string.

    Accepts both new shape (``dynasty``/``author``/``source`` split) and
    legacy (``attribution`` single string). When both shapes are present
    in the same payload, the new fields win and the legacy string is
    silently ignored — keeps round-tripping API responses safe.
    """
    if not isinstance(raw, list):
        return "quotes 必须是数组"
    if len(raw) > MAX_QUOTES:
        return f"题记最多 {MAX_QUOTES} 条"
    cleaned: list[dict] = []
    seen_ids: set[str] = set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            return f"第 {i + 1} 条格式错误"
        text = str(item.get("text") or "").strip()
        if not text:
            # Silently skip blanks — handier for batch-import round-trips.
            continue
        if len(text) > MAX_TEXT:
            return f"第 {i + 1} 条正文超过 {MAX_TEXT} 字"
        dynasty = str(item.get("dynasty") or "").strip()
        author = str(item.get("author") or "").strip()
        source = str(item.get("source") or "").strip()
        # Legacy fallback: if the client sent only ``attribution``, split it.
        if not (dynasty or author or source):
            author, source = _split_attribution(item.get("attribution") or "")
        if len(dynasty) > MAX_DYNASTY:
            return f"第 {i + 1} 条朝代超过 {MAX_DYNASTY} 字"
        if len(author) > MAX_AUTHOR:
            return f"第 {i + 1} 条作者超过 {MAX_AUTHOR} 字"
        if len(source) > MAX_SOURCE:
            return f"第 {i + 1} 条篇名超过 {MAX_SOURCE} 字"
        qid = str(item.get("id") or "").strip() or uuid.uuid4().hex[:12]
        if qid in seen_ids:
            qid = uuid.uuid4().hex[:12]
        seen_ids.add(qid)
        cleaned.append(
            {
                "id": qid,
                "text": text,
                "dynasty": dynasty,
                "author": author,
                "source": source,
            }
        )
    return cleaned


# ── Endpoints ──────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def hero_public(request):
    """Anonymous: returns the slim shape the homepage rotator consumes."""
    return Response(_serialize_public(HeroSettings.load()))


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def hero_settings(request):
    """Authenticated read; staff-only write.

    PATCH body accepts any subset of:
        enabled (bool), rotation_seconds (int 1..3600),
        animation (str in ``HERO_ANIMATIONS``), quotes (list[dict]).
    """
    obj = HeroSettings.load()

    if request.method == "PATCH":
        if not request.user.is_staff:
            return Response({"detail": "仅管理员可改"}, status=status.HTTP_403_FORBIDDEN)
        data = request.data if isinstance(request.data, dict) else {}

        if "enabled" in data:
            obj.enabled = bool(data["enabled"])

        if "rotation_seconds" in data:
            try:
                n = int(data["rotation_seconds"])
            except (TypeError, ValueError):
                return Response(
                    {"detail": "rotation_seconds 必须是整数"}, status=400
                )
            if n < 1 or n > 3600:
                return Response(
                    {"detail": "rotation_seconds 范围 1–3600 秒"}, status=400
                )
            obj.rotation_seconds = n

        if "animation" in data:
            anim = str(data["animation"]).strip()
            if anim not in HERO_ANIMATIONS:
                return Response(
                    {
                        "detail": f"未知动画 {anim!r}",
                        "supported": list(HERO_ANIMATIONS),
                    },
                    status=400,
                )
            obj.animation = anim

        if "quotes" in data:
            result = _validated_quotes(data["quotes"])
            if isinstance(result, str):
                return Response({"detail": result}, status=400)
            obj.quotes = result

        obj.save()

    return Response(_serialize_settings(obj))


# ── Batch import ───────────────────────────────────────────────────────────


# Separators ordered by priority: dashes are the canonical
# "quote — author" form, so they win whenever the line contains one.
# Middle dots (·/•) are used inside Chinese attributions ("苏轼 · 定风波"),
# so we only fall back to them when no dash is present.
_STRONG_SEPARATORS_RE = re.compile(r"\s+[—–\-]{1,2}\s+|\s+by\s+", re.IGNORECASE)
_WEAK_SEPARATORS_RE = re.compile(r"\s+[·•]\s+")


def _parse_batch_lines(text: str) -> Iterable[dict]:
    """Yield quote dicts parsed from a multi-line batch input.

    Each non-blank, non-comment line is split in stages:

      1. Strong split (— – - / by) → ``正文`` vs the rest.
      2. If ``rest`` starts with ``[xxx]`` / ``〔xxx〕`` / ``【xxx】``,
         strip that as the **dynasty** prefix.
      3. The remainder of ``rest`` is split on the FIRST weak separator
         (· •) → ``author`` vs ``source``.

    Examples:

      ``A — [先秦]孔子 · 论语``    → dynasty="先秦", author="孔子", source="论语"
      ``A — 〔三国〕诸葛亮 · 出师表`` → dynasty="三国", author="诸葛亮", source="出师表"
      ``A — 苏轼 · 定风波``        → dynasty="",    author="苏轼", source="定风波"
      ``A - 苏轼``                 → dynasty="",    author="苏轼", source=""
      ``A by Author``              → dynasty="",    author="Author", source=""
      ``A · 篇名`` (no dash)       → dynasty="",    author="",    source="篇名"
      ``A``                        → dynasty="",    author="",    source=""

    Lines starting with ``#`` are treated as comments. We split on the
    LAST strong separator so quotes that contain dashes inside the text
    (e.g. "be water - flow — Bruce Lee") still pick up the trailing
    "— author" portion correctly.
    """
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        strong = list(_STRONG_SEPARATORS_RE.finditer(line))
        if strong:
            cut = strong[-1]
        else:
            weak = list(_WEAK_SEPARATORS_RE.finditer(line))
            cut = weak[-1] if weak else None
        if cut is not None:
            text_part = line[: cut.start()].strip()
            rest_part = line[cut.end():].strip()
        else:
            text_part, rest_part = line, ""

        # Stage 2: optional dynasty prefix in [xxx] / 〔xxx〕 / 【xxx】 form.
        dynasty_part = ""
        if rest_part:
            m = _DYNASTY_PREFIX_RE.match(rest_part)
            if m:
                dynasty_part = m.group(1).strip()
                rest_part = rest_part[m.end():].strip()

        # Stage 3: split rest into author + source on the first weak
        # separator (·/•). FIRST occurrence wins because source titles
        # legitimately contain dots (e.g. "上巳节·乙巳") whereas
        # authors rarely do.
        if rest_part:
            inner = _WEAK_SEPARATORS_RE.search(rest_part)
            if inner:
                author_part = rest_part[: inner.start()].strip()
                source_part = rest_part[inner.end():].strip()
            else:
                author_part, source_part = rest_part, ""
        else:
            author_part, source_part = "", ""

        if text_part:
            yield {
                "id": uuid.uuid4().hex[:12],
                "text": text_part[:MAX_TEXT],
                "dynasty": dynasty_part[:MAX_DYNASTY],
                "author": author_part[:MAX_AUTHOR],
                "source": source_part[:MAX_SOURCE],
            }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def hero_batch_import(request):
    """Replace or append a block of quotes parsed from a textarea.

    Body:
        text: str   — raw multi-line input, one quote per line
        mode: str   — "replace" (default) or "append"
    """
    if not request.user.is_staff:
        return Response({"detail": "仅管理员可改"}, status=status.HTTP_403_FORBIDDEN)
    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("text") or ""
    mode = (data.get("mode") or "replace").strip()
    if mode not in ("replace", "append"):
        return Response({"detail": "mode 必须是 replace 或 append"}, status=400)

    parsed = list(_parse_batch_lines(raw))
    if not parsed:
        return Response({"detail": "未解析到任何题记"}, status=400)

    obj = HeroSettings.load()
    if mode == "append":
        existing = list(obj.quotes or [])
        existing.extend(parsed)
        result = _validated_quotes(existing)
    else:
        result = _validated_quotes(parsed)
    if isinstance(result, str):
        return Response({"detail": result}, status=400)
    obj.quotes = result
    obj.save()
    return Response(_serialize_settings(obj))
