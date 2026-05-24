from __future__ import annotations

import io
from django.core.files.base import ContentFile
from PIL import Image, ImageOps

MAX_AVATAR_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
AVATAR_SIZE = 256


def validate_avatar_upload(uploaded_file) -> None:
    if uploaded_file.size > MAX_AVATAR_BYTES:
        raise ValueError("头像文件不能超过 5MB")
    content_type = getattr(uploaded_file, "content_type", "") or ""
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("仅支持 JPEG、PNG、WebP、GIF 图片")


def process_avatar_image(uploaded_file) -> ContentFile:
    """Center-crop to square, resize to 256px, save as WebP."""
    validate_avatar_upload(uploaded_file)
    uploaded_file.seek(0)
    with Image.open(uploaded_file) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        if img.mode == "RGBA":
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        else:
            img = img.convert("RGB")

        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=85, method=6)
        buf.seek(0)
        return ContentFile(buf.read(), name="avatar.webp")


def avatar_storage_name(user_id: int) -> str:
    return f"avatars/user_{user_id}.webp"
