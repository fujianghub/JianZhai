"""Data migration: add a ``dynasty`` field to every hero quote.

The seed quote is bumped to ``"三国"`` so a fresh install renders the full
朝代·作者·篇名 chain. Existing rows just get an empty string — the admin
can backfill the dynasty in the management UI.
"""
from __future__ import annotations

from django.db import migrations

SEED_QUOTE_ID = "seed-1"
SEED_DYNASTY = "三国"


def add_dynasty(apps, schema_editor):
    HeroSettings = apps.get_model("accounts", "HeroSettings")
    for hs in HeroSettings.objects.all():
        if not hs.quotes:
            hs.save()
            continue
        out = []
        for q in hs.quotes:
            if not isinstance(q, dict):
                continue
            # Skip if already present.
            if "dynasty" in q:
                out.append(q)
                continue
            # Seed quote gets its canonical dynasty; user quotes start empty
            # and the admin fills via the UI.
            dynasty = SEED_DYNASTY if q.get("id") == SEED_QUOTE_ID else ""
            out.append(
                {
                    "id": q.get("id"),
                    "text": q.get("text", ""),
                    "dynasty": dynasty,
                    "author": (q.get("author") or "").strip(),
                    "source": (q.get("source") or "").strip(),
                }
            )
        hs.quotes = out
        hs.save()


def drop_dynasty(apps, schema_editor):
    """Reverse: strip the dynasty field so old code doesn't trip on it."""
    HeroSettings = apps.get_model("accounts", "HeroSettings")
    for hs in HeroSettings.objects.all():
        if not hs.quotes:
            hs.save()
            continue
        out = []
        for q in hs.quotes:
            if not isinstance(q, dict):
                continue
            out.append(
                {
                    "id": q.get("id"),
                    "text": q.get("text", ""),
                    "author": (q.get("author") or "").strip(),
                    "source": (q.get("source") or "").strip(),
                }
            )
        hs.quotes = out
        hs.save()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_split_quote_attribution"),
    ]

    operations = [
        migrations.RunPython(add_dynasty, drop_dynasty),
    ]
