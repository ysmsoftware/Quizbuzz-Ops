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
# TEMPORARY — one-off bulk import data for scripts/import-colleges-from-csv.ts. Remove this
# line AND delete Colleges_Structured.csv from the repo root in the same commit once the
# production import has been run; don't let this COPY outlive the file it's copying.
COPY --from=builder /app/Colleges_Structured.csv ./Colleges_Structured.csv

COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Full node_modules (incl. the Prisma Client generated in the builder stage),
# copied over the standalone output's traced subset. Only the web server
# (`node server.js`) is covered by Next's standalone tracing — which keeps just
# the files pages/API routes import, e.g. 1 of ioredis's ~90 files. Everything
# else run from this image needs real packages: the ops-worker container
# (`tsx scripts/worker.ts` → bullmq/ioredis/nodemailer), `prisma migrate deploy`,
# and scripts/*. The old approach — `npm install --no-save <a few pkgs>` on top
# of the traced subset — silently skipped any package whose traced folder was
# already present, so the worker crashed at boot with "Cannot find module
# 'ioredis/built/utils'" and never sent a single message.
# ponytail: ships devDependencies too (tsx/prisma/typescript are needed at
# runtime anyway); a dedicated worker image is the upgrade if size matters.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
