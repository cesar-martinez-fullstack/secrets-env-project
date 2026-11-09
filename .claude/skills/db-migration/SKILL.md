---
name: db-migration
description: Cambiar el esquema de SQLite de forma segura (migración versionada y transaccional, con tests de actualización y plan para datos cifrados). Úsalo siempre que cambie una tabla, índice, constraint o el formato de los blobs.
---

## Reglas

- Nunca editar una migración existente. Se **añade** una con `version` = última + 1 en
  `packages/database/src/migrations.ts`. Cada una corre en transacción y sube `PRAGMA user_version`.
- SQLite no permite `ALTER TABLE … ADD CONSTRAINT`: para cambiar constraints se usa el patrón
  "crear tabla nueva → copiar → borrar vieja → renombrar" dentro de la misma migración
  (con `PRAGMA foreign_keys=OFF` gestionado por el runner, o `PRAGMA defer_foreign_keys=ON`).
- Mantén los `CHECK`/`FK`/`UNIQUE`: son la defensa de consistencia. Añadir uno nuevo exige validar
  que los datos existentes lo cumplen (consulta previa en la migración o falla con mensaje claro).

## Pasos

1. Test primero en `packages/database/tests/acid.spec.ts` (o uno nuevo):
   - parte de una base en la versión anterior (aplica `MIGRATIONS` hasta N-1, inserta datos),
     migra a N y verifica que los datos sobreviven y las nuevas reglas se cumplen;
   - verifica que una migración rota hace rollback (patrón ya presente).
2. Escribe la migración. Un cambio lógico por migración; descripción clara en `description`.
3. Si cambian repositorios, actualiza los tipos `*Row` y los puertos de `core` solo si el contrato cambia.
4. **Datos cifrados** (formato de blob o AAD): es una migración de _datos_ que necesita la clave de la
   sesión; no puede ser SQL puro. Diseña un caso de uso (`VaultService`) que re-cifre dentro de un
   `UnitOfWork`, guarda la versión del formato en `vault_meta`, y cubre con un test que abra una
   bóveda del formato anterior. Documenta el cambio en `docs/context.md`.
5. **Backup antes** de cualquier migración destructiva (`VACUUM INTO 'backup.db'`). Documenta el paso.
6. `bun test packages/database` + `bun test` completo + skill `owasp-security-review` (A08).

## Comprobaciones

- `PRAGMA foreign_key_check` y `PRAGMA integrity_check` limpios tras migrar.
- `openDatabase` rechaza esquemas más nuevos que el soportado (`SchemaTooNewError`): no lo debilites.
