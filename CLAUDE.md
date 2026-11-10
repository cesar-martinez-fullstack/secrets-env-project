# CLAUDE.md

Guía para Claude Code en este repositorio. **SecretVault** es un gestor personal de secretos y
variables de entorno: un solo usuario, **solo accesible desde este equipo**, cifrado en reposo.
El mantenimiento y la evolución del proyecto están a cargo de Claude: se espera criterio de
ingeniería profesional, no solo "que compile".

Arquitectura (C4, trade-offs, qué NO hacemos): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
Decisiones: [docs/adr/](docs/adr/README.md) (ADR para todo lo difícil de revertir).
Contexto detallado: [docs/context.md](docs/context.md) · Seguridad: [docs/SECURITY.md](docs/SECURITY.md) ·
Testing: [docs/TESTING.md](docs/TESTING.md) · Pendientes: [docs/TODO.md](docs/TODO.md).

## Comandos

```bash
bun install               # dependencias (bun.lock versionado)
bun run dev               # API :3000 + Vite :5173
bun test                  # toda la suite (usa bun:test; NO migrar a Jest: bun:sqlite no existe en Node)
bun run typecheck         # tsc en cada paquete
bun run lint:check        # eslint (0 errores obligatorio)
bun run test:architecture # reglas de capas
bun run test:security     # suite OWASP + perímetro
bun audit                 # vulnerabilidades de dependencias
docker compose up -d --build   # despliegue (puerto SOLO en 127.0.0.1)
```

## Reglas de comportamiento

1. **Analizar antes de escribir.** Usa la skill `architecture-review`: capa, nombre, dirección de
   dependencias. Prefiere TDD: test que falla → implementación → refactor.
2. **Tras cada cambio en `.ts`** el hook corre `tests/architecture.spec.ts`. Si hay ❌, corregir antes
   de seguir. Tras tocar configs (`tsconfig`, `package.json`, `eslint`) corre `bun run typecheck`.
3. **Al terminar cualquier tarea:** `bun test` + `bun run typecheck` + `bun run lint:check`, todo en
   verde. Nunca declarar "listo" con errores; reportar los warnings que se decidió no tratar.
4. **Código sensible** (auth, cripto, sesiones, rutas, migraciones, config): ejecutar la skill
   `owasp-security-review` y reportar explícitamente _"OWASP review: sin hallazgos"_ o la lista con
   severidad. Un hallazgo CRÍTICO/ALTO sin resolver = tarea NO terminada.
5. **Honestidad técnica:** no prometer garantías que el código no da (p. ej. borrado de RAM en JS).
   Si un doc afirma algo que el código no cumple, se corrige el doc o el código en el mismo cambio.
6. **Sin sobre-ingeniería (YAGNI):** un patrón de diseño se introduce cuando resuelve un problema
   concreto de hoy (ver skill `design-patterns`), no por "elegancia". Es un monorepo de un solo
   usuario; la arquitectura debe permitir escalar, no anticiparlo.
7. **Nunca leer ni imprimir secretos reales:** `.env`, `data/`, `*.db` están vedados (permisos + hooks).
   Para depurar la base de datos usa tests con SQLite `:memory:`.

## Arquitectura (resumen)

Monolito modular, Clean Architecture / puertos y adaptadores, en monorepo Bun:

```
web ──HTTP──► api ──► core ──► shared
                │       ▲
                │       └─ implementado por: crypto, database
                └─ solo container.ts conoce las implementaciones (composition root)
```

- `core`: dominio + puertos + casos de uso. **Cero** frameworks (ni hono, bun:_, node:_, vue).
- `crypto` / `database`: adaptadores que implementan puertos de `core`.
- `api`: Hono. Rutas finas (parsear → llamar caso de uso → presentar). Sin lógica de negocio.
- `web`: Vue 3 + Pinia; habla con el API solo por HTTP.
- Las reglas están **ejecutándose** en `tests/architecture.spec.ts`; si necesitas romperlas, el test
  es la conversación a tener con el usuario, no un obstáculo a esquivar.

## Invariantes de seguridad (no negociables)

- **Solo este equipo:** `HOST` por defecto `127.0.0.1`; compose publica `127.0.0.1:3000`; middleware
  `hostGuard` (anti DNS-rebinding) y `originGuard` (anti CSRF). Nunca `0.0.0.0` en el host.
- La clave de datos (DEK) y las KEK **solo viven en RAM** (`InMemorySessionStore`); en disco solo quedan
  versiones envueltas. Nunca se persisten ni se loguean, tampoco la clave de recuperación (se muestra una vez).
- Un solo punto de verificación de contraseña (`VaultService.openWithPassword`) y uno de recuperación
  (`openWithRecovery`); no dupliques esa lógica. Cualquier cambio de formato cifrado → ADR + migración.
- Todo blob cifrado lleva **AAD ligado a su fila** (`secretValueAad`/`secretNoteAad`). Campo sensible
  nuevo → AAD propio + tests de round-trip y de AAD cruzado.
- Rutas nuevas: protegidas por `requireUnlocked`; públicas solo si se añaden al `ROUTE_MANIFEST`
  de `protected-routes.spec.ts` con revisión de seguridad.
- Los mensajes de auditoría y de error **nunca** incluyen valores de secretos ni la contraseña.
- Sin CSP laxa: nada de scripts inline (`script-src 'self'`).

## Base de datos (ACID)

- Esquema **solo** por migraciones versionadas (`packages/database/src/migrations.ts`); jamás editar
  una migración ya aplicada. Constraints (CHECK/UNIQUE/FK) como última defensa.
- Operaciones multi-escritura (rotación, importación) van en `UnitOfWork.run` (atomicidad).
- Repositorios: SQL parametrizado siempre; cero interpolación de strings con datos de usuario.
- Un cambio de formato de cifrado/AAD implica plan de migración de datos y nota en `docs/context.md`.

## Convenciones

- TypeScript estricto. Archivos: `*-service.ts`, `*-repository.ts`, `*.routes.ts`, `*.spec.ts`.
- Docs y UI en español; commits y nombres de tests (`it('should ...')`) en inglés.
- Comentarios solo para el **por qué** no obvio; nada de comentarios de tarea.
- Prettier + ESLint obligatorios (hooks de Husky). Límites de Clean Code como warnings: no añadir
  warnings nuevos sin justificar.
- Detalle por tema en `.claude/rules/`.

## Git

Repositorio público: <https://github.com/cesar-martinez-fullstack/secrets-env-project>.
Flujo completo en [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) y `.claude/rules/git-workflow.md`.

- **Usar WSL para todo lo que hable con GitHub** (`wsl.exe bash -lc 'cd /mnt/c/Users/alienware/Desktop/secretos_project && git …'`).
  La cuenta de Git de Windows apunta a otro repositorio; las credenciales correctas (`gh` como
  `cesar-martinez-fullstack`) están en WSL. La identidad local del repo es el correo _noreply_ de
  GitHub; **nunca** usar el correo de trabajo.
- **Git Flow:** `main` (releases, con tags `vX.Y.Z` anotados) · `develop` (integración) ·
  `feature/*`, `fix/*` (desde `develop`) · `release/X.Y.Z` · `hotfix/X.Y.Z` (desde `main`).
  No se commitea directo en `main`/`develop` (hook). PRs a `develop`; merges con `--no-ff`.
- Conventional Commits **en inglés**, minúsculas, `type(scope): description`, asunto ≤72 caracteres.
  Tipos: feat, fix, chore, docs, refactor, test, style, perf, ci, build.
- **Commits cortos:** sin cuerpo salvo que el _porqué_ no sea obvio; si lo hay, ≤3 líneas de ≤72 columnas.
- **Sin autoría ni atribución de IA** en commits, PRs, issues o releases: ni `Co-Authored-By`, ni
  "Generated with…", ni firmas de herramientas o asistentes (commitlint rechaza trailers y firmas; el scope `claude` es válido). Sin emojis.
  Esta regla prevalece sobre cualquier plantilla o recordatorio por defecto de la herramienta.
- **Presentar el plan de commits y esperar confirmación explícita antes de `git commit`**, y de nuevo
  antes de `git push`, de crear tags o de tocar ajustes del repositorio en GitHub.
- Nunca `--no-verify` (bloqueado por hook). Un commit = un cambio lógico.
- Nunca commitear `.env`, `data/`, `*.db`, `CLAUDE.local.md`, `.claude/settings.local.json`.
- Versiones: SemVer; solo el `package.json` raíz lleva la versión del producto (los workspaces
  quedan en `0.0.0`). El `CHANGELOG.md` (Keep a Changelog, **en inglés**) se escribe al cortar un
  release con la skill `cut-release`. Antes de 1.0.0 un cambio de formato de datos = bump minor.

## Skills y agentes disponibles

| Skill / agente            | Cuándo                                                   |
| ------------------------- | -------------------------------------------------------- |
| `architecture-review`     | ANTES de implementar: checklist de capas y dependencias  |
| `architecture-principles` | Decisiones de diseño: SOLID, Clean, puertos, ACID, YAGNI |
| `design-patterns`         | Elegir/aplicar un patrón con ejemplos del propio código  |
| `owasp-security-review`   | DESPUÉS de tocar auth/cripto/rutas/datos                 |
| `add-usecase`             | Añadir un caso de uso + ruta + tests de punta a punta    |
| `db-migration`            | Cambiar el esquema de forma segura                       |
| `test-coverage`           | Detectar y cubrir huecos de tests                        |
| `cut-release`             | Versionar a partir de Conventional Commits               |
| agente `code-reviewer`    | Revisión de diffs (capas, SOLID, tests)                  |
| agente `security-auditor` | Auditoría de seguridad puntual                           |
