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


@pytest.mark.django_db
def test_pdf_page_bookmarks_xor_and_idempotent(api_client=None):
    from django.contrib.auth import get_user_model
    from django.urls import reverse
    from rest_framework.test import APIClient

    from apps.knowledge.models import Document, KnowledgeBase
    from apps.reading.models import Bookmark

    User = get_user_model()
    author = User.objects.create_user("bmauthor", "bm@e.com", "pass", is_staff=True)
    reader = User.objects.create_user("bmreader", "bmr@e.com", "pass")
    kb = KnowledgeBase.objects.create(owner=author, name="BM", slug="bm-kb", visibility="public")
    doc = Document.objects.create(knowledge_base=kb, title="pdf", status="published", visibility="public")
    c = APIClient()
    c.force_authenticate(reader)
    url = reverse("api_v1:document-bookmarks", args=[doc.id])
    # Neither / both → 400
    assert c.post(url, {}, format="json").status_code == 400
    assert c.post(url, {"cfi": "epubcfi(/6/2)", "page": 3}, format="json").status_code == 400
    assert c.post(url, {"page": 0}, format="json").status_code == 400
    # Page bookmark: created then idempotent
    r = c.post(url, {"page": 3, "excerpt": "third"}, format="json")
    assert r.status_code == 201 and r.data["page"] == 3 and r.data["cfi"] == ""
    r2 = c.post(url, {"page": 3}, format="json")
    assert r2.status_code == 200 and r2.data["id"] == r.data["id"]
    # A CFI bookmark on the same doc coexists (different anchor kind)
    r3 = c.post(url, {"cfi": "epubcfi(/6/4)"}, format="json")
    assert r3.status_code == 201 and r3.data["page"] is None
    assert Bookmark.objects.filter(user=reader, document=doc).count() == 2
    assert [b["page"] for b in c.get(url).data] == [3, None]
    # Delete by id
    assert c.delete(reverse("api_v1:bookmark-detail", args=[r.data["id"]])).status_code == 204
    assert Bookmark.objects.filter(user=reader, document=doc).count() == 1


@pytest.mark.django_db
def test_pdf_quads_selector_validation():
    from django.contrib.auth import get_user_model
    from django.urls import reverse
    from rest_framework.test import APIClient

    from apps.knowledge.models import Document, KnowledgeBase

    User = get_user_model()
    author = User.objects.create_user("qauthor", "q@e.com", "pass", is_staff=True)
    reader = User.objects.create_user("qreader", "qr@e.com", "pass")
    kb = KnowledgeBase.objects.create(owner=author, name="Q", slug="q-kb", visibility="public")
    doc = Document.objects.create(knowledge_base=kb, title="pdf", status="published", visibility="public")
    c = APIClient()
    c.force_authenticate(reader)
    url = reverse("api_v1:document-highlights", args=[doc.id])
    good = {"selector": {"kind": "pdf", "page": 3, "quads": [[1, 2, 3, 2, 1, 1, 3, 1]]}, "text": "hi", "color": "yellow"}
    r = c.post(url, good, format="json")
    assert r.status_code == 201, r.content
    assert r.data["selector"] == {"kind": "pdf", "page": 3, "quads": [[1.0, 2.0, 3.0, 2.0, 1.0, 1.0, 3.0, 1.0]]}
    for bad in (
        {"kind": "pdf", "page": 0, "quads": [[1, 2, 3, 2, 1, 1, 3, 1]]},
        {"kind": "pdf", "page": 1, "quads": []},
        {"kind": "pdf", "page": 1, "quads": [[1, 2, 3]]},
        {"kind": "pdf", "page": 1, "quads": [["a"] * 8]},
    ):
        assert c.post(url, {"selector": bad, "text": "x"}, format="json").status_code == 400
    # Note-only PATCH keeps the pdf anchor.
    p = c.patch(reverse("api_v1:highlight-detail", args=[r.data["id"]]), {"note": "n"}, format="json")
    assert p.status_code == 200 and p.data["selector"]["kind"] == "pdf"


@pytest.mark.django_db
def test_reading_position_upsert_and_private():
    from django.contrib.auth import get_user_model
    from django.urls import reverse
    from rest_framework.test import APIClient

    from apps.knowledge.models import Document, KnowledgeBase

    User = get_user_model()
    author = User.objects.create_user("rpauthor", "rp@e.com", "pass", is_staff=True)
    a = User.objects.create_user("rpa", "a@e.com", "pass")
    b = User.objects.create_user("rpb", "b@e.com", "pass")
    kb = KnowledgeBase.objects.create(owner=author, name="RP", slug="rp-kb", visibility="public")
    doc = Document.objects.create(knowledge_base=kb, title="pdf", status="published", visibility="public")
    url = reverse("api_v1:document-position", args=[doc.id])
    c = APIClient()
    c.force_authenticate(a)
    assert c.get(url).data is None
    assert c.put(url, {}, format="json").status_code == 400
    r = c.put(url, {"page": 12, "offset": 0.4}, format="json")
    assert r.status_code == 200 and r.data["page"] == 12 and r.data["offset"] == 0.4
    r2 = c.put(url, {"page": 13, "offset": 0.0}, format="json")
    assert r2.data["page"] == 13
    assert c.get(url).data["page"] == 13
    from apps.reading.models import ReadingPosition

    assert ReadingPosition.objects.filter(document=doc).count() == 1
    c.force_authenticate(b)
    assert c.get(url).data is None  # private per user
    assert c.put(url, {"cfi": "epubcfi(/6/2)", "fraction": 0.25}, format="json").status_code == 200
    assert c.put(url, {"fraction": 1.5}, format="json").status_code == 400
    draft = Document.objects.create(knowledge_base=kb, title="draft")
    assert c.get(reverse("api_v1:document-position", args=[draft.id])).status_code == 404

