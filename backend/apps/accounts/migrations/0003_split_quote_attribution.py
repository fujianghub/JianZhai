"""Data migration: split each quote's legacy ``attribution`` into
``author`` + ``source``, and rename animation ``"zoom"`` → ``"ink-wash"``.

The quotes column is a JSONField on the singleton HeroSettings row, so
this is a one-shot edit-in-place. We keep the parser inline (instead of
importing from ``hero.py``) so future refactors to the API layer don't
break replay-from-zero of the migration history.
"""
from __future__ import annotations

import re

from django.db import migrations


# Same precedence rules as the runtime parser in apps.accounts.hero —
# strong dashes / "by" first, fall back to ·/• when none present.
_STRONG_RE = re.compile(r"\s+[—–\-]{1,2}\s+|\s+by\s+", re.IGNORECASE)
_WEAK_RE = re.compile(r"\s*[·•]\s*")


def _split_attribution(s: str) -> tuple[str, str]:
    s = (s or "").strip()
    if not s:
        return "", ""
    m = _STRONG_RE.search(s) or _WEAK_RE.search(s)
    if m:
        return s[: m.start()].strip(), s[m.end():].strip()
    return s, ""


def split_quotes(apps, schema_editor):
    HeroSettings = apps.get_model("accounts", "HeroSettings")
    for hs in HeroSettings.objects.all():
        # Animation slug: ``zoom`` is replaced by ``ink-wash`` in v0.9.4.
        if hs.animation == "zoom":
            hs.animation = "ink-wash"
        if not hs.quotes:
            hs.save()
            continue
        next_quotes = []
        for q in hs.quotes:
            if not isinstance(q, dict):
                continue
            # New shape already present — leave it alone.
            if q.get("author") is not None or q.get("source") is not None:
                next_quotes.append(
                    {
                        "id": q.get("id"),
                        "text": q.get("text", ""),
                        "author": (q.get("author") or "").strip(),
                        "source": (q.get("source") or "").strip(),
                    }
                )
                continue
            author, source = _split_attribution(q.get("attribution", ""))
            next_quotes.append(
                {
                    "id": q.get("id"),
                    "text": q.get("text", ""),
                    "author": author,
                    "source": source,
                }
            )
        hs.quotes = next_quotes
        hs.save()


def rejoin_quotes(apps, schema_editor):
    """Reverse: rejoin ``author + source`` back into a single ``attribution``
    string so downgrades stay consistent. Animation slug roll-back is a
    one-way change — old code wouldn't know ``ink-wash`` anyway."""
    HeroSettings = apps.get_model("accounts", "HeroSettings")
    for hs in HeroSettings.objects.all():
        if hs.animation == "ink-wash":
            hs.animation = "fade"
        if not hs.quotes:
            hs.save()
            continue
        out = []
        for q in hs.quotes:
            if not isinstance(q, dict):
                continue
            a, s = (q.get("author") or "").strip(), (q.get("source") or "").strip()
            if a and s:
                attribution = f"{a} · {s}"
            else:
                attribution = a or s
            out.append({"id": q.get("id"), "text": q.get("text", ""), "attribution": attribution})
        hs.quotes = out
        hs.save()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_herosettings"),
    ]

    operations = [
        migrations.RunPython(split_quotes, rejoin_quotes),
    ]
