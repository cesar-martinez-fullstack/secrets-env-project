# syntax=docker/dockerfile:1

# ═══════════════════════════════════════════════════════════════════════
#  SecretVault — build multi-stage
#  Etapa 1: instala dependencias del monorepo y compila frontend + backend
#  Etapa 2: imagen ligera con el binario compilado y el SPA estático
# ═══════════════════════════════════════════════════════════════════════

# ── Etapa 1: compilación ──────────────────────────────────────────────
FROM oven/bun:1.4.4 AS build
WORKDIR /app
# El contenedor no es un repo git: evita que `bun install` ejecute husky.
ENV HUSKY=0

# 1. Manifiestos primero: maximiza la caché de capas de Docker.
COPY package.json bun.lock ./
COPY apps/api/package.json   apps/api/
COPY apps/web/package.json   apps/web/
COPY packages/shared/package.json    packages/shared/
COPY packages/core/package.json      packages/core/
COPY packages/crypto/package.json    packages/crypto/
COPY packages/database/package.json  packages/database/

RUN bun install --frozen-lockfile

# 2. Resto del código fuente.
COPY . .

# 3. Frontend: Vite corre bajo el runtime de Bun (la imagen no incluye Node;
#    Bun reescribe los shebangs de node automáticamente).
RUN bun run --cwd apps/web build

# 4. Backend: binario ejecutable autocontenido (runtime Bun + SQLite embebidos,
#    ~115 MB) — no requiere bun ni node instalados en producción.
RUN bun build --compile --minify --sourcemap=none \
      --target bun \
      apps/api/src/index.ts \
      --outfile /out/secretvault

# ── Etapa 2: producción ───────────────────────────────────────────────
FROM oven/bun:1.4.4-slim AS production

WORKDIR /app

COPY --from=build --chown=bun:bun /out/secretvault        /app/secretvault
COPY --from=build --chown=bun:bun /app/apps/api/public    /app/public

# Directorio de datos persistente (SQLite vive aquí, FUERA de la imagen).
# HOST=0.0.0.0 es necesario DENTRO del contenedor; el aislamiento real lo da el
# mapeo 127.0.0.1:3000 de docker-compose.yml (no publiques el puerto en 0.0.0.0).
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    SV_DATA_DIR=/app/data \
    SV_PUBLIC_DIR=/app/public

# Usuario sin privilegios (la imagen oficial de Bun trae el usuario `bun`).
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

VOLUME ["/app/data"]
EXPOSE 3000

# Healthcheck con el runtime Bun incluido en la imagen (sin curl/wget).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:3000/api/health'); if (!r.ok) process.exit(1)"]

ENTRYPOINT ["/app/secretvault"]
