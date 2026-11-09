---
name: design-patterns
description: Catálogo de patrones de diseño con criterio de uso para SecretVault - cuáles ya existen en el código, cuáles aplicar y cuáles evitar (YAGNI). Úsalo antes de introducir una abstracción o al refactorizar un if/else, una duplicación o un acoplamiento.
---

## Regla

Un patrón es **una respuesta a un problema**. Primero nombra el problema (duplicación, acoplamiento,
extensión difícil, atomicidad), luego elige. Si no puedes nombrarlo, no uses el patrón.

## Ya presentes en el código (mantener y respetar)

| Patrón                                    | Dónde                                                                                     | Por qué importa                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Ports & Adapters**                      | `core/ports/*` ↔ `crypto`, `database`                                                     | Núcleo independiente de la tecnología        |
| **Repository**                            | `SecretRepository` / `Sqlite*Repository`                                                  | Oculta SQL; permite mocks y cambiar de motor |
| **Composition Root + DI por constructor** | `apps/api/src/container.ts`                                                               | Único sitio que conoce implementaciones      |
| **Unit of Work**                          | `UnitOfWork` / `SqliteUnitOfWork`                                                         | Atomicidad multi-escritura                   |
| **Domain Errors** (jerarquía)             | `core/domain/errors.ts`                                                                   | Errores expresivos y mapeo único a HTTP      |
| **Chain of Responsibility**               | middlewares de Hono (`securityHeaders` → `hostGuard` → `originGuard` → `requireUnlocked`) | Preocupaciones transversales apilables       |
| **Null-safe / Query-Command separation**  | `list`/`reveal` (consulta) vs `create`/`update` (comando)                                 | Efectos laterales explícitos                 |

## A aplicar (retorno concreto, por prioridad)

| Problema actual                                                        | Patrón                                                                          | Cómo                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export con `if (format === …)` de ~60 líneas en la ruta (viola OCP)    | **Strategy + registro**                                                         | `interface ExportFormatter { format; contentType; extension; build(entries, ctx): Uint8Array \| string }` + `Map<ExportFormat, ExportFormatter>`; la ruta solo busca el formatter. Añadir un formato = un archivo nuevo |
| Validación repartida (`validate*`, `trim()` repetido, `requireString`) | **Value Object** (`SecretName`, `MasterPassword`) y/o **esquema de validación** | `SecretName.create(raw)` valida y normaliza una sola vez; el resto del código recibe un valor válido por construcción ("parse, don't validate")                                                                         |
| `toDto` inline en las rutas                                            | **Presenter / Mapper**                                                          | `apps/api/src/presenters/*.presenter.ts`; las rutas no arman respuestas a mano                                                                                                                                          |
| `Date.now()` / `new Date()` dispersos                                  | **Clock (puerto)**                                                              | `interface Clock { now(): Date }`; `SystemClock` en producción, reloj fijo en tests                                                                                                                                     |
| Lógica de verificación duplicada                                       | **Template Method / Extract Method**                                            | ya hecho: `VaultService.verifyPassword`; mismo criterio para futuras duplicaciones                                                                                                                                      |
| Constructores con muchas deps (`VaultServiceDeps`)                     | **Parameter Object**                                                            | ya usado; mantenerlo (evita >3 parámetros)                                                                                                                                                                              |

## Opcionales (solo si aparece el problema)

| Patrón                                 | Disparador                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Decorator** (`AuditedSecretService`) | Si la auditoría se repite en >6 casos de uso y ensucia la lógica                          |
| **Domain Events / Observer**           | Si hay ≥3 consumidores reales de un mismo evento (hoy: solo auditoría)                    |
| **Factory**                            | Si crear un objeto exige elegir variantes (p. ej. adaptador de almacenamiento por config) |
| **Specification**                      | Si los filtros de búsqueda se vuelven combinables por el usuario                          |
| **Outbox / Saga**                      | Solo si algún día hay integraciones externas; hoy no hay red saliente                     |

## Evitar (anti-patrones aquí)

- **Singleton global / service locator**: oculta dependencias; usa el `container`.
- **Herencia para reutilizar código**: preferir composición.
- **Repositorio "genérico" `Repository<T>` con CRUD universal**: borra la intención del dominio.
- **Capas vacías** (un "manager" que solo reenvía llamadas).
- **Dominio rico "de catálogo"** (entidades con comportamiento falso para parecer DDD): el dominio de
  este proyecto es pequeño; Value Objects sí, agregados complejos no.

## Plantilla de decisión (anótala en el PR/commit body cuando introduzcas uno)

```
Problema: <qué duele hoy, con archivo:línea>
Patrón: <nombre>
Alternativa más simple descartada: <cuál y por qué no alcanza>
Costo: <archivos nuevos, indirección añadida>
Prueba: <test que demuestra el beneficio>
```
