---
name: owasp-security-review
description: Checklist OWASP Top 10:2025 adaptado a SecretVault (Bun + Hono + SQLite + cifrado AES-GCM, solo-localhost). Úsalo DESPUÉS de tocar rutas, auth, sesiones, cripto, datos, configuración, Docker o dependencias, antes de dar la tarea por terminada.
---

## Cuándo

Tras cualquier cambio en `apps/api/src/{routes,middleware,session-store,rate-limiter,config}`,
`packages/{crypto,database}`, `core` con datos cifrados, `Dockerfile`/compose, o `package.json`.

## Amenaza considerada

Un único usuario en su equipo. Atacante: (a) lee el disco/backups, (b) otro dispositivo de la LAN,
(c) una web maliciosa abierta en el navegador del propio usuario (CSRF/DNS-rebinding). No hay
usuarios múltiples ni red saliente.

## A01 · Broken Access Control (incluye SSRF)

- [ ] ¿Ruta nueva con `requireUnlocked`? ¿Pública solo vía `ROUTE_MANIFEST` + revisión?
- [ ] ¿`hostGuard`/`originGuard` siguen montados antes que cualquier ruta (`app.ts`)?
- [ ] ¿Se mantiene el bind `127.0.0.1` (config, compose `127.0.0.1:3000`)? ¿Nada escucha en `0.0.0.0` en el host?
- [ ] SSRF: ¿alguna petición saliente con URL controlada por el usuario? (hoy: ninguna → debe seguir así)

## A02 · Security Misconfiguration

- [ ] CSP intacta (`script-src 'self'`, sin `unsafe-inline` en scripts, `frame-ancestors 'none'`)
- [ ] Errores sin stack ni rutas internas; `Cache-Control: no-store` en el API
- [ ] Contenedor como usuario no-root; imágenes base fijadas por versión; `.env` fuera de la imagen
- [ ] Defaults seguros en `config.ts`; cualquier relajación es opt-in y documentada

## A03 · Software Supply Chain

- [ ] Dependencia nueva: ¿necesaria? ¿mantenida? ¿sin CVE? (`bun audit`)
- [ ] `bun.lock` actualizado y commiteado; sin `postinstall` sospechosos
- [ ] Hooks de Husky intactos (sin `--no-verify`)

## A04 · Cryptographic Failures

- [ ] Campo sensible nuevo ⇒ cifrado AES-256-GCM con **AAD ligado a la fila** + test de round-trip y AAD cruzado
- [ ] IV aleatorio por operación; PBKDF2 ≥ 600k (suelo duro 100k); sal aleatoria por bóveda
- [ ] La clave nunca se persiste ni se loguea; se pone a cero al destruir la sesión
- [ ] Ningún secreto/contraseña en logs, auditoría, mensajes de error ni nombres de archivo

## A05 · Injection

- [ ] SQL 100% parametrizado; identificadores nunca desde input
- [ ] Entrada validada en el servidor (nombre por regex, longitudes, tamaño de body)
- [ ] Parser `.env` no evalúa contenido; exports escapan CSV/PDF correctamente (inyección de fórmulas en CSV)

## A06 · Insecure Design

- [ ] Operaciones de fuerza bruta con `RateLimiter` (unlock/setup/change-password)
- [ ] Sesión con ventana por inactividad **y** vida máxima absoluta
- [ ] Operaciones destructivas/masivas atómicas (`UnitOfWork`)

## A07 · Authentication Failures

- [ ] Token de sesión aleatorio de 32 bytes, opaco, cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` bajo HTTPS)
- [ ] Lock destruye la clave y limpia la cookie; verificación de contraseña única (`verifyPassword`)
- [ ] Sin enumeración ni diferencias de timing evitables en errores de login

## A08 · Software or Data Integrity Failures

- [ ] Blobs autenticados por GCM con AAD de fila; un blob movido entre filas falla al descifrar
- [ ] Migraciones versionadas y transaccionales; `quick_check` al abrir
- [ ] Sin deserialización insegura del input

## A09 · Logging & Alerting Failures

- [ ] Eventos de seguridad auditados (unlock fallido, reveal, export, rotación) sin valores
- [ ] Los logs de consola no contienen secretos ni el body de peticiones

## A10 · Mishandling of Exceptional Conditions

- [ ] Fallar **cerrado** (denegar) ante errores inesperados; 500 genérico sin detalles
- [ ] Un fallo a mitad de una operación multi-paso no deja datos a medias (rollback)
- [ ] Límites de recursos: tamaño de body, rate limits, timeouts

## Formato de reporte

```
[SEVERIDAD] [A0X:2025] archivo:línea — hallazgo — riesgo real — corrección concreta
```

Sin hallazgos: escribir literalmente **"OWASP review: sin hallazgos"**. CRÍTICO/ALTO sin resolver o
sin aceptación explícita del usuario ⇒ la tarea NO está terminada. Verificación automática:
`bun run test:security && bun run test:architecture`.
