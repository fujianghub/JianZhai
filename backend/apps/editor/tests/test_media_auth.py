"""Media byte-layer access: staff / reader / audience / ReadGrant / anonymous
× require_login, for uploads, slides, derived files and avatars — through the
decision function, the forward_auth view and the dev media server."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor.media_auth import media_access_status
from apps.editor.models import Attachment, DerivedFile, SlideImage
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()
PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def author():
    return User.objects.create_user("maauthor", "a@e.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    return User.objects.create_user("mareader", "r@e.com", "pass")


@pytest.fixture
def outsider():
    return User.objects.create_user("maout", "o@e.com", "pass")


@pytest.fixture
def kb(author):
    return KnowledgeBase.objects.create(owner=author, name="MA", slug="ma-kb", visibility="public")


@pytest.fixture
def files(kb, author, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published", visibility="public")
    att = Attachment.objects.create(
        document=doc, uploaded_by=author, file=ContentFile(b"PK", name="deck.pptx"),
        original_filename="deck.pptx", kind=Attachment.KIND_DOCUMENT, mime_type=PPTX_CT, size=2,
    )
    slide = SlideImage.objects.create(
        document=doc, source=att, index=0, width=1, height=1,
        image=ContentFile(b"i", name="s.jpg"), thumbnail=ContentFile(b"t", name="t.jpg"),
    )
    deck = DerivedFile.objects.create(document=doc, source=att, kind="deck_pdf", file=ContentFile(b"p", name="d.pdf"))
    loose = Attachment.objects.create(
        uploaded_by=author, file=ContentFile(b"l", name="loose.png"), original_filename="loose.png",
        kind=Attachment.KIND_IMAGE, mime_type="image/png", size=1,
    )
    return {
        "doc": doc, "upload": att.file.name, "slide": slide.image.name, "thumb": slide.thumbnail.name,
        "derived": deck.file.name, "loose": loose.file.name,
    }


@pytest.mark.django_db
def test_matrix_require_login(author, reader, files, settings):
    settings.SITE_REQUIRE_LOGIN = True
    from django.contrib.auth.models import AnonymousUser

    anon = AnonymousUser()
    for key in ("upload", "slide", "thumb", "derived"):
        assert media_access_status(author, files[key]) == 200
        assert media_access_status(reader, files[key]) == 200
        assert media_access_status(anon, files[key]) == 401
    assert media_access_status(reader, files["loose"]) == 200  # document-less → any login
    assert media_access_status(anon, files["loose"]) == 401
    assert media_access_status(anon, "avatars/user_1.webp") == 200
    assert media_access_status(reader, "uploads/2020/01/nope.pdf") == 404
    assert media_access_status(reader, "../etc/passwd") == 404
    assert media_access_status(reader, "exports/x.pdf") == 404


@pytest.mark.django_db
def test_matrix_open_site(reader, files, settings):
    settings.SITE_REQUIRE_LOGIN = False
    from django.contrib.auth.models import AnonymousUser

    anon = AnonymousUser()
    assert media_access_status(anon, files["upload"]) == 200
    assert media_access_status(anon, files["slide"]) == 200
    assert media_access_status(anon, files["loose"]) == 403  # never a document → login only
    assert media_access_status(reader, files["loose"]) == 200


@pytest.mark.django_db
def test_audience_exclude_and_include_reach_the_file_layer(author, reader, outsider, kb, files):
    kb.audience_mode = "exclude"
    kb.save(update_fields=["audience_mode"])
    kb.audience_users.add(outsider)
    assert media_access_status(outsider, files["upload"]) == 403
    assert media_access_status(outsider, files["slide"]) == 403
    assert media_access_status(reader, files["upload"]) == 200
    assert media_access_status(author, files["upload"]) == 200
    cache.clear()
    kb.audience_mode = "include"
    kb.save(update_fields=["audience_mode"])
    kb.audience_users.set([reader])
    assert media_access_status(reader, files["derived"]) == 200
    assert media_access_status(outsider, files["derived"]) == 403


@pytest.mark.django_db
def test_read_grant_whitelist_and_unpublished(author, reader, outsider, kb, files):
    from apps.accounts.models import ReadGrant

    other_kb = KnowledgeBase.objects.create(owner=author, name="Other", slug="ma-other", visibility="public")
    ReadGrant.objects.create(user=outsider, knowledge_base=other_kb)  # whitelist → only other_kb
    assert media_access_status(outsider, files["upload"]) == 403
    assert media_access_status(reader, files["upload"]) == 200
    files["doc"].status = "draft"
    files["doc"].save(update_fields=["status"])
    cache.clear()
    assert media_access_status(reader, files["upload"]) == 403
    assert media_access_status(author, files["upload"]) == 200
    files["doc"].soft_delete()
    cache.clear()
    assert media_access_status(reader, files["upload"]) == 403
    assert media_access_status(author, files["upload"]) == 200  # staff sees trash


@pytest.mark.django_db
def test_decisions_are_cached_per_user(reader, files, kb):
    assert media_access_status(reader, files["upload"]) == 200
    kb.visibility = "private"
    kb.save(update_fields=["visibility"])
    assert media_access_status(reader, files["upload"]) == 200  # still cached
    cache.clear()
    assert media_access_status(reader, files["upload"]) == 403


@pytest.mark.django_db
def test_forward_auth_view(author, reader, files, settings):
    settings.SITE_REQUIRE_LOGIN = True
    client = APIClient()
    url = reverse("api_v1:media-auth")
    hdr = {"HTTP_X_FORWARDED_URI": "/media/" + files["upload"]}
    assert client.get(url, **hdr).status_code == 401
    client.force_authenticate(reader)
    assert client.get(url, **hdr).status_code == 200
    assert client.get(url, HTTP_X_FORWARDED_URI="/media/uploads/nope.pdf").status_code == 404
    assert client.get(url).status_code == 404  # no forwarded uri
    client.force_authenticate(author)
    assert client.get(url, HTTP_X_FORWARDED_URI="/media/" + files["derived"] + "?x=1").status_code == 200


@pytest.mark.django_db
def test_dev_media_server_enforces_decision(reader, outsider, kb, files, settings):
    # The /media route is only mounted when DEBUG at import time; exercise the
    # view directly (its URL wiring is a one-liner in jianzhai/urls.py).
    from django.contrib.auth.models import AnonymousUser
    from django.test import RequestFactory

    from apps.editor.media_views import serve_media

    settings.SITE_REQUIRE_LOGIN = True
    kb.audience_mode = "exclude"
    kb.save(update_fields=["audience_mode"])
    kb.audience_users.add(outsider)
    rf = RequestFactory()

    def hit(user, **headers):
        req = rf.get("/media/" + files["upload"], **headers)
        req.user = user
        return serve_media(req, path=files["upload"])

    assert hit(AnonymousUser()).status_code == 401
    assert hit(outsider).status_code == 403
    resp = hit(reader, HTTP_RANGE="bytes=0-0")
    assert resp.status_code == 206 and resp["Content-Range"].startswith("bytes 0-0/")
    assert hit(reader).status_code == 200
