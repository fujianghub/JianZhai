from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.middleware.csrf import get_token
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response

User = get_user_model()


def _serialize_user(user) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    """Force-set the csrftoken cookie so the SPA can read it for unsafe requests."""
    token = get_token(request)
    return Response({"csrfToken": token})


@api_view(["GET"])
@permission_classes([AllowAny])
def session(request):
    if request.user.is_authenticated:
        return Response({"authenticated": True, "user": _serialize_user(request.user)})
    return Response({"authenticated": False, "user": None})


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


# ─── User management ────────────────────────────────────────────────────────


class IsStaffUser(BasePermission):
    """Only staff users can manage other accounts."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


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
