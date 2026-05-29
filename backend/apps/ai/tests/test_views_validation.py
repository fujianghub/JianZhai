"""AI endpoint input-size validation.

The frontend caps content at 30k characters, but the backend is the
authoritative gate — direct API calls (curl, scripts) MUST be rejected before
they reach the LLM provider so a misbehaving client can't burn the token
quota with multi-megabyte payloads.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user("aiuser", "ai@example.com", "pass")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_run_rejects_oversize_content(client):
    big = "x" * 30_001
    resp = client.post(
        "/api/v1/ai/run/", {"operation": "polish", "content": big}, format="json"
    )
    assert resp.status_code == 400
    assert "30000" in resp.json()["detail"] or "30000" in str(resp.content)


@pytest.mark.django_db
def test_run_rejects_empty_content(client):
    resp = client.post(
        "/api/v1/ai/run/", {"operation": "polish", "content": ""}, format="json"
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_run_rejects_unknown_operation(client):
    resp = client.post(
        "/api/v1/ai/run/",
        {"operation": "transmogrify", "content": "x"},
        format="json",
    )
    assert resp.status_code == 400
    payload = resp.json()
    assert "supported" in payload


@pytest.mark.django_db
def test_run_requires_auth():
    resp = APIClient().post(
        "/api/v1/ai/run/", {"operation": "polish", "content": "x"}, format="json"
    )
    # DRF returns 401 for IsAuthenticated; the throttle may also kick in,
    # but neither should be 200.
    assert resp.status_code in (401, 403)
