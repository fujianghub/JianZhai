"""回滚端点的乐观并发语义。

历史 bug：restore 只写 ``raw_content``/``updated_at``，不递增 ``version`` 也不
加行锁 —— 一个停留在回滚前版本号的旧标签页随后 autosave，expected_version
恰好匹配，悄无声息地把刚回滚的内容又覆盖回去。
"""
from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase
from apps.versioning.models import DocumentVersion

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    # Version restore is an authoring action → requires is_staff.
    return User.objects.create_user(
        "restoreowner", "restore@example.com", "pass", is_staff=True
    )


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Restore KB", slug="restore-kb")


@pytest.fixture
def doc(kb):
    return Document.objects.create(
        knowledge_base=kb,
        title="Doc",
        slug="restore-doc",
        raw_content="old body",
        status="draft",
    )


def _restore_url(doc_id: int, vid: int) -> str:
    return reverse("api_v1:version-restore", args=[doc_id, vid])


@pytest.mark.django_db
def test_restore_bumps_document_version(api_client, owner, doc):
    snapshot = DocumentVersion.create_snapshot(
        document=doc, content="old body", message="v1", created_by=owner
    )
    doc.raw_content = "new body"
    doc.save(update_fields=["raw_content"])
    before = Document.objects.get(pk=doc.pk).version

    api_client.force_authenticate(user=owner)
    resp = api_client.post(_restore_url(doc.id, snapshot.id))
    assert resp.status_code == 200

    doc.refresh_from_db()
    assert doc.raw_content == "old body"
    assert doc.version == before + 1


@pytest.mark.django_db
def test_stale_autosave_after_restore_gets_409(api_client, owner, doc):
    """回滚后，带旧 expected_version 的 PATCH 必须 409，而不是静默覆盖。"""
    snapshot = DocumentVersion.create_snapshot(
        document=doc, content="old body", message="v1", created_by=owner
    )
    api_client.force_authenticate(user=owner)

    stale_version = Document.objects.get(pk=doc.pk).version  # 旧标签页记住的版本号

    resp = api_client.post(_restore_url(doc.id, snapshot.id))
    assert resp.status_code == 200

    patch = api_client.patch(
        reverse("api_v1:document-detail", args=[doc.id]),
        {"raw_content": "stale tab content", "expected_version": stale_version},
        format="json",
    )
    assert patch.status_code == 409

    doc.refresh_from_db()
    assert doc.raw_content == "old body"  # 回滚结果未被覆盖


@pytest.mark.django_db
def test_restore_creates_undo_snapshot_pair(api_client, owner, doc):
    snapshot = DocumentVersion.create_snapshot(
        document=doc, content="old body", message="v1", created_by=owner
    )
    doc.raw_content = "new body"
    doc.save(update_fields=["raw_content"])
    count_before = doc.versions.count()

    api_client.force_authenticate(user=owner)
    resp = api_client.post(_restore_url(doc.id, snapshot.id))
    assert resp.status_code == 200
    # 回滚前自动快照 + 回滚结果快照
    assert doc.versions.count() == count_before + 2
