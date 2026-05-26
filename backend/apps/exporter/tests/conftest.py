from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import Document, Folder, KnowledgeBase

User = get_user_model()


@pytest.fixture
def owner(db):
    return User.objects.create_user("exportuser", "export@example.com", "pass")


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Export KB", slug="export-kb")


@pytest.fixture
def folder(kb):
    return Folder.objects.create(knowledge_base=kb, name="Notes")


def make_doc(kb, slug: str, *, raw: str = "", published: str = "", status: str = "draft", folder=None):
    return Document.objects.create(
        knowledge_base=kb,
        folder=folder,
        title=slug,
        slug=slug,
        raw_content=raw,
        published_content=published,
        status=status,
    )
