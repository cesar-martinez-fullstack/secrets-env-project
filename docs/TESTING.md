# Testing

> Convención del proyecto: estrategia por capas,
> tests espejando la estructura del código, y tests de arquitectura tipo ArchUnit.
>
> **Runner:** `bun test` — con **API idéntica a Jest** (`describe`/`it`/`expect`/`jest.fn`).
> Se usa el runner de Bun en lugar del CLI de Jest porque el motor de datos del
> proyecto es `bun:sqlite` (API nativa de Bun, inexistente en Node): Jest no podría
> ejecutar los tests de repositorios ni de integración. El costo de migración para
> quien viene de Jest es cero.

## Estrategia por capa

| Capa                            | Tipo de test                | Herramientas               | Velocidad |
| ------------------------------- | --------------------------- | -------------------------- | --------- |
| `shared` (parser, validación)   | Unitario — sin mocks        | bun test                   | ~1ms      |
| `core` (casos de uso)           | Unitario — repos mockeados  | bun test + `jest.fn()`     | ~5ms      |
| `crypto` (AES-GCM/PBKDF2)       | Unitario — **cripto real**  | bun test                   | ~50ms     |
| `database` (repositorios)       | Integración — SQLite real   | bun test + `:memory:`      | ~5ms      |
| `api` (rutas, sesiones, export) | Integración — app Hono real | bun test + `app.request()` | ~30ms     |
| Límites de arquitectura         | Análisis estático           | bun test + fs              | ~50ms     |
| Seguridad (OWASP Top 10)        | Integración                 | bun test + `app.request()` | ~1s       |

**Regla:** la lógica de negocio vive en `core` — se testa de forma exhaustiva.
La infraestructura (`database`, `api`) se testa para verificar _cableado_, no lógica.

## Ubicación y nomenclatura (espejo de la estructura)

```
packages/core/src/usecases/vault-service.ts
packages/core/tests/usecases/vault-service.spec.ts     ← espejo

apps/api/src/routes/secrets.routes.ts
apps/api/tests/security/protected-routes.spec.ts       ← seguridad junto al API
```

- Siempre `*.spec.ts`.
- `describe` por unidad + sub-`describe` por escenario (`happy path`, casos de error).
- `it('should ...')` en inglés; descripciones de bloque en español donde aporta contexto.

## Tests unitarios de casos de uso

Sin contenedor de DI: los servicios se inyectan por constructor con **mocks
completamente tipados**, construidos por test en `beforeEach`
(patrón `jest.Mocked<T>`, vía helpers en `tests/helpers/mocks.ts`):

```typescript
import { beforeEach, describe, expect, it, jest } from 'bun:test';

describe('SecretService', () => {
  let secrets: MockSecretRepo; // { repo, list, findById, ... } — cada método es jest.fn()
  let service: SecretService;

  beforeEach(() => {
    secrets = mockSecretRepo();
    service = new SecretService({ secrets: secrets.repo /* ... */ });
  });

  it('should always return masked values — never the plaintext', async () => {
    secrets.list.mockResolvedValue([secretWithMeta()]);
    const result = await service.list();
    expect(result[0]?.maskedValue).toBe('••••••••');
  });
});
```

## Tests de integración del API

`app.request()` de Hono permite probar la app **sin abrir puerto**:

```typescript
const res = await app.request('/api/vault/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ masterPassword: PASSWORD }),
});
const sessionId = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
```

Cada suite levanta un contenedor DI real con SQLite en `os.tmpdir()` y lo destruye en `afterAll`.

## Tests de arquitectura (ArchUnit casero)

`tests/architecture.spec.ts` escanea los imports de todo el monorepo con `fs` y falla
si se viola la regla de dependencia:

- `shared` no depende de nada.
- `core` solo depende de `shared` — jamás de `hono`, `bun:*`, `vue`, `node:*` ni de
  sus propias implementaciones (`crypto`/`database`).
- `crypto` y `database` solo implementan puertos de `core`.
- `api` importa las implementaciones **solo en `container.ts`** (raíz de composición).
- `web` solo habla HTTP (`shared` + APIs del navegador).
- Sin imports relativos que crucen la frontera de un paquete.
- Sin referencias circulares dentro de cada paquete.
- Convenciones de nombre: `-service.ts`, `-repository.ts`, `.routes.ts`.

## Integridad de datos (ACID)

`packages/database/tests/acid.spec.ts`: migraciones (idempotencia, rollback, esquema más nuevo),
`CHECK` constraints y `UnitOfWork` (commit, rollback total, serialización, anidamiento).

## Suite de seguridad

`apps/api/tests/security/`:

- `protected-routes.spec.ts` — lista **explícita de rutas públicas** (agregar una es
  una decisión de seguridad, revisada en code review) + escaneo estático de los
  archivos de rutas para detectar rutas sin clasificar.
- `perimeter.spec.ts` — Host/Origin guards, cabeceras/CSP, AAD cruzado entre filas, rollback de la
  rotación de contraseña y vida máxima de sesión.
- `owasp.spec.ts` — pruebas mapeadas al OWASP Top 10 (ver [SECURITY.md](SECURITY.md)).

## Comandos

```bash
bun test                          # toda la suite (239 tests, ~2s)
bun run test:watch                # watch mode
bun run test:cov                  # cobertura
bun run test:architecture         # solo límites de arquitectura
bun run test:security             # solo suite OWASP
bun test packages/core/tests      # un paquete
bun test -t "should reject"       # por nombre
```

## Reglas de ESLint para tests

`max-lines-per-function`: OFF (los `describe` son grandes) · `no-console`: OFF ·
reglas que exigen información de tipos: OFF (los typings de `bun:test` no dan para
typed-linting) — ver `eslint.config.mjs`.
