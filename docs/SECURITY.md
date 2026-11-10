# Security — OWASP Top 10

SecretVault es una aplicación local de usuario único. El modelo de amenazas asume:

- El atacante puede **leer el disco** de la máquina (archivos de la bóveda, backups).
- El atacante **no** conoce la contraseña maestra.
- La red local es hostil (otro dispositivo puede alcanzar el puerto 3000).

Verificación automatizada: `bun run test:security` (OWASP + perímetro) + suite de integración.

**Uso previsto: solo este equipo.** La app escucha en `127.0.0.1`, Docker publica el puerto solo en
loopback, y el servidor rechaza cualquier `Host`/`Origin` ajeno (anti DNS-rebinding / CSRF).

| # OWASP                                | Riesgo                                       | Controles implementados                                                                                                                                                                                                                                                                                                                                                          | Verificado en                                                      |
| -------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A01** Broken Access Control          | Acceso a secretos sin sesión                 | Toda ruta salvo allowlist explícita exige cookie `sv_session` ligada a una clave viva en RAM; escaneo estático que falla el build si se registra una ruta sin clasificar; token falsificado → 401                                                                                                                                                                                | `security/protected-routes.spec.ts`                                |
| **A02** Cryptographic Failures         | Secretos legibles en reposo / claves débiles | AES-256-GCM con AAD contextual por campo **y por fila** (ambiente+nombre: valor/nota/verificador no intercambiables ni movibles entre secretos); PBKDF2-SHA256 600k iteraciones por defecto (suelo duro 100k, clamp 100k–2M); máscara de longitud fija (no filtra tamaño); valores solo salen por `reveal` auditado; DB en disco sin texto plano (verificado byte a byte)        | `crypto-service.spec.ts`, `owasp.spec.ts A02`, `vault-app.spec.ts` |
| **A03** Injection                      | SQL/command injection vía nombres/valores    | Prepared statements en el 100% de las queries (bun:sqlite); nombres de variables validados por whitelist regex; parser `.env` no evalúa contenido; payloads hostiles se persisten cifrados y se devuelven intactos sin ejecutar nada                                                                                                                                             | `owasp.spec.ts A03`, `parse-env.spec.ts`                           |
| **A04** Insecure Design                | Fuerza bruta sobre la contraseña maestra     | Rate limit por IP: 10 unlock fallidos/5 min → 429 con `Retry-After`; 20 setup/10 min; 10 cambios/15 min; contraseña maestra mín. 10 caracteres; rotación exige la contraseña actual y re-encripta todo                                                                                                                                                                           | `owasp.spec.ts A04`, `rate-limiter.spec.ts`                        |
| **A05** Security Misconfiguration      | Fuga de internals, cacheo de datos sensibles | Errores 404/500 en JSON genérico sin stack traces; `Cache-Control: no-store` en TODO el API; sin `X-Powered-By`; cookie `HttpOnly` + `SameSite=Lax` (activable `Secure` tras HTTPS); path traversal bloqueado en el servidor estático                                                                                                                                            | `owasp.spec.ts A05`, `static.spec.ts`                              |
| **A06** Vulnerable Components          | Dependencias con CVEs                        | Superficie de dependencias mínima (hono es la única dependencia runtime del API); `bun audit` al actualizar dependencias (pendiente automatizar en CI)                                                                                                                                                                                                                           | —                                                                  |
| **A07** Identification & Auth Failures | Sesiones predecibles/reutilizables           | Token de sesión aleatorio de 32 bytes (base64url, 43 chars), único por sesión, opaco, sin estado en disco; expiración por inactividad (ventana deslizante) con barrido cada 30s; lock destruye la clave y limpia la cookie; rotación de clave en RAM sin renovar token                                                                                                           | `session-store.spec.ts`, `owasp.spec.ts A07`                       |
| **A08** Software & Data Integrity      | Tampering de blobs cifrados                  | GCM auth tag detecta cualquier bit alterado; el AAD (ambiente+nombre) impide recolocar blobs entre campos **y entre filas** (test `perimeter.spec.ts`); migraciones transaccionales con `CHECK`/FK y `quick_check` al abrir; rotación de contraseña e importación atómicas (`UnitOfWork`); verificador de contraseña compara texto plano conocido además de la autenticación GCM | `crypto-service.spec.ts`                                           |
| **A09** Logging & Monitoring Failures  | Accesos sin rastro                           | Auditoría local inmutable (append-only con poda): setup/unlock/**unlock_failed**/lock/rotación/CRUD/**reveal**/**export** con timestamp; los mensajes de auditoría nunca contienen valores                                                                                                                                                                                       | `owasp.spec.ts A09`                                                |
| **A10** SSRF                           | —                                            | N/A: la app no realiza peticiones salientes ni consume URLs del usuario                                                                                                                                                                                                                                                                                                          | —                                                                  |

## Perímetro (defensa en profundidad)

| Capa      | Control                                                                                                               | Verificado en                             |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Red       | `HOST=127.0.0.1`; compose `127.0.0.1:3000:3000`; contenedor no-root                                                   | `perimeter.spec.ts`, prueba manual Docker |
| Host      | `hostGuard`: solo `localhost`, `127.0.0.1`, `[::1]` (+ `SV_ALLOWED_HOSTS`)                                            | `perimeter.spec.ts`                       |
| Origen    | `originGuard`: métodos mutantes exigen mismo origen y rechazan `Sec-Fetch-Site: cross-site`                           | `perimeter.spec.ts`                       |
| Navegador | CSP `script-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` | `perimeter.spec.ts`                       |
| Sesión    | inactividad 15 min + vida máxima absoluta 12 h; `clear()` al cerrar el proceso                                        | `perimeter.spec.ts`                       |
| Recursos  | body máx. 2 MB (`maxRequestBodySize`), rate limits por IP                                                             | `rate-limiter.spec.ts`                    |

## Notas de amenaza honestas

1. **RAM no es borrado criptográfico garantizado**: la clave se sobrescribe con ceros
   al destruir la sesión (reduce la ventana), pero el GC de JS puede retener copias.
2. **Sin contraseña ni clave de recuperación no hay acceso**: no hay backdoor, reset por correo ni
   custodia en servidor. La **clave de recuperación** (256 bits, se muestra una vez) permite fijar una
   contraseña nueva; es un segundo secreto que la persona debe guardar fuera del equipo. Quien la tenga
   abre la bóveda. Ver ADR-0006.
   Perderla = perder los secretos. Es la consecuencia de que nadie (ni el propio
   servidor) pueda descifrar sin ella.
3. **Nombres de variables en claro**: son metadata necesaria para búsqueda SQL
   instantánea. Valores y notas van cifrados.
4. **Exposición en red**: pensado para localhost. Si se publica en LAN, usar un proxy
   con HTTPS y `SV_COOKIE_SECURE=true` + `SV_TRUST_PROXY=true`.
5. **CSRF**: mitigado por `SameSite=Lax` + JSON-only API. Para dureza extra detrás de
   proxy, validar `Origin` en el proxy inverso.

6. **CSV (riesgo aceptado)**: el export CSV no neutraliza valores que empiezan por `=`, `+`, `-`, `@`
   (inyección de fórmulas al abrirlo en Excel). Prefijar con una comilla simple corrompería
   contraseñas legítimas, así que el menú de exportación avisa en la propia interfaz (ISS-013).
7. **Paquete para compartir (ADR-0009)**: el archivo `.svshare` va cifrado con una clave derivada de
   la frase de paso (PBKDF2-SHA256, AES-256-GCM); su confidencialidad es exactamente la de esa frase,
   que exige 12 caracteres y que SecretVault nunca guarda. Quien tenga archivo y frase conserva el
   acceso y no hay revocación. Un archivo hostil no puede forzar un coste de KDF arbitrario
   (iteraciones acotadas) ni colar nombres inválidos o repetidos (se revalidan al importar). Frase
   incorrecta y archivo alterado dan el mismo error. Importar y previsualizar tienen límite de intentos
   por IP.

## Checklist de revisión (para cada PR que toque auth/crypto/rutas)

1. ¿Nueva ruta? → actualizar `ROUTE_MANIFEST` + decidir si es pública (revisión).
2. ¿Nuevo campo sensible? → cifrar con AAD propio + test de round-trip y de AAD.
3. ¿Cambio en el esquema de sesiones? → tests de expiración y zeroKey.
4. Correr `bun run test:security && bun run test:architecture`.
5. Reportar explícitamente: «OWASP review: sin hallazgos» o el listado con severidad.
