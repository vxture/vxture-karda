# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js standalone app in a pnpm workspace.
# Build context = repo root (so the workspace and lockfile are visible).
# Produces the single owned image <code>-app.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# --- deps + build ---
FROM base AS builder
WORKDIR /repo
COPY . .
# The GitHub Packages token (for @vxture/*, e.g. @vxture/shared - TD-001) rides
# a BuildKit secret - never a build-arg, never baked into a layer. pnpm 11 no
# longer expands ${NODE_AUTH_TOKEN} in the project .npmrc, so the token is
# written to /root/.npmrc for the install and removed in the SAME layer.
ARG VXTURE_NPM_REGISTRY
RUN --mount=type=secret,id=node_auth_token \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    set -e; \
    token="$(cat /run/secrets/node_auth_token 2>/dev/null || true)"; \
    if [ -n "$token" ]; then \
      printf '//npm.pkg.github.com/:_authToken=%s\n' "$token" >> /root/.npmrc; \
    fi; \
    pnpm install --frozen-lockfile; \
    rm -f /root/.npmrc
RUN pnpm --filter @karda/app build

# --- runner (Next standalone, non-root, never migrates) ---
FROM base AS runner
WORKDIR /app
# Build provenance (025 section 4.1): honest ARG defaults so an un-injected build
# still reports truthfully (dev/unknown), never a fabricated version. Read at
# RUNTIME by the liveness route - server-side env, NOT NEXT_PUBLIC (stays out of
# the client bundle). HOSTNAME=0.0.0.0 keeps loopback healthchecks reachable
# (020 section 3: Next standalone otherwise binds the container ID only).
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG DEPLOY_STAGE=dev
ENV NODE_ENV=production PORT=3240 HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_TIME=${BUILD_TIME} \
    DEPLOY_STAGE=${DEPLOY_STAGE}
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# The filesystem object-store root, owned by the RUNTIME user.
#
# It has to exist in the image, not just in a compose mount: Docker seeds a new
# named volume from the image's directory, ownership included, so a volume
# mounted at a path the image never created lands root-owned and the non-root
# runtime cannot write to it. The symptom is not an error at boot - uploads
# accept the file and every later read answers `object_missing`.
#
# Only the filesystem tier needs this; prod runs on OSS (KD-019 selection order
# is OSS -> KARDA_OBJECT_ROOT -> in-memory).
RUN mkdir -p /var/lib/karda/objects && chown -R nextjs:nodejs /var/lib/karda
COPY --from=builder /repo/portals/app/.next/standalone ./
COPY --from=builder /repo/portals/app/.next/static ./portals/app/.next/static
COPY --from=builder /repo/portals/app/public ./portals/app/public
USER nextjs
# R3: the in-container port IS the allocated number (3240); the host publish
# port is the compose-level variable.
EXPOSE 3240
CMD ["node", "portals/app/server.js"]
