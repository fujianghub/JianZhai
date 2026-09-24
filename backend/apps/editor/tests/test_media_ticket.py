"""Media ticket (``jz_media`` cookie): issue / resolve / middleware / gate.

Opaque-origin sandbox frames send only ``SameSite=None`` cookies, so the Lax
session never reaches ``forward_auth``; the ticket is the read-only credential
that does. See ``apps/editor/media_ticket.py``.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.test import RequestFactory
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor import media_ticket
from apps.editor.media_auth import resolve_media_user
from apps.editor.models import Attachment
from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def author():
    return User.objects.create_user("mtauthor", "a@e.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    return User.objects.create_user("mtreader", "r@e.com", "pass")


@pytest.fixture
def outsider():
    return User.objects.create_user("mtout", "o@e.com", "pass")


@pytest.fixture
def upload(author, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    kb = KnowledgeBase.objects.create(owner=author, name="MT", slug="mt-kb", visibility="public")
    doc = Document.objects.create(knowledge_base=kb, title="Page", status="published", visibility="public")
    att = Attachment.objects.create(
        document=doc, uploaded_by=author, file=ContentFile(b"png", name="pic.png"),
        original_filename="pic.png", kind=Attachment.KIND_IMAGE, mime_type="image/png", size=3,
    )
    return {"kb": kb, "doc": doc, "path": att.file.name}


# ── ticket value ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_issue_resolve_round_trip(reader):
    assert media_ticket.resolve(media_ticket.issue(reader)) == reader
    assert media_ticket.is_fresh(media_ticket.issue(reader))


@pytest.mark.django_db
def test_garbage_and_tampered_tickets_resolve_to_none(reader):
    assert media_ticket.resolve(None) is None
    assert media_ticket.resolve("") is None
    assert media_ticket.resolve("not-a-ticket") is None
    good = media_ticket.issue(reader)
    assert media_ticket.resolve(good[:-2] + "zz") is None
    # a differently-salted signature over the same payload is rejected
    forged = signing.TimestampSigner(salt="other").sign(f"{reader.pk}:abc")
    assert media_ticket.resolve(forged) is None


@pytest.mark.django_db
def test_expired_ticket_is_rejected_and_not_fresh(reader, monkeypatch):
    value = media_ticket.issue(reader)
    real_unsign = signing.TimestampSigner.unsign

    def old_unsign(self, v, max_age=None):
        # pretend the ticket is 3 h old: beyond both thresholds
        if max_age is not None and max_age < 3 * 3600:
            raise signing.SignatureExpired("old")
        return real_unsign(self, v)

    monkeypatch.setattr(signing.TimestampSigner, "unsign", old_unsign)
    assert media_ticket.resolve(value) is None
    assert media_ticket.is_fresh(value) is False


@pytest.mark.django_db
def test_password_change_and_deactivation_invalidate(reader):
    value = media_ticket.issue(reader)
    reader.set_password("new-pass")
    reader.save()
    assert media_ticket.resolve(value) is None
    fresh = media_ticket.issue(reader)
    assert media_ticket.resolve(fresh) == reader
    reader.is_active = False
    reader.save(update_fields=["is_active"])
    assert media_ticket.resolve(fresh) is None


def test_cookie_attributes():
    from django.http import HttpResponse

    class U:
        pk = 7

        @staticmethod
        def get_session_auth_hash():
            return "abcdef0123456789abcdef"

    resp = HttpResponse()
    media_ticket.set_cookie(resp, U())
    c = resp.cookies[media_ticket.COOKIE_NAME]
    assert c["path"] == "/media"
    assert c["samesite"] == "None"
    assert c["secure"] is True
    assert c["httponly"] is True
    assert int(c["max-age"]) == media_ticket.TICKET_MAX_AGE_S
    gone = HttpResponse()
    media_ticket.delete_cookie(gone)
    assert gone.cookies[media_ticket.COOKIE_NAME]["max-age"] == 0
    assert gone.cookies[media_ticket.COOKIE_NAME]["path"] == "/media"


# ── middleware ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_middleware_issues_ticket_on_authenticated_responses(reader):
    client = APIClient()
    client.login(username="mtreader", password="pass")
    resp = client.get(reverse("api_v1:auth-me"))
    assert resp.status_code == 200
    ticket = resp.cookies.get(media_ticket.COOKIE_NAME)
    assert ticket is not None and media_ticket.resolve(ticket.value) == reader
    assert ticket["path"] == "/media" and ticket["samesite"] == "None"
    # fresh ticket → not re-issued on the next call
    client.cookies[media_ticket.COOKIE_NAME] = ticket.value
    resp2 = client.get(reverse("api_v1:auth-me"))
    assert media_ticket.COOKIE_NAME not in resp2.cookies


@pytest.mark.django_db
def test_middleware_skips_anonymous_and_forward_auth(reader, upload, settings):
    settings.SITE_REQUIRE_LOGIN = False
    anon = APIClient()
    resp = anon.get("/api/v1/public/toc-settings/")
    assert media_ticket.COOKIE_NAME not in resp.cookies
    # forward_auth sub-request: session user resolved, but no Set-Cookie
    client = APIClient()
    client.login(username="mtreader", password="pass")
    resp = client.get(reverse("api_v1:media-auth"), HTTP_X_FORWARDED_URI="/media/" + upload["path"])
    assert resp.status_code == 200
    assert media_ticket.COOKIE_NAME not in resp.cookies


@pytest.mark.django_db
def test_logout_deletes_ticket(reader):
    client = APIClient()
    client.login(username="mtreader", password="pass")
    client.get(reverse("api_v1:auth-me"))
    resp = client.post(reverse("api_v1:auth-logout"))
    assert resp.status_code == 200
    assert resp.cookies[media_ticket.COOKIE_NAME]["max-age"] == 0


# ── the gate honours the ticket, and only the ticket's user ─────────────


@pytest.mark.django_db
def test_forward_auth_accepts_ticket_without_session(reader, outsider, upload, settings):
    settings.SITE_REQUIRE_LOGIN = True
    kb = upload["kb"]
    kb.audience_mode = "exclude"
    kb.save(update_fields=["audience_mode"])
    kb.audience_users.add(outsider)
    url = reverse("api_v1:media-auth")
    hdr = {"HTTP_X_FORWARDED_URI": "/media/" + upload["path"]}
    client = APIClient()  # no session at all — like an opaque-origin frame
    assert client.get(url, **hdr).status_code == 401
    client.cookies[media_ticket.COOKIE_NAME] = media_ticket.issue(reader)
    assert client.get(url, **hdr).status_code == 200
    cache.clear()
    client.cookies[media_ticket.COOKIE_NAME] = media_ticket.issue(outsider)
    assert client.get(url, **hdr).status_code == 403  # audience still applies
    cache.clear()
    client.cookies[media_ticket.COOKIE_NAME] = "tampered"
    assert client.get(url, **hdr).status_code == 401


@pytest.mark.django_db
def test_dev_media_server_accepts_ticket(reader, upload, settings):
    from django.contrib.auth.models import AnonymousUser

    from apps.editor.media_views import serve_media

    settings.SITE_REQUIRE_LOGIN = True
    rf = RequestFactory()
    req = rf.get("/media/" + upload["path"])
    req.user = AnonymousUser()
    assert serve_media(req, path=upload["path"]).status_code == 401
    req = rf.get("/media/" + upload["path"])
    req.user = AnonymousUser()
    req.COOKIES[media_ticket.COOKIE_NAME] = media_ticket.issue(reader)
    assert serve_media(req, path=upload["path"]).status_code == 200


@pytest.mark.django_db
def test_resolve_media_user_prefers_session_user(reader, outsider):
    rf = RequestFactory()
    req = rf.get("/media/x")
    req.user = reader
    req.COOKIES[media_ticket.COOKIE_NAME] = media_ticket.issue(outsider)
    assert resolve_media_user(req) == reader
    req.user = type("Anon", (), {"is_authenticated": False})()
    assert resolve_media_user(req) == outsider
