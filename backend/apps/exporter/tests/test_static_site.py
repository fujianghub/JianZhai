from __future__ import annotations

import zipfile
from io import BytesIO

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import static_site
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_static_site_uses_published_content(owner, kb):
    make_doc(kb, "draft", raw="RAW ONLY", status="draft")
    make_doc(kb, "live", raw="raw", published="PUBLISHED", status="published")
    scope = collect_for_scope(
        owner=owner, scope="kb", target_id=kb.id, only_published=True
    )
    path, _, _ = static_site.export(scope)
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        names = zf.namelist()
        bodies = "".join(zf.read(n).decode("utf-8", errors="ignore") for n in names if n.endswith(".html"))
    assert "PUBLISHED" in bodies
    assert "RAW ONLY" not in bodies
