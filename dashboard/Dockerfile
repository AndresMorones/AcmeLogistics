# syntax=docker/dockerfile:1.7

# SHA-pin all base layers — tag-only pulls drift silently and break reproducibility.
# Refresh: docker pull node:20-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:20-bookworm-slim
# Multi-stage (deps / builder / runner) keeps final image free of build toolchain + dev deps.
FROM node:20-bookworm-slim@sha256:CHANGEME AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-bookworm-slim@sha256:CHANGEME AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim@sha256:CHANGEME AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Drop privileges — Fly runtime should never execute user code as root.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# node -e probe avoids adding curl/wget to the slim image (smaller surface).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
