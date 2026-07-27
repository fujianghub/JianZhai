from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import Document, Folder, KnowledgeBase

User = get_user_model()


@pytest.fixture(autouse=True)
def _isolated_media_and_exports(settings, tmp_path):
    """导出产物全部落 tmp。此前测试套件不覆盖 MEDIA_ROOT，export_root()
    直接写进真实 backend/exports/——实测曾累积 566 个孤儿文件。"""
    from pathlib import Path

    settings.MEDIA_ROOT = str(tmp_path / "media")
    Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)


@pytest.fixture
def owner(db):
    # v1.0 RBAC: authoring content lives in a single shared pool gated by
    # is_staff (the "author" tier). An export "owner" must therefore be an
    # author or scope_queryset returns an empty set and collect_for_scope
    # finds nothing.
    return User.objects.create_user(
        "exportuser", "export@example.com", "pass", is_staff=True
    )


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Export KB", slug="export-kb")


@pytest.fixture
def folder(kb):
    return Folder.objects.create(knowledge_base=kb, name="Notes")


def make_doc(
    kb,
    slug: str,
    *,
    raw: str = "",
    published: str = "",
    status: str = "draft",
    folder=None,
    order: int = 0,
):
    return Document.objects.create(
        knowledge_base=kb,
        folder=folder,
        title=slug,
        slug=slug,
        raw_content=raw,
        published_content=published,
        status=status,
        order=order,
    )
