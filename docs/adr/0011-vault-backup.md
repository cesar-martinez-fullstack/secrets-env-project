# ADR-0011 · Copia de seguridad de la bóveda desde la aplicación

- Estado: Aceptado
- Fecha: 2026-11-25

## Contexto

Los secretos viven en un único archivo SQLite dentro de un volumen de Docker. Perder el volumen (o el equipo) es
perder todo. Hasta ahora la copia dependía de comandos de Docker o de `scripts/update.sh`. Hace falta una forma
sencilla, desde la propia aplicación, de obtener esa copia sin debilitar el modelo de seguridad.

## Decisión

Un botón **«Descargar copia»** en Ajustes. `POST /api/vault/backup` entrega el archivo SQLite completo
(`secretvault-backup-AAAAMMDDHHMMSS.db`) con el cifrado en reposo intacto: no descifra nada.

- **Reautenticación:** exige volver a escribir la contraseña maestra, que se verifica con el mismo punto de
  comprobación de siempre (`VaultService.confirmPassword`, que reutiliza `openWithPassword`). Una sesión robada sin
  la contraseña no puede descargar la base para atacarla fuera de línea. Va por `POST` con la contraseña en el cuerpo
  (nunca en la URL), tras `requireUnlocked` y con el mismo límite de intentos que el cambio de contraseña.
- **Copia consistente:** `db.serialize()` (puerto `VaultBackup` en `core`, adaptador `SqliteVaultBackup` en
  `database`) devuelve la base tal como la ve la conexión, incluido lo confirmado en el WAL; no se copian
  archivos a mano mientras se escribe.
- **Auditable:** queda `vault.backup_created` con el tamaño, sin datos sensibles.
- **Respuesta binaria:** `application/octet-stream`, `Cache-Control: no-store`, `Content-Disposition: attachment`.

## Qué contiene la copia (y qué no)

Es la base tal cual. Los **valores y notas** de los secretos van cifrados (AES-256-GCM) y la clave de datos va
envuelta por la contraseña maestra y por la clave de recuperación. Pero los **nombres de proyectos, ambientes y
secretos y el historial de auditoría están en claro** dentro del archivo, igual que en el disco. La interfaz lo
avisa antes de descargar. Quien tenga el archivo no ve los valores, pero sí cómo se llama lo que guardas, y puede
intentar adivinar la contraseña maestra fuera de línea (de ahí PBKDF2 con 600.000 iteraciones y la exigencia de una
contraseña fuerte).

## Restaurar

Con la aplicación detenida, el archivo se coloca como `secrets.db` en la carpeta de datos (y se borran
`secrets.db-wal` y `secrets.db-shm` si existen). La copia es una base en modo WAL: no se abre en memoria, pero sí como
archivo normal. Los pasos para Docker están en `docs/MAC.md`.

## Alternativas descartadas

- **Exportar un paquete cifrado aparte** (como el de compartir, con frase de paso): protegería también los nombres,
  pero obliga a una segunda clave que recordar y a un caso de uso de importación completo. Se puede añadir después.
- **Restaurar desde la interfaz:** sustituir la base en caliente es destructivo y delicado (sesiones, WAL,
  migraciones); queda como paso manual documentado hasta que haya una necesidad real.
- **Copia sin pedir la contraseña:** deja a una sesión abierta sin vigilancia como único requisito para llevarse todo.

## Consecuencias

- Positivas: copia en un clic, verificada de extremo a extremo (descargar, restaurar en otra instalación y abrir con
  la misma contraseña).
- Negativas / deuda aceptada: los nombres quedan en claro en el archivo; la restauración es manual.
- Qué habría que cambiar para revertirla: borrar la ruta, `BackupService`, el puerto y el adaptador.
