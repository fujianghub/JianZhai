from __future__ import annotations

from pathlib import Path

from django.core.exceptions import ObjectDoesNotExist
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.scoping import scope_queryset

from .models import ExportTask
from .scope import collect_for_scope
from .serializers import ExportTaskSerializer
from .tasks import run_export


class ExportTaskViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = ExportTaskSerializer
    pagination_class = None

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
        target_id = serializer.validated_data["target_id"]
        fmt = serializer.validated_data["format"]

        # Validate that the user actually owns the target before queuing work.
        try:
            scope_info = collect_for_scope(owner=request.user, scope=scope, target_id=target_id)
        except ObjectDoesNotExist:
            return Response({"detail": "export target not found"}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        task = ExportTask.objects.create(
            owner=request.user,
            scope=scope,
            target_id=target_id,
            target_label=scope_info.label,
            format=fmt,
        )
        # Hand off to Celery; if the broker is unreachable, fall back to inline execution
        # so manual testing without a worker still works.
        try:
            run_export.delay(task.id)
        except Exception:  # noqa: BLE001
            run_export(task.id)

        return Response(self.get_serializer(task).data, status=201)


def download(request, pk: int):
    task = get_object_or_404(ExportTask, pk=pk)
    if not request.user.is_authenticated:
        raise Http404
    # Superusers can download any export; owners can download their own.
    if not request.user.is_superuser and task.owner_id != request.user.id:
        raise Http404
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
