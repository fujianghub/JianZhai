"""Repair a markdown document whose local ``./images/*`` pictures were never
uploaded, by importing them from a directory on disk.

Usage::

    python manage.py import_local_images --document 364 --images-dir /path/to/教程

``--images-dir`` is scanned recursively; every image file is matched to the
document's ``![](./images/x.png)`` references **by file name**. Matched files
are stored as Attachments and the relative refs are rewritten to ``/media/…``.
Re-running is safe — refs already pointing at ``/media/`` are skipped, so only
still-broken pictures are imported.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from apps.editor.models import Attachment
from apps.editor.services.image_mirror import (
    _upload_path,
    extract_markdown_image_urls,
)
from apps.editor.services.local_image_assets import (
    IMAGE_EXTS,
    AssetIndex,
    is_local_image_ref,
    normalize_ref_path,
    rewrite_local_image_refs,
)
from apps.knowledge.models import Document


class Command(BaseCommand):
    help = "Import a markdown document's local images from a directory and rewrite its refs."

    def add_arguments(self, parser):
        parser.add_argument("--document", type=int, required=True, help="Document id to repair")
        parser.add_argument(
            "--images-dir",
            type=str,
            required=True,
            help="Directory holding the image files (scanned recursively)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report matches without creating attachments or editing the document",
        )

    def handle(self, *args, **opts):
        doc_id = opts["document"]
        images_dir = Path(opts["images_dir"]).expanduser()
        dry = opts["dry_run"]

        try:
            doc = Document.all_objects.get(pk=doc_id)
        except Document.DoesNotExist as exc:  # noqa: PERF203
            raise CommandError(f"Document {doc_id} not found") from exc
        if not images_dir.is_dir():
            raise CommandError(f"Not a directory: {images_dir}")

        # Index image files on disk by basename (last writer wins, but warn).
        disk_by_name: dict[str, Path] = {}
        for p in images_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                if p.name in disk_by_name:
                    self.stderr.write(f"  ⚠ duplicate filename on disk: {p.name}")
                disk_by_name[p.name] = p

        refs = extract_markdown_image_urls(doc.raw_content or "")
        refs += [
            u
            for u in extract_markdown_image_urls(doc.published_content or "")
            if u not in refs
        ]
        local_refs = [r for r in refs if is_local_image_ref(r)]

        self.stdout.write(
            f"Document {doc_id} «{doc.title}»: {len(local_refs)} local image refs, "
            f"{len(disk_by_name)} image files under {images_dir}"
        )

        index = AssetIndex()
        matched = 0
        missing: list[str] = []
        for ref in local_refs:
            name = Path(normalize_ref_path(ref)).name
            src = disk_by_name.get(name)
            if src is None:
                missing.append(ref)
                continue
            matched += 1
            if dry:
                self.stdout.write(f"  ✓ {ref}  →  {src}")
                # Use a placeholder so dry-run still reports rewrite coverage.
                index.add(ref, f"/media/(dry-run)/{name}")
                continue

            data = src.read_bytes()
            mime = mimetypes.guess_type(str(src))[0] or "image/png"
            att = Attachment(
                document=doc,
                uploaded_by=None,
                original_filename=src.name,
                kind=Attachment.KIND_IMAGE,
                mime_type=mime,
                size=len(data),
            )
            att.file.save(_upload_path(src.suffix.lower()), ContentFile(data), save=False)
            att.save()
            index.add(ref, att.file.url)
            self.stdout.write(f"  ✓ {ref}  →  {att.file.url}")

        for ref in missing:
            self.stderr.write(f"  ✗ no file on disk for: {ref}")

        if dry:
            self.stdout.write(
                self.style.WARNING(f"[dry-run] {matched} matched, {len(missing)} missing — no changes made")
            )
            return

        rewritten = rewrite_local_image_refs(doc, index, doc_rel="") if matched else 0
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {matched} image(s); rewrote {rewritten} ref(s); {len(missing)} still missing."
            )
        )
