# Base de datos y propiedades ACID

SQLite vía `bun:sqlite`, un archivo (`secrets.db`). Diseñado para poder cambiar de motor
cambiando solo el paquete `database` (los puertos de `core` son asíncronos a propósito).

## ACID en este proyecto

| Propiedad        | Cómo se garantiza                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **Atomicidad**   | `UnitOfWork.run` (`BEGIN IMMEDIATE … COMMIT/ROLLBACK`) en rotación e importación            |
| **Consistencia** | `CHECK`/`UNIQUE`/`FOREIGN KEY`/`NOT NULL`, `PRAGMA foreign_keys=ON`, `quick_check` al abrir |
| **Aislamiento**  | Una sola conexión + UoW serializado; WAL; `busy_timeout`                                    |
| **Durabilidad**  | `journal_mode=WAL` + `synchronous=FULL`; cierre con checkpoint                              |

Extra de confidencialidad: `secure_delete=ON` (los bytes borrados se sobrescriben).

## Reglas

1. El esquema solo cambia con una **migración nueva** en `migrations.ts` (`version` = anterior + 1).
   Nunca editar una ya publicada. Cada migración corre en transacción y sube `user_version`.
2. Toda operación que escriba en más de una tabla o fila lógica → dentro de `unitOfWork.run`.
   El trabajo dentro del UoW **no** hace I/O externo ni espera acciones del usuario.
3. SQL parametrizado (`?`) siempre. Los nombres de columnas/tablas nunca vienen de input.
4. Los repositorios no contienen reglas de negocio ni cifran: guardan blobs opacos.
5. Cambiar el formato cifrado o el AAD = migración de **datos** (re-cifrar con la clave en sesión)
   y un test que abra una base de la versión anterior.
6. Las fechas se guardan ISO-8601 UTC (texto). Los blobs como `Uint8Array`.
7. Nada de `DROP`/`DELETE` sin `WHERE` en migraciones sin un backup previo documentado.
