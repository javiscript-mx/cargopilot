# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
# openssl es requerido por los engines de Prisma en Alpine
RUN apk add --no-cache openssl && npm install -g pnpm
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
# Copiamos los manifiestos del monorepo primero para aprovechar cache de capas
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ─── Development ──────────────────────────────────────────────────────────────
# Esta etapa la usa docker-compose en local.
# El código se monta como volumen, solo se copian node_modules.
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules 2>/dev/null || true
WORKDIR /app
EXPOSE 3001
CMD ["pnpm", "--filter", "@hm/api", "dev"]

# ─── Typecheck (gate de calidad del build de imagen) ─────────────────────────
FROM deps AS builder
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @hm/api db:generate
RUN pnpm --filter @hm/api build

# ─── Production ───────────────────────────────────────────────────────────────
# El API corre con tsx (TypeScript directo): @hm/shared exporta .ts crudo y así
# evitamos compilar/copiar la estructura interna de pnpm. Suficiente y robusto
# para esta etapa; si el arranque se vuelve crítico, bundlear con esbuild.
FROM base AS production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --prod
RUN pnpm --filter @hm/api db:generate
# Fuerza la etapa builder (typecheck) aunque no usemos su salida
COPY --from=builder /app/apps/api/package.json /tmp/.typecheck-ok

ENV NODE_ENV=production
EXPOSE 3001

# Migra y arranca
CMD ["sh", "-c", "pnpm --filter @hm/api db:migrate:deploy && pnpm --filter @hm/api exec tsx src/index.ts"]
