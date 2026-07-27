from __future__ import annotations

import logging
from pathlib import Path

from django.core.exceptions import ObjectDoesNotExist
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsContentAuthor
from apps.accounts.scoping import scope_queryset

from .models import ExportTask
from .scope import collect_for_scope
from .serializers import ExportTaskSerializer
from .tasks import run_export

log = logging.getLogger(__name__)


class ExportTaskViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsContentAuthor]
    serializer_class = ExportTaskSerializer
    pagination_class = None
    throttle_scope = "export_create"

    def get_throttles(self):
        # 只限创建：list 被导出历史页 2s 轮询（30/min），全量限流会误伤轮询。
        if getattr(self, "action", None) == "create":
            return [ScopedRateThrottle()]
        return []

    def get_queryset(self):
        return scope_queryset(ExportTask.objects.all(), self.request.user, field="owner")

    def perform_destroy(self, instance):
        # Remove the artifact too so deleting a row also frees disk space.
        path = instance.absolute_file_path
        if path and path.exists():
            try:
                path.unlink()
            except OSError:
                pass
        instance.delete()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        scope = serializer.validated_data["scope"]
        target_id = serializer.validated_data.get("target_id") or 0
        fmt = serializer.validated_data["format"]
        folder_ids = serializer.validated_data.get("folder_ids") or []
        doc_ids = serializer.validated_data.get("doc_ids") or []

        # Validate that the user actually owns the target before queuing work.
        try:
            scope_info = collect_for_scope(
                owner=request.user,
                scope=scope,
                target_id=target_id,
                folder_ids=folder_ids,
                doc_ids=doc_ids,
            )
        except ObjectDoesNotExist:
            return Response({"detail": "export target not found"}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        selection: dict = {}
        if scope == ExportTask.SCOPE_SELECTION:
            # Persist the picks so the worker can re-resolve; anchor target_id to the KB.
            selection = {"folder_ids": folder_ids, "doc_ids": doc_ids}
            target_id = scope_info.kb.id

        # only_published 存进 selection JSON（免迁移）；缺省 = 历史行为，
        # site 在 worker 侧无条件强制 True。
        if "only_published" in serializer.validated_data:
            selection["only_published"] = bool(
                serializer.validated_data["only_published"]
            )

        # 去重：同 owner + 同 scope/target/format 已有未完成任务 → 复用（200）
        # 而非再排一个。此前重复点击会无限堆积重型任务。
        dup_qs = ExportTask.objects.filter(
            owner=request.user,
            scope=scope,
            target_id=target_id,
            format=fmt,
            status__in=[ExportTask.STATUS_PENDING, ExportTask.STATUS_RUNNING],
        )
        if scope == ExportTask.SCOPE_SELECTION:
            dup_qs = dup_qs.filter(selection=selection)
        existing = dup_qs.order_by("-id").first()
        if existing is not None:
            return Response(self.get_serializer(existing).data, status=200)

        task = ExportTask.objects.create(
            owner=request.user,
            scope=scope,
            target_id=target_id,
            selection=selection,
            target_label=scope_info.label,
            format=fmt,
        )
        # Hand off to Celery; if the broker is unreachable, fall back to inline
        # execution so manual testing without a worker still works — but only
        # for lightweight formats. PDF/site spin up Playwright/Chromium (~200MB,
        # up to 2 min) and would block a request worker, so when the broker is
        # down we fail those fast with a clear message instead.
        _HEAVY_FORMATS = {ExportTask.FORMAT_PDF, ExportTask.FORMAT_SITE}
        try:
            run_export.delay(task.id)
        except Exception:  # noqa: BLE001
            if fmt in _HEAVY_FORMATS:
                task.status = ExportTask.STATUS_FAILED
                task.error = "导出服务暂不可用（任务队列未运行），请稍后重试该格式。"
                task.save(update_fields=["status", "error"])
            else:
                run_export(task.id)

        return Response(self.get_serializer(task).data, status=201)


def download(request, pk: int):
    task = get_object_or_404(ExportTask, pk=pk)
    if not request.user.is_authenticated:
        raise Http404
    # Exports are an authoring feature — only content authors (staff) may
    # download, even if a regular user somehow obtained a task id.
    if not request.user.is_staff:
        raise Http404
    # Owners can download their own. Staff can cross-tenant download
    # (matches the documented "staff bypasses scoping" design), but
    # log the access so the audit trail is searchable if the box ever moves
    # to multi-tenant mode. Other users get a 404 (not 403 — keeps the IDOR
    # surface flat: an enumerator can't tell "exists but not yours" from "no
    # such id").
    if task.owner_id != request.user.id:
        if not request.user.is_staff:
            raise Http404
        log.info(
            "export.download cross_tenant: user=%s task=%s owner=%s",
            request.user.username,
            pk,
            task.owner_id,
        )
    if task.status != ExportTask.STATUS_DONE or not task.file_path:
        raise Http404
    path = Path(task.file_path)
    if not path.exists():
        raise Http404
    response = FileResponse(
        path.open("rb"), as_attachment=True, filename=task.filename or path.name
    )
    if task.mime_type:
        response["Content-Type"] = task.mime_type
    return response
