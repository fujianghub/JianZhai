# Frontend Dockerfile — multi-stage build → Caddy serves the result.
#
# Stage 1: build the SPA with pnpm.
# Stage 2: copy dist/ + Caddyfile into an alpine caddy image.
#
# The final container handles BOTH:
#   - serving the React build (static files + SPA fallback)
#   - reverse-proxying /api/* /media/* /feed.xml /sitemap.xml to backend
#
# So docker-compose only needs ONE caddy service — no separate nginx
# or frontend-server container.
#
# Build context is project root.

# ── Stage 1: build SPA ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm via corepack — pins to the version recorded in package.json.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Cache layer for deps.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Now the actual sources.
COPY frontend/ ./

# Type-check then build.  Build sets VITE_API_BASE_URL to a relative
# path so the SPA hits the same origin as itself (Caddy then proxies
# /api/* to the django container).
ENV VITE_API_BASE_URL=/api/v1 \
    VITE_MEDIA_BASE_URL=/media
RUN pnpm tsc --noEmit && pnpm build

# ── Stage 2: caddy serves /srv + reverse-proxies /api ─────────────────
FROM caddy:2-alpine

# Inline the Caddyfile so the image is fully self-contained.
COPY infra/Caddyfile /etc/caddy/Caddyfile

# Built React SPA → /srv (referenced as ``root`` in Caddyfile).
COPY --from=builder /app/dist /srv

# Make sure access logs land somewhere — Caddy writes JSON to stdout
# by default, which docker-compose forwards.
EXPOSE 80 443
