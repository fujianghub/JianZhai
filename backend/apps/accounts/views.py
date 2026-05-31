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
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
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
    from .permissions import is_root_admin
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        # v0.9.9 — UI uses this to show the 🛡 "根管理员" badge and to
        # disable destructive buttons for non-root admins acting on
        # the root account.
        "is_root": is_root_admin(user),
        "is_active": user.is_active,
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
    """Return the full serialised user — same shape as session/login.

    v0.9.9 unified the return value with ``_serialize_user`` so callers
    don't need to special-case which fields are exposed where. Includes
    ``is_root`` flag and ``email``.
    """
    return Response({"user": _serialize_user(request.user)})


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


# ─── Self-service account edits (v0.9.9) ─────────────────────────────


import re
from django.contrib.auth.password_validation import validate_password


def _is_valid_email(s: str) -> bool:
    """Lightweight email check — we accept anything resembling x@y.z so
    users can put internal addresses, .local TLDs, etc. The real
    deliverability check happens when (if) we ever send mail."""
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", s or ""))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password_me(request):
    """User changes their own password.

    Body: { old_password, new_password }

    Requires the old password to defeat session-hijack escalation: a
    compromised session shouldn't let the attacker permanently lock the
    real owner out. Also runs Django's standard password validators
    (length, common-password blocklist, etc).
    """
    old = (request.data.get("old_password") or "").strip()
    new = (request.data.get("new_password") or "").strip()
    if not old or not new:
        return Response({"detail": "需要提供原密码与新密码"}, status=400)
    if not request.user.check_password(old):
        return Response({"detail": "原密码错误"}, status=400)
    try:
        validate_password(new, user=request.user)
    except Exception as e:  # noqa: BLE001
        msgs = getattr(e, "messages", None) or [str(e)]
        return Response({"detail": " ".join(msgs)}, status=400)
    request.user.set_password(new)
    request.user.save(update_fields=["password"])
    return Response({"ok": True, "detail": "密码已更新，请重新登录后下次生效"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_email_me(request):
    """Change email. Requires current password as anti-CSRF reinforcement
    (CSRF token already protects the POST, but for credential rotations
    we layer in the password check too)."""
    email = (request.data.get("email") or "").strip()
    password = (request.data.get("password") or "").strip()
    if not email or not password:
        return Response({"detail": "需要邮箱与当前密码"}, status=400)
    if not _is_valid_email(email):
        return Response({"detail": "邮箱格式不正确"}, status=400)
    if not request.user.check_password(password):
        return Response({"detail": "当前密码错误"}, status=400)
    request.user.email = email
    request.user.save(update_fields=["email"])
    return Response(_serialize_user(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_username_me(request):
    """Change username. Requires current password.

    Validates uniqueness against the existing User table; rejects
    obvious troll values (whitespace-only, contains @, length < 2).
    """
    new_username = (request.data.get("new_username") or "").strip()
    password = (request.data.get("password") or "").strip()
    if not new_username or not password:
        return Response({"detail": "需要新用户名与当前密码"}, status=400)
    if len(new_username) < 2 or len(new_username) > 30:
        return Response({"detail": "用户名长度需在 2-30 字符之间"}, status=400)
    if not re.match(r"^[A-Za-z0-9_.\-]+$", new_username):
        return Response({"detail": "用户名只能含字母、数字、下划线、点和连字符"}, status=400)
    if not request.user.check_password(password):
        return Response({"detail": "当前密码错误"}, status=400)
    if (
        User.objects.exclude(pk=request.user.pk)
        .filter(username=new_username)
        .exists()
    ):
        return Response({"detail": "用户名已被占用"}, status=400)
    request.user.username = new_username
    request.user.save(update_fields=["username"])
    return Response(_serialize_user(request.user))


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
    # v0.9.9 — email required on create; the operator can leave it blank
    # later via PATCH but new accounts must have a real address.
    email = serializers.EmailField(required=True, allow_blank=False)
    is_root = serializers.SerializerMethodField()

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
            "is_root",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "is_superuser", "is_root"]

    def get_is_root(self, obj) -> bool:
        from .permissions import is_root_admin
        return is_root_admin(obj)

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

    v0.9.9 rules:
      - Self-modification through the API is blocked (use the
        change-password / change-email / change-username self-service
        endpoints instead). This includes self-demote, self-delete,
        self-disable.
      - The "root admin" (settings.ROOT_ADMIN_USERNAME) is the only
        account that can act on OTHER superusers (delete/disable/
        reset-password). Non-root staff can manage non-superuser users.
      - Root account itself cannot be deleted or disabled by anyone —
        not even by itself. Use the Django shell if you really need
        to drop it (and read the kb first).
    """

    queryset = User.objects.order_by("id")
    serializer_class = UserSerializer
    permission_classes = [IsStaffUser]

    def perform_destroy(self, instance):
        from .permissions import can_manage_user, is_root_admin
        if is_root_admin(instance):
            raise serializers.ValidationError("根管理员账号不能删除")
        allowed, reason = can_manage_user(self.request.user, instance)
        if not allowed:
            raise serializers.ValidationError(reason)
        instance.delete()

    def perform_update(self, serializer):
        from .permissions import can_manage_user, is_root_admin
        instance = serializer.instance
        actor = self.request.user
        # Self-changes (other than email/username/password through the
        # dedicated self-service endpoints) are blocked.
        if instance.pk == actor.pk:
            new_is_staff = serializer.validated_data.get("is_staff", instance.is_staff)
            new_is_active = serializer.validated_data.get("is_active", instance.is_active)
            if (instance.is_staff and not new_is_staff) or (instance.is_active and not new_is_active):
                raise serializers.ValidationError("不能在此修改自己的状态；请用账号自服务接口")
            # Other self-edits (avatar, etc) are fine; fall through.
        elif is_root_admin(instance):
            # Root admin can only be edited by itself.
            raise serializers.ValidationError("根管理员账号只能本人修改")
        else:
            allowed, reason = can_manage_user(actor, instance)
            if not allowed:
                raise serializers.ValidationError(reason)
        serializer.save()

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pk=None):
        """Disable a user account (is_active=False) — admin only.

        Friendlier than DELETE because it preserves the user's content
        attribution; flipping back via ``enable`` restores access
        instantly.
        """
        from .permissions import can_manage_user, is_root_admin
        target = self.get_object()
        if is_root_admin(target):
            return Response({"detail": "根管理员账号不能被禁用"}, status=403)
        allowed, reason = can_manage_user(request.user, target)
        if not allowed:
            return Response({"detail": reason}, status=403)
        target.is_active = False
        target.save(update_fields=["is_active"])
        return Response(_serialize_user(target))

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pk=None):
        """Re-enable a previously disabled user."""
        from .permissions import can_manage_user
        target = self.get_object()
        allowed, reason = can_manage_user(request.user, target)
        if not allowed:
            return Response({"detail": reason}, status=403)
        target.is_active = True
        target.save(update_fields=["is_active"])
        return Response(_serialize_user(target))

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """Reset another user's password — admin only.

        Body: { new_password }

        Used when a user forgets their password. Different from the
        self-service ``change_password_me`` endpoint which requires the
        OLD password.
        """
        from .permissions import can_manage_user, is_root_admin
        target = self.get_object()
        if is_root_admin(target) and target.pk != request.user.pk:
            return Response({"detail": "根管理员的密码只能本人重置"}, status=403)
        allowed, reason = can_manage_user(request.user, target)
        if not allowed:
            return Response({"detail": reason}, status=403)
        new = (request.data.get("new_password") or "").strip()
        if not new or len(new) < 8:
            return Response({"detail": "新密码至少 8 个字符"}, status=400)
        target.set_password(new)
        target.save(update_fields=["password"])
        return Response({"ok": True, "detail": f"已重置 {target.username} 的密码"})
