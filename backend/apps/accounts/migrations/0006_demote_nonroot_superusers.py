"""v1.0 RBAC — demote non-root superusers to plain admins.

Under the new role model only the single root admin
(``ROOT_ADMIN_USERNAME``) is a superuser; every other authoring account is
an ``is_staff`` admin. Historic accounts created via ``createsuperuser`` are
``is_superuser=True`` and would otherwise keep cross-pool / root powers, so
downgrade them here.

Irreversible by design (we can't know which downgraded accounts were
originally superusers), so the reverse is a no-op. Idempotent: re-running
matches nothing once downgraded. Reads ``ROOT_ADMIN_USERNAME`` from settings
at apply time, so it adapts to local/prod env.
"""
from __future__ import annotations

from django.conf import settings
from django.db import migrations


def demote_nonroot_superusers(apps, schema_editor):
    User = apps.get_model("auth", "User")
    root_username = getattr(settings, "ROOT_ADMIN_USERNAME", "")
    for user in User.objects.filter(is_superuser=True):
        if root_username and user.username == root_username:
            continue
        user.is_superuser = False
        user.is_staff = True  # keep them as authors (admins), not readers
        user.save(update_fields=["is_superuser", "is_staff"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_add_hero_play_order"),
        ("auth", "__first__"),
    ]

    operations = [
        migrations.RunPython(
            demote_nonroot_superusers, migrations.RunPython.noop
        ),
    ]
