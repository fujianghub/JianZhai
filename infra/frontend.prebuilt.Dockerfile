# Frontend Dockerfile (prebuilt variant) — packages an SPA that was
# already built on a beefier machine.
#
# Why this exists: ``pnpm tsc && pnpm build`` needs ~2.5 GB of Node heap,
# which OOMs on a 2 GB production box.  Build ``frontend/dist`` locally
# (``VITE_API_BASE_URL=/api/v1 VITE_MEDIA_BASE_URL=/media pnpm build``),
# rsync it to the server, then select this file via ``CADDY_DOCKERFILE``
# in ``.env.prod``:
#
#   CADDY_DOCKERFILE=infra/frontend.prebuilt.Dockerfile
#
# Build context is project root, same as frontend.Dockerfile.

FROM caddy:2-alpine

# Inline the Caddyfile so the image is fully self-contained.
COPY infra/Caddyfile /etc/caddy/Caddyfile

# Pre-built React SPA → /srv (referenced as ``root`` in Caddyfile).
COPY frontend/dist /srv

EXPOSE 80 443
