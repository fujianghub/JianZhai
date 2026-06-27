"""Phase E 回归：公开聚合接口缓存命中 + hero 保存即失效。"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from django.utils import timezone

from apps.accounts.models import HeroSettings
from apps.knowledge.models import Document, KnowledgeBase

pytestmark = pytest.mark.django_db
User = get_user_model()


@pytest.fixture(autouse=True)
def _open_blog(settings):
    """These cache tests exercise anonymous public endpoints; the product
    default now gates them, so open the blog for this module."""
    settings.SITE_REQUIRE_LOGIN = False


def _public_doc():
    owner = User.objects.create_user("pub", "pub@e.com", "x")
    kb = KnowledgeBase.objects.create(
        owner=owner, name="KB", slug="kb", visibility="public"
    )
    Document.objects.create(
        knowledge_base=kb, title="P", raw_content="x", published_content="y",
        status="published", visibility="public", published_at=timezone.now(),
    )


def test_archive_second_request_hits_cache():
    _public_doc()
    client = APIClient()
    # Warm + populate cache.
    assert client.get("/api/v1/public/archive/").status_code == 200
    # Second request must not touch the DB (served from cache).
    with CaptureQueriesContext(connection) as ctx:
        resp = client.get("/api/v1/public/archive/")
    assert resp.status_code == 200
    assert len(ctx.captured_queries) == 0


def test_tag_cloud_second_request_hits_cache():
    _public_doc()
    client = APIClient()
    assert client.get("/api/v1/public/tags/").status_code == 200
    with CaptureQueriesContext(connection) as ctx:
        client.get("/api/v1/public/tags/")
    assert len(ctx.captured_queries) == 0


def test_hero_public_cache_invalidated_on_save():
    client = APIClient()
    client.get("/api/v1/public/hero/")  # populate cache
    assert cache.get(HeroSettings.PUBLIC_CACHE_KEY) is not None
    # Editing hero settings drops the public cache.
    h = HeroSettings.load()
    h.enabled = not h.enabled
    h.save()
    assert cache.get(HeroSettings.PUBLIC_CACHE_KEY) is None
