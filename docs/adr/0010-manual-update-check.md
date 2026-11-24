# ADR-0010 · Comprobación manual de actualizaciones

- Estado: Aceptado
- Fecha: 2026-11-24

## Contexto

Quien instala SecretVault necesita saber cuándo hay una versión nueva. Hasta hoy la aplicación no hacía **ninguna**
petición saliente (el modelo de amenazas lo daba como invariante: A10 «no aplica»). Una notificación automática
rompería esa propiedad, porque la app consultaría internet por su cuenta y en cada arranque, y una app de secretos
no debe «llamar a casa» sin que la persona lo pida.

## Decisión

Un botón **«Comprobar actualizaciones»** en Ajustes. Solo cuando se pulsa, el servidor consulta la última versión
publicada en GitHub y muestra el resultado, el enlace a las novedades y el comando de actualización. Nunca descarga
ni instala nada.

Es la **única** petición saliente de la aplicación, y está acotada:

- **Dirección fija en el código** (`https://api.github.com/repos/<repo oficial>/releases/latest`). Ningún dato de la
  persona ni de la bóveda entra en la URL, y no hay variable de entorno que la cambie (sería SSRF).
- **Sin datos ni credenciales:** `GET` sin cuerpo, sin cookies (`credentials: 'omit'`), solo `Accept` y
  `User-Agent: SecretVault`.
- **Límites:** timeout de 5 s, sin seguir redirecciones, respuesta de hasta 100 KB.
- **Transporte:** el destino es fijo, pero el `fetch` de Bun hereda del entorno del proceso un posible proxy
  (`HTTPS_PROXY`/`NO_PROXY`). Quien controle el entorno ya controla el equipo o el contenedor; el `Dockerfile` y el
  compose no definen proxy y deben seguir sin hacerlo. La respuesta pasa igualmente por la validación siguiente.
- **Respuesta validada:** solo releases estables (se ignoran borradores y pre-releases), etiqueta `X.Y.Z` estricta y
  enlace obligatoriamente de `https://github.com/<repo oficial>/releases/…`; lo que se emite es la URL ya
  normalizada, no el texto original. Cualquier otra cosa es un error.
- **Acceso:** ruta tras `requireUnlocked`, con límite de 5 comprobaciones cada 10 minutos, y registrada en el
  manifest de rutas.
- **Auditable:** cada comprobación queda en el historial (`update.checked`), sin datos sensibles.
- **Apagable:** `SV_UPDATE_CHECK=false` desactiva la ruta por completo (cero tráfico saliente).
- **Arquitectura:** puerto `ReleaseSource` en `core`; el adaptador `GithubReleaseSource` vive en `api`. Los tests
  nunca salen a internet.

La petición sale del **servidor**, no del navegador, para no relajar la CSP (`connect-src 'self'`).

## Alternativas descartadas

- **Aviso automático al abrir la app:** rompe la propiedad «sin red saliente» y filtra a GitHub que la app se usó.
- **Actualización con un clic desde la interfaz:** exigiría que algo controle Docker en el equipo (acceso a
  `docker.sock`, equivalente a control total de la máquina) o que la app se descargue y reemplace a sí misma sin
  verificar firma. Incompatible con un contenedor sin privilegios y de solo lectura. Si se quiere en el futuro,
  debe ser un componente aparte con permisos mínimos, verificación de firmas y su propio ADR.
- **Consultar desde el navegador:** obligaría a abrir `connect-src` en la CSP.

## Consecuencias

- Positivas: se sabe cuándo actualizar sin perder la propiedad de seguridad; superficie nueva mínima y verificable.
- Negativas / deuda aceptada: GitHub ve la IP del equipo cuando se pulsa el botón (se avisa en la interfaz); la
  actualización sigue siendo un paso manual (`./scripts/update.sh`).
- Qué habría que cambiar para revertirla: borrar la ruta, el servicio y el adaptador, y volver a marcar A10 como
  «no aplica».
