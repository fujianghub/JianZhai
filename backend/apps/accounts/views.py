from __future__ import annotations

import os
import platform
import sys
from datetime import timedelta

import django
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Sum
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response

from .avatar import avatar_storage_name, process_avatar_image
from .models import UserProfile

User = get_user_model()


def _avatar_url_for(user) -> str | None:
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return None
    if profile.avatar:
        return profile.avatar.url
    return None


def _serialize_user(user) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "avatar_url": _avatar_url_for(user),
    }


def _get_or_create_profile(user) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    """Force-set the csrftoken cookie so the SPA can read it for unsafe requests."""
    token = get_token(request)
    return Response({"csrfToken": token})


@api_view(["GET"])
@permission_classes([AllowAny])
def session(request):
    """Bootstrap-time check called by the SPA before mounting any route.

    Also surfaces ``require_login`` (set by ``SITE_REQUIRE_LOGIN`` env in
    production) so the frontend BlogLayout can redirect anonymous users to
    the login page when the deployment is in friends-only mode.
    """
    base = {
        "require_login": bool(getattr(settings, "SITE_REQUIRE_LOGIN", False)),
    }
    if request.user.is_authenticated:
        return Response({**base, "authenticated": True, "user": _serialize_user(request.user)})
    return Response({**base, "authenticated": False, "user": None})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED
        )
    login(request, user)
    return Response({"authenticated": True, "user": _serialize_user(user)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"authenticated": False})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return Response(
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "avatar_url": _avatar_url_for(user),
        }
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def avatar_me(request):
    if request.method == "DELETE":
        profile = _get_or_create_profile(request.user)
        if profile.avatar:
            profile.avatar.delete(save=True)
        return Response({"avatar_url": None})

    uploaded = request.FILES.get("file")
    if not uploaded:
        return Response({"detail": "缺少 file 字段"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        content = process_avatar_image(uploaded)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    profile = _get_or_create_profile(request.user)
    if profile.avatar:
        profile.avatar.delete(save=False)
    profile.avatar.save(avatar_storage_name(request.user.id), content, save=True)
    return Response({"avatar_url": profile.avatar.url})


# ─── User management ────────────────────────────────────────────────────────


class IsStaffUser(BasePermission):
    """Only staff users can manage other accounts."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsSuperUser(BasePermission):
    """Only superusers — used for the architecture-overview endpoint."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.is_superuser
        )


@api_view(["GET"])
@permission_classes([IsSuperUser])
def system_info(request):
    """Live counts + runtime info for the superuser-only 架构总览 page.

    Aggregates a handful of cheap COUNT/SUM queries so the page can render a
    stats grid that refreshes on a 30s interval without paginating heavy data.
    """
    from apps.ai.models import AIUsageLog
    from apps.editor.models import Attachment
    from apps.knowledge.models import Document, Folder, KnowledgeBase

    now = timezone.now()
    one_day_ago = now - timedelta(days=1)

    doc_qs = Document.objects.all()
    attachment_agg = Attachment.objects.aggregate(total=Sum("size"))
    html_docs = doc_qs.filter(published_content__icontains="<!DOCTYPE").count()

    return Response(
        {
            "server_time": now.isoformat(),
            "runtime": {
                "python": sys.version.split()[0],
                "django": django.get_version(),
                "platform": platform.platform(),
                "debug": settings.DEBUG,
            },
            "security": {
                "csrf_trusted_origins": settings.CSRF_TRUSTED_ORIGINS,
                "public_origin": os.environ.get("JIANZHAI_PUBLIC_ORIGIN") or settings.SITE_PUBLIC_URL,
            },
            "counts": {
                "knowledge_bases": KnowledgeBase.objects.count(),
                "folders": Folder.objects.count(),
                "documents_total": doc_qs.count(),
                "documents_published": doc_qs.filter(status="published").count(),
                "documents_draft": doc_qs.filter(status="draft").count(),
                "documents_public": doc_qs.filter(visibility="public").count(),
                "documents_updated_24h": doc_qs.filter(updated_at__gte=one_day_ago).count(),
                "users_total": User.objects.count(),
                "users_active": User.objects.filter(is_active=True).count(),
                "users_staff": User.objects.filter(is_staff=True).count(),
                "attachments_total": Attachment.objects.count(),
                "attachments_bytes": attachment_agg["total"] or 0,
                "documents_html": html_docs,
                "ai_calls_24h": AIUsageLog.objects.filter(created_at__gte=one_day_ago).count(),
            },
        }
    )


class UserSerializer(serializers.ModelSerializer):
    # Plain-text on input only — never echoed back. Optional on update.
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=False, min_length=4
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "is_staff",
            "is_superuser",
            "is_active",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "is_superuser"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "新建用户必须设置密码"})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserViewSet(viewsets.ModelViewSet):
    """CRUD for User accounts — staff-only.

    Guarded so a staff user cannot demote or delete themselves through the
    API; that would lock the site out of administration.
    """

    queryset = User.objects.order_by("id")
    serializer_class = UserSerializer
    permission_classes = [IsStaffUser]

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise serializers.ValidationError("不能删除当前登录的账号")
        if instance.is_superuser:
            raise serializers.ValidationError("不能删除超级管理员")
        instance.delete()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_is_staff = serializer.validated_data.get("is_staff", instance.is_staff)
        # Self-demotion safeguard
        if (
            instance.pk == self.request.user.pk
            and instance.is_staff
            and not new_is_staff
        ):
            raise serializers.ValidationError("不能取消自己的管理员权限")
        serializer.save()
