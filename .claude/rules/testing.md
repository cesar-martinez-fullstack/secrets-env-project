# Reglas de testing

Runner: `bun test` (API estilo Jest). Detalle y ejemplos en [docs/TESTING.md](../../docs/TESTING.md).

## Estrategia por capa

| Capa         | Test                              | Notas                                                |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `shared`     | unitario sin mocks                | funciones puras, parser `.env` con entradas hostiles |
| `core`       | unitario con mocks tipados        | `tests/helpers/mocks.ts`; inyección por constructor  |
| `crypto`     | unitario con cripto REAL          | nunca mockear la cripto en su propio test            |
| `database`   | integración con SQLite `:memory:` | + `acid.spec.ts` (migraciones, UoW, constraints)     |
| `api`        | integración con `app.request()`   | sin abrir puertos; SQLite en `os.tmpdir()`           |
| arquitectura | análisis estático                 | `tests/architecture.spec.ts`                         |
| seguridad    | integración                       | `apps/api/tests/security/`                           |

## Qué debe tener todo caso de uso

Happy path · no encontrado · conflicto/duplicado · invariantes de dominio · efectos secundarios
(auditoría, llamadas al repo) · y, si toca datos cifrados, un test de AAD cruzado.

## Convenciones

- `*.spec.ts` espejando la ruta de `src/`. `describe` por unidad, `it('should …')` en inglés.
- Un test falla por **una** razón. Sin dependencia entre tests ni orden implícito.
- Tiempo y azar inyectables (reloj, `RateLimiter`/`SessionStore` ya lo permiten) → tests deterministas.
- Un test de seguridad debe fallar si se retira el control que protege: verifica que el test
  "muerde" (comprueba que falla sin la defensa) cuando agregues uno nuevo.
- Config de tests con `makeTestConfig()` (`apps/api/tests/helpers`); no construir `ApiConfig` a mano.
- Al corregir un bug, primero el test que lo reproduce (regresión permanente).
