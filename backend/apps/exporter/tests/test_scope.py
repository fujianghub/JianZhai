from __future__ import annotations

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import Folder


@pytest.mark.django_db
def test_scope_doc(owner, kb):
    doc = make_doc(kb, "one", raw="x")
    scope = collect_for_scope(owner=owner, scope="doc", target_id=doc.id)
    assert len(scope.documents) == 1
    assert scope.label == "one"


@pytest.mark.django_db
def test_scope_folder_includes_nested(owner, kb, folder):
    sub = Folder.objects.create(knowledge_base=kb, parent=folder, name="Sub")
    make_doc(kb, "in-folder", folder=folder)
    make_doc(kb, "in-sub", folder=sub)
    scope = collect_for_scope(owner=owner, scope="folder", target_id=folder.id)
    assert len(scope.documents) == 2


@pytest.mark.django_db
def test_scope_kb(owner, kb):
    make_doc(kb, "a")
    make_doc(kb, "b")
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    assert len(scope.documents) == 2


@pytest.mark.django_db
def test_scope_only_published(owner, kb):
    make_doc(kb, "draft", raw="d", status="draft")
    make_doc(kb, "pub", raw="r", published="p", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    assert len(scope.documents) == 1
    assert scope.documents[0].slug == "pub"


@pytest.mark.django_db
def test_scope_excludes_soft_deleted(owner, kb):
    doc = make_doc(kb, "gone")
    doc.soft_delete()
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    assert scope.documents == []


@pytest.mark.django_db
def test_scope_empty_folder(owner, kb, folder):
    scope = collect_for_scope(owner=owner, scope="folder", target_id=folder.id)
    assert scope.documents == []
