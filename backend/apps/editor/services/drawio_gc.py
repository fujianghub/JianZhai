"""drawio画板 附件回收。

每次在画板里「保存并退出」都会上传一对新的 SVG + PNG 附件，正文里的 figure
改指新文件；旧的一对不再被引用。用户决策（2026-09-24）：旧画板文件直接删除，
不为撤销 / 历史版本回滚保留。

规则（``prune_drawio_attachments``）：
- 只动画板文件：``original_filename`` 形如 ``drawio画板-*.svg|png``（以及底座
  批次早期的 ``drawio.svg|png``），其它附件一概不碰；
- 当前 ``raw_content`` 与 ``published_content`` 都不再出现该文件 URL；
- 创建已超过 ``GRACE_SECONDS``：保存画板时附件先上传、正文 5 s 后才自动存盘，
  这段窗口内若恰好落下一次旧内容的保存，不能把刚上传的新图当孤儿删掉。宽限
  内的旧文件会在之后任意一次保存时被回收。

删除走 ``media_gc.delete_files``（先删行、再删盘，与永久删除同一收口）。由
``Document`` 的 ``post_save`` 信号在事务提交后触发（``apps.editor.signals``），
覆盖自动保存 / 发布版 PATCH / 发布 / 撤回发布所有写路径。
"""

from __future__ import annotations

import logging
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

log = logging.getLogger(__name__)

GRACE_SECONDS = 120
DRAWIO_FILENAME_RE = re.compile(r"^drawio(?:画板)?(?:-[\w.-]+)?\.(?:svg|png)$")


def is_drawio_filename(name: str) -> bool:
    return bool(DRAWIO_FILENAME_RE.match(name or ""))


def prune_drawio_attachments(doc, *, now=None) -> int:
    """Delete this document's unreferenced drawio画板 files. Returns files removed."""
    from apps.editor.models import Attachment

    from .media_gc import delete_files

    if not getattr(doc, "pk", None):
        return 0
    cutoff = (now or timezone.now()) - timedelta(seconds=GRACE_SECONDS)
    candidates = [
        a
        for a in Attachment.objects.filter(document_id=doc.pk, created_at__lt=cutoff).only(
            "id", "file", "original_filename", "created_at"
        )
        if is_drawio_filename(a.original_filename)
    ]
    if not candidates:
        return 0
    body = f"{doc.raw_content or ''}\n{doc.published_content or ''}"
    stale = [a for a in candidates if a.file and a.url not in body]
    if not stale:
        return 0
    files = [a.file for a in stale]
    with transaction.atomic():
        Attachment.objects.filter(pk__in=[a.pk for a in stale]).delete()
    n = delete_files(files)
    log.info("drawio_gc: doc %s pruned %d stale board file(s)", doc.pk, n)
    return n
