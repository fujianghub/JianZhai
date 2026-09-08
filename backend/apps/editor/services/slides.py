"""Slide-conversion helpers shared by the API (manual re-convert), the
management command and the task itself."""

from __future__ import annotations

from apps.editor.models import DerivedFile, SlideImage


def reset_slides(document_id: int) -> int:
    """Drop rendered slides (rows + files) and the deck PDF so a fresh
    conversion isn't short-circuited by the idempotency guard. Returns the
    number of files removed."""
    n = 0
    for s in SlideImage.objects.filter(document_id=document_id):
        for f in (s.image, s.thumbnail):
            try:
                if f:
                    f.delete(save=False)
                    n += 1
            except Exception:  # noqa: BLE001
                pass
    SlideImage.objects.filter(document_id=document_id).delete()
    for d in DerivedFile.objects.filter(document_id=document_id, kind=DerivedFile.KIND_DECK_PDF):
        try:
            if d.file:
                d.file.delete(save=False)
                n += 1
        except Exception:  # noqa: BLE001
            pass
        d.delete()
    return n
