---
name: add-usecase
description: Añade una capacidad de punta a punta (caso de uso + puerto si hace falta + repositorio + ruta + DTO + tests) respetando la arquitectura. Uso - /add-usecase <descripción de la operación>.
---

Sigue el orden; cada paso termina con sus tests en verde. **TDD**: test primero.

1. **Clarifica** (pregunta solo lo que cambie el diseño): ¿entrada/salida? ¿datos sensibles? ¿es
   pública o requiere sesión? ¿escribe en varias filas?
2. **Revisa** con `architecture-review` (capa y dependencias) y, si hay patrón dudoso, `design-patterns`.
3. **shared**: DTOs de request/response en `dto.ts`; códigos de error nuevos en `error-codes.ts`;
   validaciones puras si aplican (+ tests en `packages/shared/tests`).
4. **core**:
   - Error de dominio nuevo en `domain/errors.ts` si hay un caso de fallo nuevo.
   - Puerto nuevo en `ports/` solo si necesitas algo externo (interfaz pequeña, métodos async).
   - Método en el `*-service.ts` correspondiente (o servicio nuevo exportado en `index.ts`).
     Escrituras múltiples → `unitOfWork.run`. Datos cifrados → `secretValueAad`-style AAD ligado a la fila.
   - Tests unitarios con mocks tipados (`tests/helpers/mocks.ts`): happy path, no encontrado,
     conflicto, invariantes, efectos (auditoría).
5. **database** (si hay persistencia nueva): migración nueva (skill `db-migration`), método en el
   repositorio + test con `:memory:`; si es un puerto nuevo, impleméntalo y expórtalo en `createRepositories`.
6. **api**: ruta fina en `routes/*.routes.ts` (parsear → servicio → DTO), `requireUnlocked`, rate
   limit si es sensible a fuerza bruta; cablea dependencias nuevas **solo** en `container.ts`.
   Si la ruta es pública, actualiza `ROUTE_MANIFEST`.
7. **web** (si hay UI): método en `lib/api.ts`, store, componente.
8. **Tests de integración** (`app.request()`) y, si toca seguridad, caso en `tests/security/`.
9. **Cierre**: `bun test`, `bun run typecheck`, `bun run lint:check`, skill `owasp-security-review`,
   actualiza `docs/` (context/SECURITY/TESTING) si cambió algo documentado.
