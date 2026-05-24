"""Create or refresh the "简斋·开发指南" public knowledge base.

Idempotent — running it multiple times updates the existing docs in place
rather than creating duplicates. Content is loaded from docs/dev-guide/ at the
repo root (Markdown + shared Mermaid diagrams).

Usage:
    python manage.py seed_architecture_kb           # update / create
    python manage.py seed_architecture_kb --owner 1 # pick a specific owner
"""
from __future__ import annotations

import re
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.knowledge.models import Document, KnowledgeBase

KB_NAME = "简斋·开发指南"
KB_SLUG = "dev-guide"
KB_DESC = "简斋（JianZhai）项目的官方架构与开发指南。两版文档：简单版面向上手，详细版面向深入。"
KB_ACCENT = "#1677ff"

DIAGRAM_PLACEHOLDER = re.compile(r"\{\{diagram:([a-z0-9-]+)\}\}")


def repo_root() -> Path:
    """jianzhai/ repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[5]


def dev_guide_dir() -> Path:
    return repo_root() / "docs" / "dev-guide"


def expand_diagrams(text: str, diagrams_dir: Path) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        path = diagrams_dir / f"{name}.mmd"
        if not path.is_file():
            raise FileNotFoundError(f"Missing diagram source: {path}")
        body = path.read_text(encoding="utf-8").strip()
        return f"```mermaid\n{body}\n```"

    return DIAGRAM_PLACEHOLDER.sub(repl, text)


def load_markdown(filename: str) -> str:
    path = dev_guide_dir() / filename
    if not path.is_file():
        raise FileNotFoundError(f"Missing dev guide markdown: {path}")
    raw = path.read_text(encoding="utf-8")
    return expand_diagrams(raw, dev_guide_dir() / "diagrams")


class Command(BaseCommand):
    help = "Create or refresh the 简斋·开发指南 public knowledge base + 2 architecture docs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner",
            type=int,
            default=None,
            help="User ID who owns the KB (default: first superuser).",
        )

    def handle(self, *args, **options):
        guide_dir = dev_guide_dir()
        if not guide_dir.is_dir():
            raise CommandError(
                f"docs/dev-guide not found at {guide_dir}. "
                "Run from a full checkout of the jianzhai repo."
            )

        User = get_user_model()
        owner_id = options.get("owner")
        if owner_id:
            owner = User.objects.filter(pk=owner_id).first()
            if not owner:
                raise CommandError(f"用户 {owner_id} 不存在")
        else:
            owner = User.objects.filter(is_superuser=True).order_by("pk").first()
            if not owner:
                raise CommandError("没有 superuser；用 --owner <id> 指定")

        kb, kb_created = KnowledgeBase.all_objects.update_or_create(
            owner=owner,
            slug=KB_SLUG,
            defaults={
                "name": KB_NAME,
                "description": KB_DESC,
                "accent_color": KB_ACCENT,
                "visibility": "public",
                "is_deleted": False,
                "deleted_at": None,
            },
        )
        action = "创建" if kb_created else "更新"
        self.stdout.write(self.style.SUCCESS(f"✓ {action}知识库：{kb.name} (id={kb.id}, slug={kb.slug})"))

        for title, slug, md_file in [
            ("简单版", "simple", "simple.md"),
            ("详细版", "detailed", "detailed.md"),
        ]:
            body = load_markdown(md_file)
            doc, doc_created = Document.all_objects.update_or_create(
                knowledge_base=kb,
                slug=slug,
                defaults={
                    "title": title,
                    "raw_content": body,
                    "published_content": body,
                    "status": "published",
                    "visibility": "public",
                    "is_deleted": False,
                    "deleted_at": None,
                    "published_at": timezone.now(),
                },
            )
            action = "创建" if doc_created else "更新"
            self.stdout.write(self.style.SUCCESS(f"  ✓ {action}文档：{doc.title} (id={doc.id})"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("完成。访问公开博客查看："))
        self.stdout.write(f"  http://localhost:3001/kb/{kb.slug}")
