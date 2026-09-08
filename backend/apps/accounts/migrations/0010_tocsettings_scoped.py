# 2026-09-08 — 目录设置按类型分三份：``TocSettings.prefs`` 从一份扁平 prefs
# 变为 ``{"kblist": …, "kb": …, "article": …}``（大类/知识库列表 · 知识库文档
# 树 · 文档内容目录）。旧扁平 blob 摊到三份（它此前本就对三处同时生效）；
# 反向迁移取 ``article`` 一份还原为扁平。无 schema 变更。

from django.db import migrations, models

SCOPES = ("kblist", "kb", "article")


def forwards(apps, schema_editor):
    TocSettings = apps.get_model("accounts", "TocSettings")
    for obj in TocSettings.objects.all():
        prefs = obj.prefs if isinstance(obj.prefs, dict) else {}
        if prefs and not any(s in prefs for s in SCOPES):
            obj.prefs = {s: {"grouped": True, **prefs} for s in SCOPES}
            obj.save(update_fields=["prefs"])


def backwards(apps, schema_editor):
    TocSettings = apps.get_model("accounts", "TocSettings")
    for obj in TocSettings.objects.all():
        prefs = obj.prefs if isinstance(obj.prefs, dict) else {}
        if any(s in prefs for s in SCOPES):
            flat = prefs.get("article") or prefs.get("kb") or prefs.get("kblist") or {}
            obj.prefs = {k: v for k, v in dict(flat).items() if k != "grouped"}
            obj.save(update_fields=["prefs"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_tocsettings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tocsettings",
            name="prefs",
            field=models.JSONField(blank=True, default=dict, help_text="目录展示默认值，按类型分三份（见 TOC_SCOPES / DEFAULT_TOC_PREFS）。"),
        ),
        migrations.RunPython(forwards, backwards),
    ]
