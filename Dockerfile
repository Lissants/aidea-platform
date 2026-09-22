# syntax=docker/dockerfile:1
#
# Multi-stage build producing a minimal runtime image using Next.js
# "standalone" output (next.config.mjs already sets `output: 'standalone'`).
# See COMPANY_SERVER_DEPLOYMENT.md for the full deployment walkthrough
# (env vars, Nginx reverse proxy, health checks, migrations, rollback).

# ---------------------------------------------------------------------
# 1. deps — install dependencies only (cached separately from source so
#    `npm install` doesn't re-run on every code change).
# ---------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------------------------------------------------------------------
# 2. builder — build the Next.js app. Build-time NEXT_PUBLIC_* vars must be
#    supplied here (they get baked into the client bundle) via --build-arg.
# ---------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------------------------------------------------------------------
# 3. runner — copy only the standalone output + static assets. Runs as a
#    non-root user. All secrets (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
#    etc.) are injected at RUN time, never baked into this image.
# ---------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# app/api/health/route.ts — used by the HEALTHCHECK, Nginx, and any
# orchestrator's liveness/readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
