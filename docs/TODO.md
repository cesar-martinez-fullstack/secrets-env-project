# TODO — SecretVault

Lista viva y priorizada. Estado: ✅ hecho · 🔜 siguiente · ⏳ diferido · 🤔 requiere decisión.
Actualízala en el mismo cambio que cierre un ítem.

## ✅ Hecho (sesión de apropiación, 2026-11-09)

| Área         | Ítem                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Red          | Solo este equipo: `HOST=127.0.0.1`, compose `127.0.0.1:3000`, `hostGuard`, `originGuard`                                                        |
| Navegador    | CSP estricta (sin scripts inline), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, COOP/CORP                                                   |
| Datos (ACID) | `UnitOfWork` (rotación e importación atómicas), migraciones versionadas, `CHECK`s, `synchronous=FULL`, `secure_delete`, `quick_check`, permisos |
| Cripto       | AAD ligado a la fila (ambiente+nombre); PBKDF2 600k por defecto                                                                                 |
| Sesiones     | Vida máxima absoluta (12 h), `clear()` al cerrar, rate limiter con último salto de XFF y purga                                                  |
| Robustez     | Límite de body (2 MB), `decodeURIComponent` seguro                                                                                              |
| Docker       | Usuario no-root, imágenes `oven/bun:1.4.4` fijadas, mapeo solo loopback (verificado)                                                            |
| Código       | `verifyPassword` único (DRY), `SecretService` descompuesto en helpers, `container.ts` sin imports duplicados                                    |
| Tooling      | Error de lint corregido (0 errores); `makeTestConfig()` para tests                                                                              |
| Claude       | `CLAUDE.md`, `.claude/` (4 hooks probados, 4 reglas, 8 skills, 2 agentes)                                                                       |
| Tests        | +40 tests: perímetro, ACID/migraciones, AAD cruzado, rollback de rotación, sesión absoluta                                                      |

## 🔜 Siguiente (prioridad alta → baja)

### Arquitectura y calidad de código

- [ ] **Strategy + registro para exportadores** (`env`/`csv`/`pdf`): sacar el `if` de 60 líneas de
      `secrets.routes.ts` (viola OCP). _Skill: design-patterns._
- [ ] **Presenters** (`apps/api/src/presenters/`): mover `toDto` fuera de las rutas.
- [ ] **Value Objects** `SecretName`, `MasterPassword`, `EnvironmentName` ("parse, don't validate");
      elimina el `trim()`/`validate*` repetido.
- [ ] **Puerto `Clock`** (hoy `new Date()`/`Date.now()` dispersos) para tests deterministas.
- [ ] **Alias de imports** por paquete (`@api/*`, `@core/*`…) en `tsconfig` para eliminar `../../src/…`
      en tests; adaptar la regla de `architecture.spec.ts` ("sin imports relativos entre paquetes").
- [ ] Reducir warnings de ESLint (27): extraer handlers de `secrets.routes.ts`/`vault.routes.ts`,
      dividir `stores/data.ts` y `parseEnvContent`; exentar `routes/**` de `max-lines-per-function`.
- [ ] Validación de entrada con esquema (valibot/zod) en lugar de `requireString`/`requireInt`.
      _(Decidir: la regla actual es "cero dependencias" en `shared`.)_

### Seguridad

- [ ] 🤔 **CSV: inyección de fórmulas** (`=`, `+`, `-`, `@`). Prefijar corrompe contraseñas válidas.
      Opciones: advertencia en UI al exportar CSV · opción "seguro para Excel" desactivada por defecto.
- [ ] **Auto-clear del portapapeles** en el frontend (p. ej. 30 s tras copiar).
- [ ] **Bloqueo por inactividad en el navegador** (ocultar valores revelados al perder foco / `visibilitychange`).
- [x] La imagen ya excluye `docs/`, `tests/` y `.claude/` (`.dockerignore`).
- [ ] `PBKDF2` → evaluar **scrypt/Argon2id** (`node:crypto` scrypt está disponible; requiere nueva versión de formato).
- [ ] Backup/restauración cifrados: comando `backup` (`VACUUM INTO`) + verificación de restauración.
- [ ] 2FA/TOTP opcional para el desbloqueo (solo si se amplía el modelo de amenaza).

### Resiliencia y operabilidad

- [ ] **Backup/restauración**: comando `backup` (copia consistente con `VACUUM INTO` + verificación con
      `quick_check`) y `restore` probado de punta a punta (test que restaura y descifra).
- [ ] **Logs estructurados** (JSON, sin secretos ni body) con nivel configurable.
- [ ] Endpoint `/api/ready` (BD abierta y migrada) además de `/api/health`.
- [ ] Documentar RPO/RTO realistas del uso personal en `docs/ARCHITECTURE.md`.
- [ ] Más ADRs cuando haya decisiones nuevas (KDF Argon2id/scrypt, formato de backup).

### Datos

- [ ] Plan de migración de **datos** para cambios futuros de formato cifrado (versión de formato en `vault_meta`).
- [ ] Test de migración desde una base v(N-1) (cuando exista la v2 del esquema).
- [ ] Historial/versionado de valores de secretos (¿se necesita?).

### Frontend

- [ ] Tests de componentes y stores (`@vue/test-utils` + `happy-dom`, corriendo en `bun test`).
- [ ] Revisar accesibilidad (foco, aria, contraste) y estados de error/carga.

### Documentación

- [ ] ADRs breves en `docs/context.md` para: formato de blob/AAD, modelo de sesión, motor SQLite.
- [ ] README: sección "Solo este equipo" y troubleshooting de Docker (puerto 3000, volumen).

## 🔜 Repositorio público (en curso)

- [x] Git Flow documentado (`docs/GIT_WORKFLOW.md`), hooks de rama, commitlint estricto (sin atribución de IA)
- [x] README profesional (EN + ES), LICENSE (MIT), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG
- [x] CI (`ci.yml`), release por tag (`release.yml`), Dependabot, plantillas de issues/PR, CODEOWNERS
- [ ] 🤔 Confirmar licencia MIT y titular del copyright
- [ ] Primer push (`main` + `develop`) y tag `v0.1.0` — **requiere confirmación del usuario**
- [ ] Ajustes de GitHub: protección de `main`/`develop`, borrar ramas al mergear, private vulnerability
      reporting, descripción y topics
- [ ] Verificar `release.yml` con el primer tag (binarios multiplataforma + imagen GHCR)
- [ ] Escaneo de secretos (gitleaks) en CI y pre-commit
- [ ] CodeQL

## 🧊 Ideas (no comprometidas)

Modo CLI/kiosco · i18n · importación desde archivo · exportación cifrada · múltiples bóvedas.

## Verificación estándar antes de cerrar cualquier ítem

```bash
bun test && bun run typecheck && bun run lint:check
bun run test:security && bun run test:architecture   # si tocó seguridad o capas
```
