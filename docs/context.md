# 📋 Contexto del proyecto — SecretVault

> **Documento de handoff** para cualquier agente o desarrollador que tome este proyecto.
> Contiene: qué es, qué está implementado, decisiones técnicas y POR QUÉ, qué falta,
> convenciones de trabajo y lecciones aprendidas durante la construcción.
> Última actualización: 2026-11-09 · Estado: **verificado (tests/typecheck/lint verdes), sin commits iniciales**.
> Mantenimiento a cargo de Claude (ver [CLAUDE.md](../CLAUDE.md)). Pendientes: [TODO.md](TODO.md).

---

## 0. Cambios de la sesión de apropiación (2026-11-09)

Auditoría completa + endurecimiento. Resumen (detalle en [TODO.md](TODO.md)):

- **Solo este equipo**: `HOST=127.0.0.1` por defecto, compose publica `127.0.0.1:3000`, `hostGuard` (anti DNS-rebinding), `originGuard` (anti CSRF), CSP estricta y cabeceras de seguridad (`apps/api/src/middleware/security.ts`). El script de tema pasó a archivo externo (`theme-init.js`) por la CSP.
- **Atomicidad**: puerto `UnitOfWork` (`SqliteUnitOfWork`); rotación de contraseña e importación son transacciones (antes un fallo a medias podía corromper la bóveda).
- **AAD ligado a la fila** (`secretValueAad(envId, name)`): un blob ya no puede moverse entre secretos. Renombrar re-cifra. ⚠️ Cambia el formato: una `data/secrets.db` creada antes **no se puede descifrar**; bórrala (`data/`) para empezar limpio.
- **Base de datos**: migraciones versionadas (`PRAGMA user_version`), `CHECK` constraints, `synchronous=FULL`, `secure_delete`, `quick_check` al abrir, permisos restrictivos.
- PBKDF2 por defecto 310k → **600k** (OWASP). Sesión con vida máxima absoluta (12 h). Rate limiter: último salto de `X-Forwarded-For` y purga de buckets. Límite de body 2 MB.
- Docker: usuario no-root, imágenes `oven/bun:1.4.4` fijadas, `HOST=0.0.0.0` solo dentro del contenedor.
- Refactors: `verifyPassword` único (antes duplicado en unlock y rotación), `SecretService` descompuesto.
- `CLAUDE.md` + `.claude/` (hooks, reglas, skills, agentes).

## 1. Qué es SecretVault

Gestor de secretos y variables de entorno **100% local** (localhost, usuario único)
con cifrado fuerte en reposo. Monolito modular + Clean Architecture en un monorepo Bun.

- **Regla de oro**: los secretos nunca tocan disco en texto plano y la clave de
  cifrado nunca toca disco — solo vive en RAM durante la sesión desbloqueada.
- **UI**: http://localhost:3000 (producction, servida por Hono) o :5173 (dev, Vite).
- Idioma de la UI y de la documentación: español. Commits y nombres de tests: inglés.

## 2. Estado del entorno donde se construyó

| Herramienta    | Estado                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Bun            | **1.4.4** instalado globalmente vía `npm i -g bun` durante la sesión      |
| Node           | 22.16.0 (presente; NO necesario para el proyecto salvo `vue-tsc` y `npx`) |
| npm            | 10.9.2                                                                    |
| Docker Desktop | 28.5.1 — imagen `secretvault:latest` (446MB) construida y verificada      |
| Git            | repo inicializado en la raíz, **0 commits** (ver §12)                     |

⚠️ **Puerto 3000**: Docker Desktop (com.docker.backend.exe) puede mantener el
reenvío del puerto aunque el contenedor esté parado, y Windows permite doble-bind.
Si `bun run dev:api` parece usar config vieja, verificar con
`netstat -ano | grep :3000` quién escucha de verdad. Lección aprendida a las malas.

## 3. Estructura del monorepo

```
secretos_project/
├── apps/
│   ├── api/                       # Backend Bun + Hono (raíz de composición)
│   │   ├── src/
│   │   │   ├── index.ts           # Bootstrap: config → DI → Bun.serve + sweeper 30s
│   │   │   ├── app.ts             # Ensamble Hono: rutas, onError, notFound, SPA
│   │   │   ├── config.ts          # ApiConfig + loadDotEnv (multiplataforma, sin cross-env)
│   │   │   ├── container.ts       # ⭐ ÚNICO archivo que conoce implementaciones (DI)
│   │   │   ├── session-store.ts   # InMemorySessionStore (claves en RAM, zeroKey)
│   │   │   ├── rate-limiter.ts    # Ventana fija por IP (reloj inyectable para tests)
│   │   │   ├── middleware/auth.ts # requireUnlocked (touch + renovación de cookie)
│   │   │   ├── routes/            # vault | environments | secrets | audit (.routes.ts)
│   │   │   ├── http/              # helpers (JSON no-store, cookies) + static (SPA server)
│   │   │   └── export/            # csv.ts + pdf.ts (PDF generado a mano, 0 dependencias)
│   │   └── tests/                 # unit + integration + security (ver §8)
│   └── web/                       # Frontend Vue 3 + Vite + Tailwind v4 + Pinia
│       └── src/ (components/ layout/ ui/ vault/ · stores/ · lib/ · views/)
├── packages/
│   ├── shared/                    # Shared kernel: DTOs HTTP, constantes, validación, parser .env
│   ├── core/                      # ⭐ Dominio + puertos + casos de uso (CERO frameworks)
│   │   └── src/{domain,ports,usecases}/
│   ├── crypto/                    # Implementa puerto de cripto (node:crypto)
│   └── database/                  # Implementa puertos de persistencia (bun:sqlite)
├── tests/architecture.spec.ts     # ArchUnit del monorepo (20 reglas)
├── docs/                          # README (raíz) · TESTING.md · SECURITY.md · context.md
├── Dockerfile · docker-compose.yml
└── .husky/ · eslint.config.mjs · .prettierrc · commitlint.config.ts · lint-staged.config.mjs
```

**~95 archivos TS/Vue** · 280+ tests.

## 4. Reglas de arquitectura (ENFORZADAS por tests)

```
web ──(solo HTTP)──► api ──► core ──► shared
                      │        ▲
                      │        └── implementado por: crypto, database
                      └── solo container.ts importa crypto/database
```

Verificadas en `tests/architecture.spec.ts` (fallan el build si se violan):

1. `shared` no depende de NADA (ni workspace ni externos).
2. `core` solo depende de `shared` — jamás `hono`, `bun:*`, `vue`, `node:*`,
   `@secretvault/crypto` o `@secretvault/database`.
3. `crypto` solo: core + shared + `node:crypto`. No conoce persistencia ni HTTP.
4. `database` solo: core + shared + `bun:sqlite` + node estándar. No conoce cripto ni HTTP.
5. `api`: **solo `container.ts`** importa `@secretvault/database`; las rutas nunca
   importan implementaciones (solo core + shared).
6. `web` solo: `shared`, `vue`, `vue-router`, `pinia` y APIs del navegador.
7. Sin imports relativos que crucen paquetes · sin ciclos por paquete.
8. Naming: `*-service.ts` (use cases) · `*-repository.ts` (repos) · `*.routes.ts`.

Si agregas algo que rompe esto, el test te lo dirá — es intencional.

## 5. Diseño criptográfico (leer antes de tocar auth)

Cifrado de envoltura (ADR-0006):

```
Contraseña ──PBKDF2(≥100k, sal 16B)──► KEK_pw ──┐
                                                 ├─ AES-GCM envuelven ──► DEK (256 bits aleatoria)
Clave de recuperación ──HKDF-SHA256──► KEK_rec ──┘                          │
                                                                              ▼
        SessionStore (Map en RAM): solo aquí vive la DEK      AES-256-GCM(secretos, notas, verificador)
              │ lock / inactividad / cierre → zeroKey(dek.fill(0))
              ▼
   secrets.db — blobs cifrados + DEK envuelta ×2 + nombres de variables (metadata de búsqueda)
```

Blob AES-GCM: `[IV 12B][AuthTag 16B][Ciphertext]`; AAD por contexto (`core/ports/crypto.ts`):
`AAD_SECRET_VALUE/NOTE` (+ ambiente y nombre) · `AAD_VERIFIER` · `AAD_DEK_MASTER` · `AAD_DEK_RECOVERY`.

Decisiones y por qué:

- **Verificador**: el texto constante `VERIFIER_PLAINTEXT` cifrado con la DEK. Abrir la bóveda =
  derivar la KEK, desenvolver la DEK (el tag GCM autentica) y **comparar el texto** del verificador.
  Hay UN solo punto de verificación (`VaultService.openWithPassword`); no lo dupliques.
- **Clave de recuperación**: 256 bits aleatorios, texto Crockford base32 (`shared/recovery-key.ts`),
  se muestra UNA vez y no se guarda. Usarla (`recover`) la **reemplaza** por otra nueva. Regenerarla
  (`regenerateRecoveryKey`) exige la contraseña actual e invalida la anterior.
- **Cambio de contraseña**: solo re-envuelve la DEK con una KEK nueva (nueva sal); la DEK y los
  secretos no cambian. Una fila + auditoría en un `UnitOfWork`.
- **Bóvedas de formato 1**: la clave derivada ES la DEK. Al desbloquear se actualizan a formato 2
  (nueva sal, DEK envuelta, clave de recuperación) sin re-cifrar secretos; el cliente recibe la clave
  nueva en la respuesta de `unlock` (única vez). `formatVersion` vive en `vault_meta`.
- **AAD por campo Y por fila**: `secretValueAad(environmentId, name)` /
  `secretNoteAad(...)`. Un blob no puede reinyectarse como nota, como verificador ni en OTRA fila
  (el tag GCM falla). Consecuencia: renombrar un secreto lo re-cifra. Campo nuevo sensible → AAD
  propio + tests de AAD cruzado.
- **PBKDF2**: default 600k (OWASP); `deriveKey` rechaza < 100k (anti-downgrade).
- **Honestidad**: JS no garantiza borrado criptográfico de RAM; zeroKey reduce la
  ventana. Documentado en SECURITY.md — no prometer más de eso.

## 6. Modelo de datos (SQLite — `packages/database/src/sqlite.ts`)

```sql
vault_meta(id=1: salt, iterations, verifier, created_at, updated_at)
projects(id, name UNIQUE COLLATE NOCASE, created_at, updated_at)  -- 'General' por defecto
environments(id, project_id FK RESTRICT, name UNIQUE(project,name) COLLATE NOCASE, created_at, updated_at)
secrets(id, environment_id FK CASCADE, name UNIQUE(env,name) COLLATE NOCASE,
        value_enc BLOB, note_enc BLOB NULL, created_at, updated_at)
audit_log(id, type, message, created_at)  -- podado a 1000 eventos (AUDIT_MAX_EVENTS)
```

- WAL + foreign_keys ON + **synchronous FULL** + secure_delete + busy_timeout. `quick_check`
  al abrir. Esquema por **migraciones versionadas** (`migrations.ts`, `PRAGMA user_version`).
  Transacciones vía `UnitOfWork`. Ver `.claude/rules/database.md`.
- Búsqueda por nombre: `instr(lower(name), lower(?))` — substring literal, **no**
  comodines LIKE (testado: `%` y `_` son literales).
- Fechas como ISO-8601 strings; blobs como Uint8Array.

## 7. Modelo de sesiones / auth

- `POST /api/vault/setup` (solo si no existe bóveda) → crea ambiente `Local` + cookie.
- `POST /api/vault/unlock` → deriva la KEK, desenvuelve la DEK, valida verificador, crea sesión
  (y, si la bóveda era de formato 1, la actualiza y devuelve su clave de recuperación).
- `POST /api/vault/recover` (pública, rate limit 10/15 min) → clave de recuperación + contraseña nueva.
- `POST /api/vault/recovery-key` (sesión + contraseña actual) → regenera la clave de recuperación.
- Cookie `sv_session`: HttpOnly, SameSite=Lax, Path=/, `Secure` si `SV_COOKIE_SECURE=true`.
- Cada request autenticado hace `touch` (ventana deslizante) y renueva la cookie.
- **Auto-lock**: TTL por inactividad (15 min default); sweeper cada 30s en index.ts.
- **Rate limit por IP**: unlock 10/5min, setup 20/10min, change-password 10/15min →
  429 con Retry-After. Contador se resetea al éxito.
- Allowlist de rutas públicas (decisión de seguridad, en
  `apps/api/tests/security/protected-routes.spec.ts`): `GET /api/health`,
  `GET /api/vault/status`, `POST /api/vault/setup|unlock|lock`. **Agregar una ruta
  pública = actualizar ROUTE_MANIFEST + revisión de seguridad.**

## 8. Testing (280+ tests · 0 fallos)

**Runner: `bun test` — API idéntica a Jest** (`describe/it/expect/jest.fn`).
⚠️ NO migrar a Jest/Node: `bun:sqlite` no existe allí. Documentado en docs/TESTING.md.

| Suite                        | Archivos | Qué cubre                                                                                                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/tests/`     | 3        | validaciones, parser .env (hostil incl.), códigos de error                                                                                         |
| `packages/core/tests/`       | 4        | use-cases con mocks tipados (helpers/mocks.ts)                                                                                                     |
| `packages/crypto/tests/`     | 1        | **cripto real**: round-trip, tamper GCM, AAD, PBKDF2 floor                                                                                         |
| `packages/database/tests/`   | 1        | repos SQLite `:memory:`, UNIQUE/CASCADE, búsqueda, poda                                                                                            |
| `apps/api/tests/`            | 6        | sesiones (zeroKey/rotación), rate-limiter, config+`.env`, export (env/csv/estructura PDF), estáticos (MIME/traversal/SPA), integración E2E sin red |
| `apps/api/tests/security/`   | 3        | OWASP A01–A09 + allowlist de rutas + escaneo anti-drift                                                                                            |
| `apps/web/tests/`            | 1        | utilidades puras del frontend                                                                                                                      |
| `tests/architecture.spec.ts` | 1        | 20 reglas de arquitectura                                                                                                                          |

Comandos: `bun test` · `bun run test:cov` · `test:architecture` · `test:security` ·
`test:watch`. Tests de integración usan `app.request()` de Hono (sin abrir puerto) y
SQLite/SPA en `os.tmpdir()` con limpieza en `afterAll`.

**Bugs que la suite ya atrapó (no regresarlos)**:

1. `safeJoin` de static.ts bloqueaba TODAS las rutas absolutas → ningún asset se servía.
2. `changeMasterPassword` sin comparación del texto del verificador.
3. UNIQUE de `secrets.name` no case-insensitive (faltaba COLLATE NOCASE en columna).
4. `Cache-Control: no-store` faltante en /api/health y 404s del API.

## 9. Tooling de calidad

- **Husky v9** (`.husky/`, core.hooksPath ya configurado por `husky init`):
  - `pre-commit` → `bunx lint-staged` (prettier + eslint --fix + `bun run typecheck`)
  - `commit-msg` → `bunx commitlint --edit "$1"` (Conventional Commits, **inglés**,
    subject ≤72, body ≤100, tipos: feat|fix|chore|docs|refactor|test|style|perf|ci|build)
  - `pre-push` → typecheck + `bun test`
  - ⚠️ Los hooks usan `bunx` (npx NO resuelve con el linker aislado de Bun).
  - ⚠️ Los hooks NO se han disparado aún: no hay commits (§12).
- **ESLint 9 flat** (`eslint.config.mjs`): typed-linting con `projectService`
  (tsconfig más cercano por archivo; tsconfig.json raíz cubre configs + architecture test).
  Límites Clean Code como warns: max-params 3, func 30 líneas, complexity 8, depth 3.
  En tests: reglas type-aware OFF (los typings de bun:test no dan para typed-lint).
  Estado: **0 errores, ~27 warnings** (informativos; casi todos `max-lines-per-function` en rutas/stores).
- **Prettier**: singleQuote, printWidth 100, semi, trailingComma all. Ya aplicado a todo.
- **Root `tsconfig.json`**: solo para `commitlint.config.ts`, `eslint.config.mjs`,
  `lint-staged.config.mjs` y `tests/**`. No poner código de app ahí.
- **`HUSKY=0` en el Dockerfile** (etapa build): sin .git, husky rompería `bun install`.

## 10. Configuración (variables de entorno)

Carga: **entorno real > `.env` > defaults**. `loadDotEnv` (apps/api/src/config.ts)
busca el primer `.env` desde cwd hacia arriba (máx 4 niveles), también sirve al
binario compilado; `SV_ENV_FILE=ruta` para apuntar a otro archivo. Soporta BOM,
comillas, comentarios y `export `. Plantilla: `.env.example`.

| Variable               | Default   | Nota                                                        |
| ---------------------- | --------- | ----------------------------------------------------------- |
| `PORT`                 | 3000      | clamped 1–65535                                             |
| `HOST`                 | 127.0.0.1 | solo este equipo (Docker: 0.0.0.0 interno + mapeo loopback) |
| `SV_ALLOWED_HOSTS`     | —         | hosts extra aceptados en Host/Origin (loopback siempre)     |
| `SV_MAX_BODY_KB`       | 2048      | tamaño máximo del body (16–20480)                           |
| `SV_SESSION_MAX_HOURS` | 12        | vida máxima absoluta de sesión (1–168)                      |
| `SV_DATA_DIR`          | ./data    | donde vive secrets.db (Docker: /app/data)                   |
| `SV_PUBLIC_DIR`        | ./public  | SPA compilada (Vite escribe a apps/api/public)              |
| `SV_AUTO_LOCK_MINUTES` | 15        | clamp 1–1440                                                |
| `SV_PBKDF2_ITERATIONS` | 600000    | clamp 100k–2M (suelo duro en crypto)                        |
| `SV_COOKIE_SECURE`     | false     | true detrás de HTTPS                                        |
| `SV_TRUST_PROXY`       | false     | respeta X-Forwarded-For                                     |
| `SV_ENV_FILE`          | —         | ruta explícita de .env                                      |

**No se necesita cross-env**: el shell de scripts de Bun interpreta `VAR=x comando`
de forma nativa en Windows/Linux/macOS (verificado). Para config persistente usar `.env`.

## 11. Docker

- **Dockerfile multi-stage**: `oven/bun:1` (build: `bun install --frozen-lockfile`,
  Vite bajo runtime Bun — la imagen no tiene Node — y `bun build --compile` → binario
  autocontenido) → `oven/bun:1-slim` (solo binario + public/, ~446MB).
- **docker-compose.yml**: puerto único 3000:3000, volumen NAMED
  `secretvault-data:/app/data` (alternativa bind-mount comentada), healthcheck con
  `bun -e fetch`, restart unless-stopped.
- Verificado: build (32s), arranque, healthcheck, **persistencia del volumen tras
  `docker restart`** y cero texto plano en el volumen.
- Estado actual: imagen `secretvault:latest` existe; contenedor y volumen fueron
  ELIMINADOS (pruebas). Relanzar con `docker compose up -d --build`.

## 12. ⚠️ PENDIENTE

La lista viva y priorizada está en **[TODO.md](TODO.md)**. Lo esencial:

1. **NO HAY COMMITS AÚN** (todo untracked). Presentar plan de commits y esperar confirmación
   explícita del usuario antes de cualquier `git commit` (Conventional Commits en inglés, sin
   metadata de IA). Aún no existe el repositorio remoto.
2. CI/CD y flujo de ramas/releases: ya definidos (`.github/`, `docs/GIT_WORKFLOW.md`); pendiente
   el primer push y tag `v0.1.0` (repo: github.com/cesar-martinez-fullstack/secrets-env-project).
3. Refactors de arquitectura pendientes (Strategy de exportadores, Value Objects, presenters,
   Clock, alias de imports) y tests de frontend: ver TODO.
4. `.env`: solo se carga el PRIMER `.env` encontrado (cwd → arriba); no se mergean niveles.
5. PDF: fuentes base WinAnsi; caracteres fuera de latin-1 se sustituyen por `?`.
6. `bun run build` regenera `dist/` y `apps/api/public` (ambos gitignored).

## 13. Convenciones de trabajo (formalizadas en [CLAUDE.md](../CLAUDE.md) y `.claude/rules/`)

1. Analizar antes de escribir; tras cambios en `.ts` correr `bun test` y
   `bun run typecheck` — no reportar tarea completa con errores.
2. Tras tocar auth/crypto/rutas nuevas → checklist OWASP (docs/SECURITY.md §checklist)
   y reportar "OWASP review: sin hallazgos" o hallazgos con severidad. CRÍTICO/ALTO
   sin resolver = tarea NO completa.
3. Commits: Conventional Commits en inglés, sin metadata de IA, plan presentado al
   usuario y confirmación explícita antes de `git commit`.
4. No agrupar cambios no relacionados en un commit.
5. No ignorar warnings del IDE ni warnings de ESLint sin decidir (hoy: 32 warns
   aceptados como informativos).

## 14. Cheatsheet de comandos

```bash
bun install                # deps del monorepo (bun.lock committed)
bun run dev                # API :3000 + Vite :5173 en paralelo (concurrently)
bun run dev:api            # solo API con --watch (vigila TODO el monorepo)
bun run dev:web            # solo Vite
bun test                   # suite completa (~3s)
bun run test:cov           # cobertura (97.3% líneas)
bun run test:architecture  # ArchUnit del monorepo
bun run test:security      # suite OWASP
bun run build              # Vite → apps/api/public + binario → dist/
bun run start              # API desde código (sirve SPA si apps/api/public existe)
docker compose up -d --build
docker compose down -v     # ⚠️ borra la bóveda completa
bun run lint / format      # eslint --fix / prettier --write
bunx commitlint            # valida mensaje por stdin
```

## 15. Flujo de datos clave (para orientarse rápido)

- **Setup/Unlock**: ruta vault → `VaultService` (core) → `NodeCryptoService` (crypto)
  - `SqliteVaultRepository` → sesión en `InMemorySessionStore` → cookie en helpers.
- **CRUD secreto**: ruta secrets → `SecretService` → cifra con la clave de la sesión
  (`c.get('session').key`) → repo → auditoría. El listado SIEMPRE enmascarado
  (`MASKED_VALUE` constante); valor real solo por `POST /:id/reveal` (auditado).
- **Búsqueda global**: `GET /api/secrets?q=...` sin environmentId → todos los ambientes.
- **Export**: ruta secrets/export → `SecretService.exportEntries` (descifra) →
  builder de formato (env/csv/pdf en apps/api/src/export) → Response attachment.
- **Frontend**: stores (vault=status/auth, data=envs+secrets+búsqueda con debounce
  220ms, theme, toast) → `lib/api.ts` (fetch tipado; emite `sv:locked` en 401
  VAULT_LOCKED → main.ts redirige a unlock). Router guarda rutas privadas.
- **Errores**: core lanza `DomainError(code, message, status, issues)` →
  `app.onError` lo traduce a `{ error: { code, message, issues } }` con su status.
  Códigos estables en shared/error-codes.ts (el frontend los consume).

## 16. Historial de verificación manual (ya hecho, no repetir)

- E2E con curl real: 23 pruebas (setup→unlock→CRUD→búsqueda→import→reveal→export→audit→lock→rotación).
- `grep` de secretos/contraseñas sobre secrets.db y WAL: **0 ocurrencias** en texto plano.
- Rotación: contraseña vieja rechazada, nueva funciona, datos intactos.
- PDF validado con pypdf (páginas, metadata, contenido, pie).
- Binario compilado (`bun build --compile`) arranca y sirve el SPA.
- Docker: build multi-stage OK (32s), contenedor sano, volumen persistente tras restart.
- Hooks: lint-staged y commitlint probados con archivos staging reales (sin commits).
