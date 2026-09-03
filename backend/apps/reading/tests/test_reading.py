"""EPUB highlights / bookmarks: reader access follows blog visibility, rows
are private to their owner, and foreign rows 404 (never leak)."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase
from apps.reading.models import Bookmark, Highlight

pytestmark = pytest.mark.django_db
User = get_user_model()

CFI = "epubcfi(/6/14!/4/2/10,/1:0,/1:12)"


def _author(name="author"):
    return User.objects.create_user(name, f"{name}@e.com", "pass", is_staff=True)


def _reader(name="reader"):
    return User.objects.create_user(name, f"{name}@e.com", "pass")


def _kb(owner, slug="kb", visibility="public"):
    return KnowledgeBase.objects.create(owner=owner, name="KB", slug=slug, visibility=visibility)


def _doc(kb, *, status="published", visibility="public", title="Book"):
    return Document.objects.create(
        knowledge_base=kb,
        title=title,
        raw_content="x",
        published_content="x",
        status=status,
        visibility=visibility,
    )


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _hl_url(doc):
    return f"/api/v1/documents/{doc.id}/highlights/"


def _bm_url(doc):
    return f"/api/v1/documents/{doc.id}/bookmarks/"


# ── access ────────────────────────────────────────────────────────────────


def test_anonymous_is_rejected():
    doc = _doc(_kb(_author()))
    assert _client().get(_hl_url(doc)).status_code in (401, 403)
    assert _client().post(_hl_url(doc), {"cfi": CFI}).status_code in (401, 403)


def test_reader_can_annotate_public_published_doc():
    doc = _doc(_kb(_author()))
    c = _client(_reader())
    r = c.post(_hl_url(doc), {"cfi": CFI, "text": "quoted", "chapter": "第1章", "color": "green"})
    assert r.status_code == 201, r.data
    assert r.data["color"] == "green" and r.data["style"] == "highlight"
    assert c.get(_hl_url(doc)).data[0]["id"] == r.data["id"]


@pytest.mark.parametrize("kw", [{"status": "draft"}, {"visibility": "private"}])
def test_reader_404_on_unpublished_or_private_doc(kw):
    doc = _doc(_kb(_author()), **kw)
    c = _client(_reader())
    assert c.get(_hl_url(doc)).status_code == 404
    assert c.post(_hl_url(doc), {"cfi": CFI}).status_code == 404


def test_reader_404_on_private_kb():
    doc = _doc(_kb(_author(), visibility="private"))
    assert _client(_reader()).get(_hl_url(doc)).status_code == 404


def test_reader_404_when_outside_kb_audience():
    kb = _kb(_author())
    doc = _doc(kb)
    insider, outsider = _reader("in"), _reader("out")
    kb.audience_mode = "include"
    kb.save(update_fields=["audience_mode"])
    kb.audience_users.add(insider)
    assert _client(insider).get(_hl_url(doc)).status_code == 200
    assert _client(outsider).get(_hl_url(doc)).status_code == 404


def test_soft_deleted_doc_is_closed():
    doc = _doc(_kb(_author()))
    doc.is_deleted = True
    doc.save(update_fields=["is_deleted"])
    assert _client(_reader()).get(_hl_url(doc)).status_code == 404


def test_author_can_annotate_own_draft():
    author = _author()
    doc = _doc(_kb(author), status="draft", visibility="private")
    r = _client(author).post(_hl_url(doc), {"cfi": CFI})
    assert r.status_code == 201


# ── privacy ───────────────────────────────────────────────────────────────


def test_rows_are_private_even_from_staff():
    author = _author()
    doc = _doc(_kb(author))
    a, b = _reader("a"), _reader("b")
    Highlight.objects.create(user=a, document=doc, cfi=CFI, text="a's")
    assert len(_client(a).get(_hl_url(doc)).data) == 1
    assert _client(b).get(_hl_url(doc)).data == []
    assert _client(author).get(_hl_url(doc)).data == []


def test_update_and_delete_only_own_rows():
    doc = _doc(_kb(_author()))
    a, b = _reader("a"), _reader("b")
    hl = Highlight.objects.create(user=a, document=doc, cfi=CFI)
    url = f"/api/v1/highlights/{hl.id}/"
    # foreign row → 404 (not 403: ids must not leak)
    assert _client(b).patch(url, {"note": "x"}).status_code == 404
    assert _client(b).delete(url).status_code == 404
    assert _client(_author("staff2")).delete(url).status_code == 404
    r = _client(a).patch(url, {"note": "my note", "color": "pink", "style": "squiggly"})
    assert r.status_code == 200
    hl.refresh_from_db()
    assert (hl.note, hl.color, hl.style) == ("my note", "pink", "squiggly")
    assert _client(a).delete(url).status_code == 204
    assert not Highlight.objects.filter(pk=hl.id).exists()


# ── validation ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "payload",
    [
        {"cfi": "not-a-cfi"},
        {"cfi": ""},
        {"cfi": CFI, "color": "chartreuse"},
        {"cfi": CFI, "style": "dotted"},
        {"cfi": CFI, "text": "x" * 2001},
    ],
)
def test_highlight_validation(payload):
    doc = _doc(_kb(_author()))
    assert _client(_reader()).post(_hl_url(doc), payload).status_code == 400


def test_patch_cannot_move_highlight_to_another_document():
    author = _author()
    doc1, doc2 = _doc(_kb(author, slug="k1")), _doc(_kb(author, slug="k2"))
    a = _reader()
    hl = Highlight.objects.create(user=a, document=doc1, cfi=CFI)
    r = _client(a).patch(f"/api/v1/highlights/{hl.id}/", {"document": doc2.id})
    assert r.status_code == 200
    hl.refresh_from_db()
    assert hl.document_id == doc1.id


# ── bookmarks ─────────────────────────────────────────────────────────────


def test_bookmark_create_is_idempotent_and_private():
    doc = _doc(_kb(_author()))
    a, b = _reader("a"), _reader("b")
    r1 = _client(a).post(_bm_url(doc), {"cfi": CFI, "chapter": "第1章", "excerpt": "page top"})
    assert r1.status_code == 201
    r2 = _client(a).post(_bm_url(doc), {"cfi": CFI})
    assert r2.status_code == 200 and r2.data["id"] == r1.data["id"]
    assert Bookmark.objects.filter(user=a, document=doc).count() == 1
    assert _client(b).get(_bm_url(doc)).data == []
    assert _client(b).delete(f"/api/v1/bookmarks/{r1.data['id']}/").status_code == 404
    assert _client(a).delete(f"/api/v1/bookmarks/{r1.data['id']}/").status_code == 204


def test_bookmark_reader_404_on_draft():
    doc = _doc(_kb(_author()), status="draft")
    assert _client(_reader()).post(_bm_url(doc), {"cfi": CFI}).status_code == 404


# ── markdown (selector) anchors ───────────────────────────────────────────

SELECTOR = {"quote": "面向广大的网络工程师", "prefix": "本书", "suffix": "及对", "heading": "intro"}


def test_selector_highlight_roundtrip():
    doc = _doc(_kb(_author()))
    c = _client(_reader())
    r = c.post(_hl_url(doc), {"selector": SELECTOR, "text": "面向广大的网络工程师", "chapter": "简介"}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["selector"] == SELECTOR and r.data["cfi"] == ""
    # note-only PATCH keeps the anchor (partial update must not demand it)
    r2 = c.patch(f"/api/v1/highlights/{r.data['id']}/", {"note": "n"}, format="json")
    assert r2.status_code == 200 and r2.data["selector"] == SELECTOR


@pytest.mark.parametrize(
    "payload",
    [
        {},  # neither anchor
        {"cfi": CFI, "selector": SELECTOR},  # both anchors
        {"selector": {"prefix": "x"}},  # quote missing
        {"selector": {"quote": ""}},
        {"selector": {"quote": "x" * 2001}},
        {"selector": "not-a-dict"},
    ],
)
def test_selector_validation(payload):
    doc = _doc(_kb(_author()))
    assert _client(_reader()).post(_hl_url(doc), payload, format="json").status_code == 400


def test_selector_context_is_capped():
    doc = _doc(_kb(_author()))
    r = _client(_reader()).post(
        _hl_url(doc), {"selector": {"quote": "q", "prefix": "p" * 900, "extra": "dropped"}}, format="json"
    )
    assert r.status_code == 201
    assert len(r.data["selector"]["prefix"]) == 500
    assert "extra" not in r.data["selector"]
