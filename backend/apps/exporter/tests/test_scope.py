from __future__ import annotations

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.tests.conftest import make_doc
from apps.knowledge.models import Folder, KnowledgeBase


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


# ---- selection scope (batch / multi-select export) ----


@pytest.mark.django_db
def test_selection_folder_only_includes_nested(owner, kb, folder):
    sub = Folder.objects.create(knowledge_base=kb, parent=folder, name="Sub")
    make_doc(kb, "in-folder", folder=folder)
    make_doc(kb, "in-sub", folder=sub)
    make_doc(kb, "loose")  # not under the folder → excluded
    scope = collect_for_scope(
        owner=owner, scope="selection", target_id=0, folder_ids=[folder.id]
    )
    assert {d.slug for d in scope.documents} == {"in-folder", "in-sub"}
    assert scope.label == "Export KB · 选定 2 篇"


@pytest.mark.django_db
def test_selection_docs_only_exact_set(owner, kb):
    a = make_doc(kb, "a")
    make_doc(kb, "b")
    c = make_doc(kb, "c")
    scope = collect_for_scope(
        owner=owner, scope="selection", target_id=0, doc_ids=[a.id, c.id]
    )
    assert {d.slug for d in scope.documents} == {"a", "c"}


@pytest.mark.django_db
def test_selection_mixed_dedupes_overlap(owner, kb, folder):
    inside = make_doc(kb, "inside", folder=folder)
    loose = make_doc(kb, "loose")
    # `inside` is reachable both via the folder and via the explicit doc pick.
    scope = collect_for_scope(
        owner=owner,
        scope="selection",
        target_id=0,
        folder_ids=[folder.id],
        doc_ids=[inside.id, loose.id],
    )
    assert sorted(d.id for d in scope.documents) == sorted([inside.id, loose.id])
    assert len(scope.documents) == 2


@pytest.mark.django_db
def test_selection_cross_kb_rejected(owner, kb):
    other_kb = KnowledgeBase.objects.create(owner=owner, name="Other", slug="other-kb")
    a = make_doc(kb, "a")
    b = make_doc(other_kb, "b")
    with pytest.raises(ValueError):
        collect_for_scope(
            owner=owner, scope="selection", target_id=0, doc_ids=[a.id, b.id]
        )


@pytest.mark.django_db
def test_selection_only_published_filters_drafts(owner, kb):
    make_doc(kb, "draft", raw="d", status="draft")
    pub = make_doc(kb, "pub", raw="r", published="p", status="published")
    scope = collect_for_scope(
        owner=owner,
        scope="selection",
        target_id=0,
        doc_ids=[pub.id],
        folder_ids=[],
        only_published=True,
    )
    assert [d.slug for d in scope.documents] == ["pub"]


@pytest.mark.django_db
def test_selection_empty_rejected(owner, kb):
    with pytest.raises(ValueError):
        collect_for_scope(
            owner=owner, scope="selection", target_id=0, folder_ids=[], doc_ids=[]
        )
