"""link-preview 端点：权限矩阵（PublicOrLoginGated）+ 抓取服务单元。

放宽自 IsContentAuthor（语雀式链接卡片需要在博客阅读端水合外链元数据），
友邻闸门（SITE_REQUIRE_LOGIN）仍然挡匿名。
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.editor.services.link_preview import (
    LinkPreviewError,
    fetch_link_preview,
    fetch_link_preview_or_none,
)

User = get_user_model()

URL = "/api/v1/link-preview/"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def reader(db):
    return User.objects.create_user("reader", "reader@example.com", "pass")


@pytest.fixture
def author(db):
    return User.objects.create_user(
        "author", "author@example.com", "pass", is_staff=True
    )


def _mock_html_resp(html: bytes = b"<title>Hello</title>"):
    resp = MagicMock()
    resp.read.return_value = html
    resp.headers.get.return_value = "text/html; charset=utf-8"
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    return resp


# ── 权限矩阵 ──────────────────────────────────────────────────────────


@override_settings(SITE_REQUIRE_LOGIN=True)
@pytest.mark.django_db
def test_anonymous_blocked_when_gated():
    res = APIClient().get(URL, {"url": "https://example.com"})
    assert res.status_code in (401, 403)


@override_settings(SITE_REQUIRE_LOGIN=False)
@pytest.mark.django_db
def test_anonymous_allowed_when_open():
    # 走 400 校验路径（缺 url），不发真实网络请求即可证明权限已放行
    res = APIClient().get(URL)
    assert res.status_code == 400


@override_settings(SITE_REQUIRE_LOGIN=True)
@pytest.mark.django_db
def test_logged_in_reader_allowed(reader):
    client = APIClient()
    client.force_authenticate(reader)
    res = client.get(URL)
    assert res.status_code == 400  # 过了权限，栽在缺 url 校验

    with patch("apps.editor.services.link_preview.urlopen") as mock_urlopen, patch(
        "apps.editor.services.link_preview._is_safe_host", return_value=True
    ):
        mock_urlopen.return_value = _mock_html_resp(
            b"<meta property='og:title' content='Example'><title>t</title>"
        )
        res = client.get(URL, {"url": "https://example.com"})
    assert res.status_code == 200
    assert res.data["title"] == "Example"


@override_settings(SITE_REQUIRE_LOGIN=True)
@pytest.mark.django_db
def test_author_still_allowed(author):
    client = APIClient()
    client.force_authenticate(author)
    res = client.get(URL)
    assert res.status_code == 400


# ── fetch_link_preview 服务单元 ──────────────────────────────────────


def test_fetch_rejects_bad_scheme_and_empty():
    with pytest.raises(LinkPreviewError):
        fetch_link_preview("")
    with pytest.raises(LinkPreviewError):
        fetch_link_preview("ftp://example.com")
    with pytest.raises(LinkPreviewError):
        fetch_link_preview("https://" + "a" * 2000)


def test_fetch_rejects_unsafe_host():
    with patch(
        "apps.editor.services.link_preview._is_safe_host", return_value=False
    ):
        with pytest.raises(LinkPreviewError) as exc:
            fetch_link_preview("https://192.168.1.1/x")
    assert exc.value.status == 400


def test_fetch_parses_og_and_caches():
    html = (
        b"<meta property='og:title' content='My Page'>"
        b"<meta property='og:description' content='Desc'>"
        b"<link rel='icon' href='/fav.ico'><title>fallback</title>"
    )
    with patch("apps.editor.services.link_preview.urlopen") as mock_urlopen, patch(
        "apps.editor.services.link_preview._is_safe_host", return_value=True
    ):
        mock_urlopen.return_value = _mock_html_resp(html)
        data = fetch_link_preview("https://example.com/page")
        # 第二次命中缓存，不再外呼
        data2 = fetch_link_preview("https://example.com/page")
    assert data["title"] == "My Page"
    assert data["description"] == "Desc"
    assert data["favicon"] == "https://example.com/fav.ico"
    assert data2 == data
    assert mock_urlopen.call_count == 1


def test_fetch_or_none_swallows_everything():
    with patch(
        "apps.editor.services.link_preview._is_safe_host", return_value=False
    ):
        assert fetch_link_preview_or_none("https://10.0.0.1/") is None
    assert fetch_link_preview_or_none("not-a-url") is None
