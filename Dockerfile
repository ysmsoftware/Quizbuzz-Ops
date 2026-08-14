# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time — a
# runtime `docker run -e` or docker-compose `environment:` entry does NOT
# reach them, only a build ARG does. Must be passed via --build-arg (see
# .github/workflows/deploy.yml) whenever this changes per environment.
ARG NEXT_PUBLIC_MAIN_APP_URL
ENV NEXT_PUBLIC_MAIN_APP_URL=$NEXT_PUBLIC_MAIN_APP_URL

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public directory and standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server ./server
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Install Prisma CLI + deps for `prisma migrate deploy` and standalone worker
# process. Must run BEFORE the generated-client copy below, into an
# otherwise-empty node_modules/@prisma — if @prisma/config is already
# present when this runs, npm treats it as already-satisfied and skips
# installing its own transitive deps (effect, c12, deepmerge-ts, empathic),
# which crashes `prisma migrate deploy` at runtime with "Cannot find module
# 'effect'". Version pinned to match package.json's own prisma range so this
# step can't silently drift to whatever Prisma happens to publish on a given
# build day — see DECISIONS.md for the incident this fixed.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
RUN npm install --no-save prisma@^7.8.0 dotenv tsx typescript && npm cache clean --force

# Overlay the already-generated Prisma Client (schema-specific output from
# `npx prisma generate` in the builder stage) on top of the fresh install
# above — must come after, so the correctly-generated client always wins.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
