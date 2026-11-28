# ADR-0013 · Ajustes de sesión editables, guardados en la base

- Estado: Aceptado
- Fecha: 2026-11-26

## Contexto

El bloqueo por inactividad y la vida máxima de la sesión solo se podían cambiar con variables de entorno y
reiniciando. Copiar un secreto lo dejaba en el portapapeles sin límite.

## Decisión

La migración 7 añade a `security_settings` el bloqueo, la vida máxima y los segundos para vaciar el portapapeles.
Los dos primeros son nulos hasta que se guardan desde Ajustes: mientras tanto rigen `SV_AUTO_LOCK_MINUTES` y
`SV_SESSION_MAX_HOURS`. Una vez guardados, mandan sobre el entorno. Cambiarlos exige la contraseña maestra, queda
auditado en la cuota del historial y acorta de inmediato las sesiones abiertas.

El portapapeles lo vacía el navegador, sin leerlo antes, 30 segundos después de copiar por defecto.

## Alternativas descartadas

- Guardarlos en `settings.json`: se podrían cambiar sin la contraseña y no viajarían con las copias.
- Hacer que el entorno mandara siempre: Docker fija una de las variables y el ajuste no tendría efecto.
- Leer el portapapeles antes de vaciarlo: pide un permiso al navegador y no todos lo conceden.

## Consecuencias

- Positivas: se configura sin reiniciar y sin cambiar los tiempos de quien actualiza.
- Negativas / deuda aceptada: se puede vaciar algo copiado después en otro programa; no se borra el historial del
  portapapeles del sistema; si la pestaña se cierra antes, no se vacía. Una versión anterior no abre una base v7.
- Qué habría que cambiar para revertirla: una migración nueva y restaurar la configuración solo por entorno.
