"""``@[label](doc:NN)`` rewrites in markdown export.

A multi-doc zip should keep cross-references working as relative ``.md``
links so the archive is still navigable offline. Single-doc exports degrade
the syntax to plain label text (the target isn't in the archive).
"""
from __future__ import annotations

import zipfile
from io import BytesIO

import pytest

from apps.exporter.scope import collect_for_scope
from apps.exporter.services import markdown_export
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_multi_doc_zip_rewrites_doc_mentions(owner, kb):
    target = make_doc(kb, "target-note", raw="Target body")
    make_doc(
        kb,
        "source",
        raw=f"See @[Target](doc:{target.id}) for details.",
    )
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    path, _, _ = markdown_export.export(scope)
    with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
        source_md = zf.read("source.md").decode("utf-8")
    # The export rewrites the mention to a relative ``.md`` link the reader
    # can resolve by double-clicking the archive in any editor.
    assert "doc:" not in source_md
    assert "[Target](target-note.md)" in source_md


@pytest.mark.django_db
def test_multi_doc_zip_degrades_external_mentions(owner, kb):
    """Mentions targeting docs outside the scope drop the link to keep the
    archive from carrying ``doc:NN`` URIs no offline reader can follow.

    With a single doc in the source kb the exporter takes the single-doc
    code path (``.md`` not ``.zip``), so we read whichever container ends
    up on disk.
    """
    other_kb = type(kb).objects.create(owner=owner, name="Other", slug="other")
    outside = make_doc(other_kb, "outside")
    # Two docs in the source kb so we land on the multi-doc zip path,
    # which is the one that actually carries an explicit ``link_index``.
    make_doc(kb, "sibling")
    make_doc(
        kb,
        "source",
        raw=f"@[Outside](doc:{outside.id}) is in another kb.",
    )
    scope = collect_for_scope(owner=owner, scope="kb", target_id=kb.id)
    path, filename, _ = markdown_export.export(scope)
    if filename.endswith(".zip"):
        with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
            source_md = zf.read("source.md").decode("utf-8")
    else:
        source_md = path.read_text(encoding="utf-8")
    # External mention degraded to plain label — no dangling ``doc:NN``.
    assert "Outside is in another kb" in source_md
    assert "doc:" not in source_md


@pytest.mark.django_db
def test_single_doc_md_strips_doc_mentions(owner, kb):
    other = make_doc(kb, "other")
    main = make_doc(
        kb,
        "main",
        raw=f"Linked: @[Other](doc:{other.id}).",
    )
    scope = collect_for_scope(owner=owner, scope="doc", target_id=main.id)
    path, filename, _ = markdown_export.export(scope)
    if filename.endswith(".zip"):
        with zipfile.ZipFile(BytesIO(path.read_bytes())) as zf:
            text = zf.read("content.md").decode("utf-8")
    else:
        text = path.read_text(encoding="utf-8")
    assert "Linked: Other." in text
    assert "doc:" not in text
