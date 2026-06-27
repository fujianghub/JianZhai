"""User tags (WeChat-contact style): author-managed labels on reader accounts.

Covers tag-vocabulary CRUD, assigning tags to users, filtering the user list
by tag, and the privacy guarantee that tags never leak to readers.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import UserTag

User = pytest.importorskip("django.contrib.auth").get_user_model()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def author():
    return User.objects.create_user("staff1", "staff1@e.com", "pass", is_staff=True)


@pytest.fixture
def reader():
    return User.objects.create_user("reader1", "reader1@e.com", "pass")


@pytest.mark.django_db
def test_staff_creates_tag(api, author):
    api.force_authenticate(user=author)
    resp = api.post(
        reverse("api_v1:user-tag-list"), {"name": "同学", "color": "#52c41a"}
    )
    assert resp.status_code == 201
    assert UserTag.objects.filter(name="同学").exists()


@pytest.mark.django_db
def test_reader_cannot_manage_tags(api, reader):
    api.force_authenticate(user=reader)
    resp = api.post(reverse("api_v1:user-tag-list"), {"name": "x"})
    assert resp.status_code == 403


@pytest.mark.django_db
def test_assign_tags_to_user_and_filter(api, author, reader):
    tag = UserTag.objects.create(name="同事")
    api.force_authenticate(user=author)
    # Assign via PATCH on the user.
    resp = api.patch(
        reverse("api_v1:user-detail", args=[reader.id]),
        {"tag_ids": [tag.id]},
        format="json",
    )
    assert resp.status_code == 200
    assert [t["id"] for t in resp.data["tags"]] == [tag.id]

    # Filter the user list by that tag.
    resp = api.get(reverse("api_v1:user-list"), {"tag": tag.id})
    ids = [u["id"] for u in resp.data["results"]]
    assert reader.id in ids

    # A different tag returns nobody.
    other = UserTag.objects.create(name="无人")
    resp = api.get(reverse("api_v1:user-list"), {"tag": other.id})
    assert reader.id not in [u["id"] for u in resp.data["results"]]


@pytest.mark.django_db
def test_create_user_with_tags(api, author):
    tag = UserTag.objects.create(name="友邻")
    api.force_authenticate(user=author)
    resp = api.post(
        reverse("api_v1:user-list"),
        {
            "username": "newbie",
            "password": "secretpass",
            "email": "newbie@e.com",
            "tag_ids": [tag.id],
        },
        format="json",
    )
    assert resp.status_code == 201
    u = User.objects.get(username="newbie")
    assert list(u.account_tags.values_list("id", flat=True)) == [tag.id]


@pytest.mark.django_db
def test_tags_never_leak_to_reader_self_view(api, reader):
    """The reader's own /auth/me/ payload must not carry their tags."""
    UserTag.objects.create(name="秘密").users.add(reader)
    api.force_authenticate(user=reader)
    resp = api.get(reverse("api_v1:auth-me"))
    assert resp.status_code == 200
    assert "tags" not in resp.data.get("user", {})
    # And readers can't reach the staff-only user list at all.
    assert api.get(reverse("api_v1:user-list")).status_code == 403
