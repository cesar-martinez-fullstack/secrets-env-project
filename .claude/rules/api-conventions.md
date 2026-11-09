# Convenciones del API HTTP (Hono)

- Prefijo `/api`; recursos en plural y kebab-case: `/api/secrets`, `/api/environments`.
- Acciones de negocio como sub-recurso: `POST /api/secrets/:id/reveal`.
- Estados: `200` OK · `201` creación · `400` validación · `401` bloqueada/credenciales ·
  `403` Host/Origin no permitido · `404` no existe · `409` conflicto · `429` rate limit · `500` interno.
- Cuerpo de error único: `{ "error": { "code", "message", "issues?" } }`. Códigos estables en
  `packages/shared/src/error-codes.ts` (el frontend depende de ellos).
- **Toda** respuesta lleva `Cache-Control: no-store` (usa `jsonResponse`).
- Una ruta = parsear/validar entrada → llamar **un** caso de uso → mapear a DTO. Sin lógica de negocio.
- DTOs en `packages/shared/src/dto.ts` (fuente única compartida con el frontend).
- Nunca devolver entidades del dominio ni blobs cifrados; los valores solo salen por `reveal` (auditado).
- Rutas protegidas con `requireUnlocked`. Ruta pública nueva = actualizar `ROUTE_MANIFEST` + revisión.
- Operaciones sensibles a fuerza bruta (unlock, setup, change-password) con `RateLimiter`.
- IDs de ruta con `parseIdParam`; query params validados antes de usarse.
