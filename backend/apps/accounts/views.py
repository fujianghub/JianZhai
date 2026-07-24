from __future__ import annotations

import os
import platform
import sys
from datetime import timedelta

import django
from django.conf import settings
from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.db.models import Sum
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import (
    action,
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle


class LoginThrottle(AnonRateThrottle):
    """Dedicated login limiter (10/min/IP). The global anon throttle is a
    shared 120/min pool across every anonymous endpoint — far too generous
    for online password guessing against a single endpoint."""

    scope = "login"

from apps.knowledge.models import (
    Document,
    Folder,
    KnowledgeBase,
    KnowledgeBaseCategory,
)

from .avatar import avatar_storage_name, process_avatar_image
from .models import ReadGrant, UserProfile, UserTag
from .permissions import IsRoot, is_root_admin

User = get_user_model()


def _avatar_url_for(user) -> str | None:
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return None
    if profile.avatar:
        return profile.avatar.url
    return None


def _email_matches(user, email: str) -> bool:
    """The login email must equal the account's stored email (trim +
    case-insensitive). Accounts with no email on record skip the check so a
    legacy email-less account isn't locked out."""
    stored = (user.email or "").strip().lower()
    if not stored:
        return True
    return stored == (email or "").strip().lower()


def _serialize_user(user) -> dict:
    from .permissions import get_role, is_root_admin
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
        # v1.0 RBAC — single canonical role the frontend gates menus/routes on.
        "role": get_role(user),
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
@throttle_classes([LoginThrottle])
def login_view(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")
    email = (request.data.get("email") or "").strip()
    captcha_id = request.data.get("captcha_id", "")
    captcha_x = request.data.get("captcha_x", None)
    if not username or not password or not email:
        return Response(
            {"detail": "用户名、密码与邮箱均为必填"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Bot gate first — cheap, and blocks automated password guessing before we
    # ever touch the password hash. Single-use: a failed login burns the puzzle.
    from .captcha import verify_slider

    if not verify_slider(captcha_id, captcha_x):
        return Response(
            {"detail": "滑块验证未通过，请重试", "captcha_failed": True},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = authenticate(request, username=username, password=password)
    # Generic 401 whether the password or the email is wrong — don't reveal
    # which factor failed.
    if user is None or not _email_matches(user, email):
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
    # Keep THIS session alive (rotate its auth hash) while every other
    # session — including a hijacked one — is invalidated by the password
    # change. Without this the user themselves got logged out immediately.
    update_session_auth_hash(request, request.user)
    return Response({"ok": True, "detail": "密码已更新"})


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
    # The root-admin identity is "is_superuser AND username == ROOT_ADMIN_USERNAME".
    # If the root slot is vacant, a non-root superuser could self-promote by
    # simply renaming — reserve the name for whoever is already root.
    from .permissions import is_root_admin

    root_name = getattr(settings, "ROOT_ADMIN_USERNAME", "") or ""
    if (
        root_name
        and new_username == root_name
        and not is_root_admin(request.user)
    ):
        return Response({"detail": "该用户名为保留账号，不能使用"}, status=400)
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
@permission_classes([IsRoot])
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


class UserTagSerializer(serializers.ModelSerializer):
    """Author-managed labels on reader accounts. Global / shared pool."""

    class Meta:
        model = UserTag
        fields = ["id", "name", "color", "created_at"]
        read_only_fields = ["id", "created_at"]


class ReadGrantItemSerializer(serializers.Serializer):
    """One write-side grant item — exactly one of the four target keys.

    The default managers on the PK fields exclude soft-deleted targets, so a
    deleted folder/document can't be granted (categories have no soft-delete).
    """

    kb_id = serializers.PrimaryKeyRelatedField(
        queryset=KnowledgeBase.objects.all(), required=False, allow_null=False
    )
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=KnowledgeBaseCategory.objects.all(), required=False, allow_null=False
    )
    folder_id = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), required=False, allow_null=False
    )
    document_id = serializers.PrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=False
    )

    def validate(self, attrs):
        present = [k for k in ("kb_id", "category_id", "folder_id", "document_id") if attrs.get(k)]
        if len(present) != 1:
            raise serializers.ValidationError(
                "每条授权必须且只能指定一个目标（kb_id / category_id / folder_id / document_id 四选一）"
            )
        return attrs


def _grant_brief(grant: ReadGrant) -> dict:
    """Read-side brief for one grant. Soft-deleted targets still resolve
    (FK access uses the base manager) and get a ``(已删除)`` suffix."""

    def _deleted(obj) -> str:
        return "（已删除）" if getattr(obj, "is_deleted", False) else ""

    if grant.knowledge_base_id:
        kb = grant.knowledge_base
        return {
            "id": grant.id,
            "type": "kb",
            "target_id": kb.id,
            "name": f"{kb.name}{_deleted(kb)}",
        }
    if grant.category_id:
        cat = grant.category
        return {"id": grant.id, "type": "category", "target_id": cat.id, "name": cat.name}
    if grant.folder_id:
        folder = grant.folder
        kb = folder.knowledge_base
        return {
            "id": grant.id,
            "type": "folder",
            "target_id": folder.id,
            "name": f"{folder.name}{_deleted(folder)}",
            "kb_id": kb.id,
            "kb_name": kb.name,
        }
    doc = grant.document
    kb = doc.knowledge_base
    return {
        "id": grant.id,
        "type": "document",
        "target_id": doc.id,
        "name": f"{doc.title}{_deleted(doc)}",
        "kb_id": kb.id,
        "kb_name": kb.name,
    }


def _apply_read_grant_items(user, items) -> None:
    """Full replacement, same semantics as ``account_tags.set()``. ``[]``
    clears every grant (user back to unrestricted)."""
    from django.db import transaction

    rows = []
    seen = set()
    for item in items:
        grant = ReadGrant(
            user=user,
            knowledge_base=item.get("kb_id"),
            category=item.get("category_id"),
            folder=item.get("folder_id"),
            document=item.get("document_id"),
        )
        key = (
            grant.knowledge_base_id,
            grant.category_id,
            grant.folder_id,
            grant.document_id,
        )
        if key in seen:  # payload duplicates would trip the unique constraints
            continue
        seen.add(key)
        rows.append(grant)
    with transaction.atomic():
        user.read_grants.all().delete()
        ReadGrant.objects.bulk_create(rows)


class UserSerializer(serializers.ModelSerializer):
    # Plain-text on input only — never echoed back. Optional on update.
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=False, min_length=4
    )
    # v0.9.9 — email required on create; the operator can leave it blank
    # later via PATCH but new accounts must have a real address.
    email = serializers.EmailField(required=True, allow_blank=False)
    is_root = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    # Author-facing only (this serializer is reachable solely through the
    # staff-gated UserViewSet — readers never see their own tags).
    tags = UserTagSerializer(source="account_tags", many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=UserTag.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source="account_tags",
    )
    # Per-user reading whitelist (see ReadGrant). Empty list on read means
    # unrestricted; write side is full-replacement via ``read_grant_items``.
    read_grants = serializers.SerializerMethodField()
    read_grant_items = ReadGrantItemSerializer(
        many=True, write_only=True, required=False
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
            "is_root",
            "role",
            "tags",
            "tag_ids",
            "read_grants",
            "read_grant_items",
            "date_joined",
            "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "is_superuser", "is_root", "role"]

    def get_is_root(self, obj) -> bool:
        from .permissions import is_root_admin
        return is_root_admin(obj)

    def get_role(self, obj) -> str:
        from .permissions import get_role
        return get_role(obj)

    def get_read_grants(self, obj) -> list[dict]:
        return [_grant_brief(g) for g in obj.read_grants.all()]

    def validate(self, attrs):
        # Grants on an author are inert (is_staff bypasses all reader
        # filtering) — refuse to create the illusion of a restriction. Same
        # rationale as AudienceSerializerMixin.validate_audience_user_ids.
        items = attrs.get("read_grant_items")
        if items:
            will_be_staff = attrs.get(
                "is_staff", self.instance.is_staff if self.instance else False
            )
            if will_be_staff:
                raise serializers.ValidationError(
                    {"read_grant_items": "管理员是作者，不受阅读限制，无需设置阅读权限"}
                )
        return attrs

    def create(self, validated_data):
        from django.db import transaction

        tags = validated_data.pop("account_tags", None)
        grant_items = validated_data.pop("read_grant_items", None)
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "新建用户必须设置密码"})
        # All-or-nothing: a failure anywhere (profile signal, tags, grants)
        # must not leave a half-created user with missing tags/grants behind.
        with transaction.atomic():
            user = User(**validated_data)
            user.set_password(password)
            user.save()
            if tags is not None:
                user.account_tags.set(tags)
            if grant_items is not None:
                _apply_read_grant_items(user, grant_items)
        return user

    def update(self, instance, validated_data):
        tags = validated_data.pop("account_tags", None)
        grant_items = validated_data.pop("read_grant_items", None)
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        if tags is not None:
            instance.account_tags.set(tags)
        if grant_items is not None:
            _apply_read_grant_items(instance, grant_items)
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

    def get_queryset(self):
        # Visibility scoping: root sees everyone; a non-root admin sees only
        # plain normal users plus themselves (never the root or other admins).
        qs = User.objects.order_by("id").prefetch_related(
            "account_tags",
            "read_grants__knowledge_base",
            "read_grants__category",
            "read_grants__folder__knowledge_base",
            "read_grants__document__knowledge_base",
        )
        if not is_root_admin(self.request.user):
            from django.db.models import Q
            qs = qs.filter(
                Q(is_staff=False, is_superuser=False) | Q(pk=self.request.user.pk)
            )
        # WeChat-style filtering: by tag id and/or by username/email search.
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(account_tags__id=tag)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(username__icontains=search) | Q(email__icontains=search)
            )
        return qs.distinct()

    def perform_create(self, serializer):
        # Only root may mint admins; a non-root admin can create plain users.
        if serializer.validated_data.get("is_staff") and not is_root_admin(
            self.request.user
        ):
            raise serializers.ValidationError("只有根管理员可以创建管理员")
        serializer.save()

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
        # Granting / revoking the admin (is_staff) role is root-only — a
        # non-root admin must not be able to promote a user to peer or demote.
        if not is_root_admin(actor):
            new_is_staff = serializer.validated_data.get("is_staff", instance.is_staff)
            if new_is_staff != instance.is_staff:
                raise serializers.ValidationError("只有根管理员可以授予/撤销管理员身份")
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
        # Same validator chain as self-service change_password_me — an
        # admin reset shouldn't be the loophole that lets "12345678" in.
        try:
            validate_password(new, user=target)
        except Exception as e:  # noqa: BLE001
            msgs = getattr(e, "messages", None) or [str(e)]
            return Response({"detail": " ".join(msgs)}, status=400)
        target.set_password(new)
        target.save(update_fields=["password"])
        return Response({"ok": True, "detail": f"已重置 {target.username} 的密码"})


class UserTagViewSet(viewsets.ModelViewSet):
    """CRUD for the shared user-tag vocabulary — staff (author) only.

    Tags are global (no per-owner isolation), matching the shared content
    pool. Assigning a tag to a specific user happens through ``UserViewSet``
    (``tag_ids``) and is gated by the same ``can_manage_user`` rules; here we
    only manage the vocabulary itself (create / rename / recolor / delete).
    """

    queryset = UserTag.objects.all()
    serializer_class = UserTagSerializer
    permission_classes = [IsStaffUser]
