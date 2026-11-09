---
name: architecture-review
description: Checklist PRE-implementación. Úsalo antes de escribir código para validar capa, nombres y dirección de dependencias. Los tests de arquitectura corren automáticamente después de cada edición.
---

## Antes de escribir código

### 1. ¿En qué paquete/capa va?

| Paquete    | Va aquí                                                     | NO va aquí                                                     |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `shared`   | DTOs, constantes, validaciones puras, códigos de error      | imports de cualquier tipo (ni workspace ni externos)           |
| `core`     | entidades, puertos, casos de uso, errores de dominio        | `hono`, `bun:*`, `node:*`, `vue`, `crypto`/`database`          |
| `crypto`   | implementación del puerto de cifrado (`node:crypto`)        | SQL, HTTP                                                      |
| `database` | repositorios, migraciones, `UnitOfWork`                     | cifrado, HTTP                                                  |
| `api`      | rutas finas, middleware, `container.ts`, presenters, export | reglas de negocio; importar `database` fuera de `container.ts` |
| `web`      | componentes, stores, `lib/api.ts`                           | importar `core`/`crypto`/`database` (solo `shared` + HTTP)     |

### 2. ¿Nombre y ubicación correctos?

`*-service.ts` (casos de uso) · `*-repository.ts` · `*.routes.ts` · specs en `tests/` espejando `src/`.

### 3. ¿Dirección de dependencias?

Hacia adentro. Si un caso de uso necesita algo externo → **define un puerto** en `core/ports` y deja
la implementación en un adaptador cableado en `container.ts`.

### 4. ¿Datos? → ver `.claude/rules/database.md`

¿Escritura multi-fila? → `unitOfWork.run`. ¿Cambia el esquema? → skill `db-migration`.

### 5. ¿Seguridad? → ver skill `owasp-security-review`

¿Ruta nueva? ¿campo sensible nuevo (AAD)? ¿puerto/host/CORS tocados?

### 6. ¿Tests? (TDD)

Escribe primero el test: ¿qué capa lo cubre? (`.claude/rules/testing.md`).

### 7. ¿Patrón o abstracción nueva? → skill `design-patterns` (¿qué problema real resuelve?)

## Después

`tests/architecture.spec.ts` se ejecuta tras cada edición (hook). Si falla, **no avances**: corrige.
