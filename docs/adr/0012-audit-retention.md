# ADR-0012 · Retención y vaciado del historial de auditoría

- Estado: Aceptado
- Fecha: 2026-11-26

## Contexto

El historial de auditoría conserva como máximo 1000 eventos fijos en el código y se poda solo. Una instalación de uso
intenso puede querer conservar más; otra, empezar de cero. Pero el historial es la evidencia de qué se hizo con los
secretos (revelados, exportes, copias): permitir borrarla o acortarla es, en sí, una acción sensible.

## Decisión

En Ajustes, una sección **«Historial de auditoría»** con dos acciones, ambas con **la contraseña maestra** y ambas
auditadas:

- **Retención:** elegir cuántos eventos se conservan entre 500, 1000 (por defecto), 5000 y 10000. Al bajarla, se poda
  de inmediato lo que sobre. Evento `audit.retention_changed`.
- **Vaciar:** borra todo el historial. Como no debe poder desaparecer sin rastro, queda **un único evento nuevo**
  `audit.cleared` con cuántos eventos se eliminaron. Antes se pide una segunda confirmación en la interfaz.

Detalles:

- **Dónde vive:** en la base, tabla `security_settings` de una sola fila (migración 6) con `CHECK (id = 1)` y
  `CHECK (audit_max_events BETWEEN 100 AND 100000)`. Así viaja con las copias de seguridad, se cambia en una
  transacción junto con la poda y el evento, y no depende de un archivo suelto editable. Las opciones de la interfaz
  son un subconjunto del rango permitido por la restricción.
- **Reautenticación:** mismo punto de verificación (`VaultService.confirmPassword`) y **el mismo presupuesto de
  intentos** (clave `change:`) que el cambio de contraseña, la clave de recuperación y la copia de seguridad.
- **Atomicidad:** guardar, podar y auditar (o borrar y auditar) van en `UnitOfWork.run`.
- **Rutas:** `GET /api/audit/retention`, `PUT /api/audit/retention` y `POST /api/audit/clear`, todas tras
  `requireUnlocked` y en el manifest.

## Alternativas descartadas

- **Guardar la retención en `settings.json`:** ese archivo se lee antes de desbloquear y es editable a mano; un ajuste
  de seguridad no debe vivir ahí ni quedar fuera de las copias.
- **Vaciar sin dejar rastro:** permitiría borrar la evidencia sin que nadie lo note.
- **Poda por antigüedad en días:** más flexible, pero obliga a decidir qué hacer con una instalación inactiva; se puede
  añadir después sin romper esta decisión.
- **Variable de entorno:** no es editable desde la interfaz y requiere reiniciar.

## Consecuencias

- Positivas: control del tamaño del historial sin perder la trazabilidad de los cambios sobre el propio historial.
- Negativas / deuda aceptada: quien conozca la contraseña maestra puede acortar o vaciar el historial (queda constancia
  del hecho, no de lo que había). Una copia de seguridad previa conserva el historial anterior.
- Qué habría que cambiar para revertirla: nueva migración que elimine `security_settings`, y volver a la constante.
