from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, Folder, KnowledgeBase

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    # Reordering the tree is an authoring action → requires is_staff.
    return User.objects.create_user(
        "reorderowner", "reorder@example.com", "pass", is_staff=True
    )


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Reorder KB", slug="reorder-kb")


@pytest.fixture
def other_kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Other KB", slug="other-kb")


@pytest.mark.django_db
def test_reorder_rejects_foreign_parent_folder(api_client, owner, kb, other_kb):
    foreign_folder = Folder.objects.create(knowledge_base=other_kb, name="Foreign")
    doc = Document.objects.create(
        knowledge_base=kb,
        title="Doc",
        slug="doc",
        raw_content="",
    )
    api_client.force_authenticate(user=owner)
    url = reverse("api_v1:tree-reorder")
    resp = api_client.post(
        url,
        {
            "knowledge_base": kb.id,
            "items": [
                {
                    "type": "document",
                    "id": doc.id,
                    "order": 0,
                    "parent_folder_id": foreign_folder.id,
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "parent_folder_id" in resp.data["detail"]
    doc.refresh_from_db()
    assert doc.folder_id is None
