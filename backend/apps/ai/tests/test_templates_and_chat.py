"""Tests for v0.9.7 additions: prompt templates CRUD + multi-turn
conversations + vision payload validation + budget enforcement + CSV
export. These were all bundled into one PR so they're tested together
here — splitting into multiple files would just add noise.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.ai.models import AIConversation, AIPromptTemplate, AISettings, AIUsageLog

User = get_user_model()


@pytest.fixture
def alice(db):
    # AI usage (templates / conversations / run / estimate / usage) is an
    # author-only surface under v1.0 RBAC → is_staff. Per-user owner isolation
    # of templates/conversations is still exercised between two authors.
    return User.objects.create_user(username="alice", password="x", is_staff=True)


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob", password="x", is_staff=True)


@pytest.fixture
def staff(db):
    return User.objects.create_user(username="staff1", password="x", is_staff=True)


@pytest.fixture
def alice_client(alice):
    c = APIClient()
    c.force_authenticate(alice)
    return c


@pytest.fixture
def staff_client(staff):
    c = APIClient()
    c.force_authenticate(staff)
    return c


# ── Prompt templates CRUD ──────────────────────────────────────────────


def test_template_create_and_list(alice_client, alice):
    r = alice_client.post(
        "/api/v1/ai/templates/",
        {"name": "改成论文风", "instruction": "把以下内容改成严肃的学术论文风格。"},
        format="json",
    )
    assert r.status_code == 201
    assert r.json()["name"] == "改成论文风"

    r = alice_client.get("/api/v1/ai/templates/")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_template_owner_isolation(alice_client, bob):
    """Alice's templates must not show up for Bob."""
    alice_client.post("/api/v1/ai/templates/", {"name": "Alice", "instruction": "x"}, format="json")
    bob_c = APIClient()
    bob_c.force_authenticate(bob)
    r = bob_c.get("/api/v1/ai/templates/")
    assert r.status_code == 200
    assert r.json() == []


def test_template_validation_rejects_empty(alice_client):
    r = alice_client.post("/api/v1/ai/templates/", {"name": "", "instruction": ""}, format="json")
    assert r.status_code == 400


def test_template_validation_rejects_too_long(alice_client):
    r = alice_client.post(
        "/api/v1/ai/templates/",
        {"name": "x" * 100, "instruction": "ok"},
        format="json",
    )
    assert r.status_code == 400


def test_template_patch(alice_client, alice):
    r = alice_client.post("/api/v1/ai/templates/", {"name": "A", "instruction": "i"}, format="json")
    tid = r.json()["id"]
    r = alice_client.patch(f"/api/v1/ai/templates/{tid}/", {"name": "B"}, format="json")
    assert r.status_code == 200
    assert r.json()["name"] == "B"


def test_template_delete(alice_client, alice):
    r = alice_client.post("/api/v1/ai/templates/", {"name": "A", "instruction": "i"}, format="json")
    tid = r.json()["id"]
    r = alice_client.delete(f"/api/v1/ai/templates/{tid}/")
    assert r.status_code == 204
    assert AIPromptTemplate.objects.count() == 0


def test_capabilities_includes_templates(alice_client, alice):
    alice_client.post(
        "/api/v1/ai/templates/", {"name": "test-tpl", "instruction": "x"}, format="json"
    )
    r = alice_client.get("/api/v1/ai/capabilities/")
    assert r.status_code == 200
    body = r.json()
    assert "templates" in body
    assert any(t["name"] == "test-tpl" for t in body["templates"])
    assert "thinking_enabled" in body
    assert "fallback_chain" in body


# ── Conversations CRUD ─────────────────────────────────────────────────


def test_conversation_list_empty(alice_client):
    r = alice_client.get("/api/v1/ai/conversations/")
    assert r.status_code == 200
    assert r.json() == []


def test_conversation_owner_isolation(alice_client, alice, bob):
    AIConversation.objects.create(user=alice, title="alice's", messages=[])
    AIConversation.objects.create(user=bob, title="bob's", messages=[])
    r = alice_client.get("/api/v1/ai/conversations/")
    assert r.status_code == 200
    titles = [c["title"] for c in r.json()]
    assert "alice's" in titles
    assert "bob's" not in titles


def test_conversation_detail_returns_messages(alice_client, alice):
    c = AIConversation.objects.create(
        user=alice,
        title="t",
        messages=[{"role": "user", "content": "hi", "ts": "2026-05-31T00:00:00Z"}],
    )
    r = alice_client.get(f"/api/v1/ai/conversations/{c.id}/")
    assert r.status_code == 200
    body = r.json()
    assert body["message_count"] == 1
    assert body["messages"][0]["content"] == "hi"


def test_conversation_delete_one(alice_client, alice):
    c = AIConversation.objects.create(user=alice, messages=[])
    r = alice_client.delete(f"/api/v1/ai/conversations/{c.id}/")
    assert r.status_code == 204


def test_conversation_clear_all(alice_client, alice):
    AIConversation.objects.create(user=alice, messages=[])
    AIConversation.objects.create(user=alice, messages=[])
    r = alice_client.delete("/api/v1/ai/conversations/")
    assert r.status_code == 204
    assert AIConversation.objects.filter(user=alice).count() == 0


# ── Vision payload validation ─────────────────────────────────────────


def test_run_rejects_too_many_images(alice_client):
    """images cap at 8 entries."""
    images = ["data:image/png;base64,abc"] * 9
    r = alice_client.post(
        "/api/v1/ai/run/",
        {"operation": "polish", "content": "x", "images": images},
        format="json",
    )
    assert r.status_code == 400


def test_run_rejects_non_data_image(alice_client):
    r = alice_client.post(
        "/api/v1/ai/run/",
        {"operation": "polish", "content": "x", "images": ["http://example.com/x.png"]},
        format="json",
    )
    assert r.status_code == 400


def test_run_accepts_valid_data_image_shape(alice_client, monkeypatch):
    """Payload validation passes for a well-formed image. We mock the
    actual AI call so we don't hit Anthropic."""
    from apps.ai import services

    def fake_run_once(*args, **kwargs):
        return "ok"

    monkeypatch.setattr(services, "run_once", fake_run_once)
    # Patch the view's import too.
    from apps.ai import views
    monkeypatch.setattr(views, "run_once", fake_run_once)
    r = alice_client.post(
        "/api/v1/ai/run/",
        {"operation": "polish", "content": "x", "images": ["data:image/png;base64,iVBORw0KGgo="]},
        format="json",
    )
    assert r.status_code == 200
    assert r.json()["result"] == "ok"


# ── Token preview ──────────────────────────────────────────────────────


def test_estimate_endpoint(alice_client):
    r = alice_client.post(
        "/api/v1/ai/estimate/",
        {"content": "这是一段中文测试文本，大概有几十个字符。", "model": "claude-opus-4-7"},
        format="json",
    )
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "claude-opus-4-7"
    assert body["estimated_input_tokens"] > 0
    assert body["estimated_cost_usd"] > 0


# ── Budget enforcement ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_budget_enforced_for_non_staff_and_maps_to_429(alice_client, monkeypatch):
    """Budget enforcement mechanism + its 429 mapping.

    v1.0 RBAC tension: the AI endpoints are author-only (is_staff) and
    ``check_daily_budget`` deliberately *bypasses* staff (see
    ``test_budget_does_not_block_staff``). That means the budget cap can no
    longer be reached for a normal user through the HTTP endpoint — the only
    accounts that may call /run/ are exactly the ones the cap exempts. (Flagged
    in the migration report as a real model gap, not a stale test.)

    So we verify the two halves separately, both still real:
      1. the budget mechanism still raises for a non-staff (reader) account;
      2. the /run/ view maps ``AIBudgetExceeded`` to HTTP 429.
    """
    s = AISettings.load()
    s.daily_budget_usd_per_user = 0.001  # 0.1 cent — easy to exceed
    s.save()

    # (1) Mechanism: a non-staff reader over budget triggers the exception.
    reader = User.objects.create_user(username="budget_reader", password="x")
    AIUsageLog.objects.create(
        user=reader, operation="polish", model="claude-opus-4-7",
        input_tokens=10000, output_tokens=2000, succeeded=True,
    )
    from apps.ai.services import AIBudgetExceeded, check_daily_budget

    with pytest.raises(AIBudgetExceeded):
        check_daily_budget(reader)

    # (2) Mapping: when run_once raises AIBudgetExceeded, /run/ returns 429.
    from apps.ai import views

    def boom(*args, **kwargs):
        raise AIBudgetExceeded("over budget")

    monkeypatch.setattr(views, "run_once", boom)
    r = alice_client.post(
        "/api/v1/ai/run/",
        {"operation": "polish", "content": "anything"},
        format="json",
    )
    assert r.status_code == 429
    assert r.json()["code"] == "ai_budget_exceeded"


def test_budget_does_not_block_staff(staff_client, staff):
    """Staff bypass budget enforcement."""
    s = AISettings.load()
    s.daily_budget_usd_per_user = 0.001
    s.save()
    AIUsageLog.objects.create(
        user=staff, operation="polish", model="claude-opus-4-7",
        input_tokens=999999, output_tokens=999999, succeeded=True,
    )
    # Staff: even though spent >>> budget, the check_daily_budget should
    # bypass for is_staff. We don't actually call run_once here (would need
    # API key); we just verify the budget check returns silently.
    from apps.ai.services import check_daily_budget
    check_daily_budget(staff)  # must not raise


# ── CSV export ─────────────────────────────────────────────────────────


def test_csv_export_admin(staff_client, staff):
    AIUsageLog.objects.create(
        user=staff, operation="polish", model="claude-opus-4-7",
        input_tokens=100, output_tokens=200, succeeded=True,
    )
    r = staff_client.get("/api/v1/ai/usage/csv/")
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/csv")
    body = r.content.decode("utf-8")
    assert "claude-opus-4-7" in body
    assert "input_tokens" in body  # header


# ── Per-KB / per-document attribution in usage ────────────────────────


@pytest.mark.django_db
def test_usage_breaks_down_by_kb_and_document(alice_client, alice):
    from apps.knowledge.models import Document, KnowledgeBase
    kb = KnowledgeBase.objects.create(owner=alice, name="test-kb", slug="test-kb")
    doc = Document.objects.create(
        knowledge_base=kb, title="doc", slug="doc", raw_content="x",
    )
    AIUsageLog.objects.create(
        user=alice, operation="polish", model="claude-opus-4-7",
        input_tokens=1000, output_tokens=500, succeeded=True,
        document_id=doc.id, knowledge_base_id=kb.id,
    )
    r = alice_client.get("/api/v1/ai/usage/?days=1")
    assert r.status_code == 200
    body = r.json()
    assert "by_kb" in body
    assert "by_document" in body
    assert len(body["by_kb"]) == 1
    assert body["by_kb"][0]["name"] == "test-kb"
    assert len(body["by_document"]) == 1
    assert body["by_document"][0]["title"] == "doc"
