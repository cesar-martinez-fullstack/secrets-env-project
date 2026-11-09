# ADR-0002 · SQLite de un solo archivo como almacenamiento

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

Datos pequeños de un solo usuario que exigen transacciones, restricciones de integridad y facilidad de
respaldo. No hay concurrencia de escritura relevante ni necesidad de alta disponibilidad.

## Decisión

`bun:sqlite` con un único archivo `secrets.db`: WAL, `foreign_keys=ON`, `synchronous=FULL`,
`secure_delete=ON`, `quick_check` al abrir, esquema por migraciones versionadas (`PRAGMA user_version`) y
transacciones mediante el puerto `UnitOfWork`. Los puertos de repositorio son asíncronos para no atar
`core` al carácter síncrono de SQLite.

## Alternativas consideradas

- **PostgreSQL** — operación y credenciales extra; sobredimensionado hoy. Es el camino si hay multiusuario.
- **Archivo JSON/binario propio** — habría que reimplementar atomicidad, índices y migraciones.
- **Jest + better-sqlite3 (Node)** — descartado: `bun:sqlite` es nativo y evita compilar módulos.

## Consecuencias

- Positivas: ACID real, cero operación, backup = copia consistente del archivo.
- Negativas: un solo escritor, sin replicación; ligado a Bun por `bun:sqlite` (tests con `bun test`).
- Reversión: nuevo adaptador de `database` que implemente los mismos puertos y el mismo `UnitOfWork`.
