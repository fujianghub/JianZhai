from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import UserViewSet, csrf, login_view, logout_view, session

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")

urlpatterns = [
    path("csrf/", csrf, name="auth-csrf"),
    path("session/", session, name="auth-session"),
    path("login/", login_view, name="auth-login"),
    path("logout/", logout_view, name="auth-logout"),
    path("", include(router.urls)),
]
