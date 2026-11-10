# Registro de incidencias

Bitácora de **bugs, riesgos y deuda técnica** encontrados, con su causa y cómo se previene que vuelvan.
Una entrada por problema, aunque se corrija en el mismo PR. Sirve para ver cómo evoluciona la calidad del
proyecto y para no repetir errores.

- **Cuándo escribir una entrada:** al encontrar un bug (propio o heredado), una vulnerabilidad o deuda que no
  se resuelve de inmediato.
- **Qué lleva:** síntoma, causa raíz, resolución y la **prueba de regresión** que lo vigila.
- Estados: **Abierta** · **En revisión** (arreglo en un PR) · **Resuelta**.
- Tipos: `bug` · `seguridad` · `deuda`.

## Abiertas

| ID      | Tipo      | Resumen                                                                                                                         | Notas                                                                                                       |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ISS-013 | seguridad | El export CSV no neutraliza valores que empiezan por `=`, `+`, `-` o `@` (inyección de fórmulas en Excel)                       | Prefijar corrompería contraseñas válidas; decisión pendiente (aviso en UI u opción "seguro para Excel")     |
| ISS-014 | deuda     | `lib/clipboard.ts` usa el API deprecado `document.execCommand` como alternativa                                                 | `localhost` es contexto seguro: `navigator.clipboard` basta; eliminar el fallback                           |
| ISS-015 | deuda     | 27 advertencias de ESLint (complejidad y tamaño de funciones), sobre todo en rutas y stores                                     | Extraer handlers; no silenciar la regla                                                                     |
| ISS-016 | deuda     | El frontend no tiene tests de componentes ni de stores                                                                          | Cubrir con `@vue/test-utils` + `happy-dom` al tocar cada pieza                                              |
| ISS-017 | deuda     | Exceso de comentarios que narran el código en archivos heredados                                                                | Recortar al tocar cada archivo (`code-quality.md`), sin limpieza masiva                                     |
| ISS-018 | deuda     | Saltos de versión mayor pendientes en el frontend: Vite 6→8, `@vitejs/plugin-vue` 5→6, `vue-tsc` 2→3, Pinia 2→4, Vue Router 4→5 | PRs de Dependabot #7 a #11; probar juntos en una rama                                                       |
| ISS-021 | bug       | Si se recarga la página antes de confirmar la clave de recuperación, la clave se pierde (solo vive en memoria del navegador)    | Avisar con `beforeunload` mientras esté pendiente; si ocurre, se regenera desde Seguridad con la contraseña |

## En revisión

| ID      | Tipo | Resumen                                                                                                                       | Resolución                                                                                                                                                                                         |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ISS-009 | bug  | Una base creada antes de las migraciones hacía fallar el arranque con "table already exists"                                  | PR #12: se rechaza con un mensaje claro y no se modifica; test de regresión en `acid.spec.ts`                                                                                                      |
| ISS-010 | bug  | Desde la raíz del repo, `:3000` mostraba "Frontend no construido" aunque estuviera compilado                                  | PR #13: el API busca también `apps/api/public`; test en `config.spec.ts`                                                                                                                           |
| ISS-011 | bug  | `ConfirmDialog` usaba `<BaseModal>` sin importarlo y sus botones quedaban siempre visibles                                    | PR #14: import añadido; verificado en navegador                                                                                                                                                    |
| ISS-019 | bug  | En desarrollo, `:5173` devolvía 403 al crear o desbloquear: el proxy de Vite reescribía `Host` y el API rechazaba el `Origin` | `changeOrigin: false` en el proxy; verificado en navegador por `:5173`                                                                                                                             |
| ISS-020 | bug  | `EmptyState` usaba `AppIcon` sin importarlo y el icono no se dibujaba                                                         | Import añadido y prop tipada; sin avisos de Vue en consola                                                                                                                                         |
| ISS-022 | bug  | Ningún modal se podía cerrar (ni X, ni Escape, ni clic fuera) desde que `BaseModal` recibió `dismissible`                     | Regresión de #14: en Vue una prop booleana ausente vale `false`, no `undefined`; se usa `withDefaults` · verificado en navegador, sin prueba automática hasta tener tests de componentes (ISS-016) |
| ISS-023 | bug  | El botón de tema ciclaba tres estados (sistema, claro, oscuro) y exigía dos clics para ver un cambio                          | Un clic alterna claro/oscuro y guarda la elección; se elimina el estado visible "sistema" · verificado en navegador                                                                                |

## Resueltas

| ID      | Tipo      | Resumen                                                                               | Causa raíz y prevención                                                                              |
| ------- | --------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ISS-001 | bug       | El servidor estático bloqueaba todas las rutas absolutas y no servía ningún asset     | `safeJoin` comprobaba el prefijo antes de volver relativa la ruta · `static.spec.ts`                 |
| ISS-002 | seguridad | El cambio de contraseña no comparaba el texto del verificador                         | Lógica duplicada · hoy hay un único punto (`openWithPassword`) con tests                             |
| ISS-003 | bug       | `secrets.name` no era único sin distinguir mayúsculas                                 | Faltaba `COLLATE NOCASE` en la columna · `repositories.spec.ts`                                      |
| ISS-004 | seguridad | `/api/health` y los 404 del API no enviaban `Cache-Control: no-store`                 | Rutas fuera del helper común · `owasp.spec.ts`                                                       |
| ISS-005 | bug       | La rotación de contraseña no era atómica: un fallo a medias podía corromper la bóveda | No había transacciones · `UnitOfWork`; hoy el cambio solo re-envuelve una fila · `perimeter.spec.ts` |
| ISS-006 | seguridad | Un atacante con acceso al disco podía mover el valor cifrado de un secreto a otro     | AAD constante por tipo · AAD ligado a ambiente y nombre · `perimeter.spec.ts`                        |
| ISS-007 | bug       | Los hooks de Husky y el Dockerfile estaban en CRLF y fallaban en Linux                | Sin `.gitattributes` · `eol=lf` forzado                                                              |
| ISS-008 | bug       | Un `CHECK` con `NULL` se cumplía y aceptaba una envoltura de clave vacía              | En SQL, `length(NULL) >= n` es `NULL` · `COALESCE` y test en `acid.spec.ts`                          |
