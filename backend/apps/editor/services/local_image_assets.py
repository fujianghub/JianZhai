"""Bundle a markdown document's sibling *local* images as Attachments.

When a user uploads a folder containing ``教程.md`` plus an ``images/`` subfolder,
the markdown references its pictures with **local relative paths** such as
``![alt](./images/pic.png)``. Those paths mean nothing once the ``.md`` text is
stored in the DB — the browser resolves them against the blog URL (``/posts/…``)
and 404s. This module turns the sibling image files into real Attachments and
rewrites the relative references to the resulting ``/media/…`` URLs.

It is shared by two callers:

* the batch-import view (live folder uploads — images arrive in the same
  multipart request as the markdown), and
* the ``import_local_images`` management command (repairing an
  already-imported document from an images directory on disk).

Remote ``http(s)://`` images are intentionally *not* handled here — those go
through :mod:`apps.editor.services.image_mirror`.
"""

from __future__ import annotations

import posixpath
from urllib.parse import unquote, urlparse

from apps.knowledge.models import Document

from .image_mirror import extract_markdown_image_urls

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}


def is_local_image_ref(url: str) -> bool:
    """True for a relative/local image path — not http(s), data:, //cdn or /media/."""
    u = (url or "").strip()
    if not u:
        return False
    if u.startswith(("http://", "https://", "data:", "//", "/media/")):
        return False
    if "/media/" in u.split("?", 1)[0]:
        return False
    # Reject anything carrying a URL scheme (mailto:, ftp:, file:, …).
    if urlparse(u).scheme:
        return False
    return True


def normalize_ref_path(url: str) -> str:
    """Markdown ref → clean posix path: drop optional title, query/hash, decode."""
    u = (url or "").strip()
    # ``![](path "title")`` — the regex captures ``path "title"``; cut the title.
    if '"' in u:
        u = u.split('"', 1)[0].strip()
    if "'" in u:
        u = u.split("'", 1)[0].strip()
    u = u.split("?", 1)[0].split("#", 1)[0]
    u = unquote(u).replace("\\", "/").strip()
    if not u:
        return ""
    return posixpath.normpath(u.lstrip("/"))


def _resolve_against(doc_rel: str, ref: str) -> str:
    """Resolve a local ref against the markdown file's own relative directory.

    ``doc_rel='教程/教程.md'`` + ``ref='./images/x.png'`` → ``'教程/images/x.png'``.
    """
    norm = normalize_ref_path(ref)
    base_dir = posixpath.dirname((doc_rel or "").replace("\\", "/"))
    if base_dir:
        return posixpath.normpath(posixpath.join(base_dir, norm))
    return norm


class AssetIndex:
    """Maps uploaded image files to media URLs, by full relpath and by basename."""

    def __init__(self) -> None:
        self.by_relpath: dict[str, str] = {}
        self.by_basename: dict[str, str] = {}
        self._basename_collision: set[str] = set()

    def add(self, relpath: str, url: str) -> None:
        norm = normalize_ref_path(relpath)
        if norm:
            self.by_relpath[norm] = url
        base = posixpath.basename(norm) if norm else ""
        if base:
            if base in self.by_basename and self.by_basename[base] != url:
                self._basename_collision.add(base)
            self.by_basename[base] = url

    def url_for(self, doc_rel: str, ref: str) -> str | None:
        """Best media URL for a markdown ref, or None when no asset matches."""
        resolved = _resolve_against(doc_rel, ref)
        if resolved in self.by_relpath:
            return self.by_relpath[resolved]
        base = posixpath.basename(normalize_ref_path(ref))
        # Ambiguous basenames (same name in two folders) are only safe to match
        # when the full relpath already pinned them above; otherwise skip.
        if base and base not in self._basename_collision:
            return self.by_basename.get(base)
        return None


def rewrite_local_image_refs(doc: Document, index: AssetIndex, *, doc_rel: str = "") -> int:
    """Rewrite ``doc``'s local image refs to media URLs from ``index``.

    Mutates ``raw_content`` / ``published_content`` in place and saves when
    anything changed. Returns the number of distinct refs rewritten.
    """
    refs = extract_markdown_image_urls(doc.raw_content or "")
    refs += [u for u in extract_markdown_image_urls(doc.published_content or "") if u not in refs]

    changed = 0
    for ref in refs:
        if not is_local_image_ref(ref):
            continue
        new_url = index.url_for(doc_rel, ref)
        if not new_url or new_url == ref:
            continue
        did = False
        if ref in (doc.raw_content or ""):
            doc.raw_content = doc.raw_content.replace(ref, new_url)
            did = True
        if ref in (doc.published_content or ""):
            doc.published_content = doc.published_content.replace(ref, new_url)
            did = True
        if did:
            changed += 1

    if changed:
        doc.save(update_fields=["raw_content", "published_content", "updated_at"])
    return changed
