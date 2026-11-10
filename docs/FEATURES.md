# Funcionalidades

Catálogo vivo de lo que hace SecretVault. Cada fila es una **rebanada vertical** (interfaz, API, datos y tests):
ver [la forma de trabajo](../.claude/rules/vertical-slices.md). Se actualiza en el mismo PR que la entrega.

Estados: **Hecho** (en `develop`/`main`) · **En revisión** (PR abierto) · **Planeado**.
La versión indica en qué release llega o llegará; el historial detallado está en [CHANGELOG.md](../CHANGELOG.md).

## Bóveda y acceso

| ID    | Funcionalidad                                                                     | Estado      | Versión | Referencia       |
| ----- | --------------------------------------------------------------------------------- | ----------- | ------- | ---------------- |
| F-001 | Crear bóveda con contraseña maestra, desbloquear, bloquear y auto-bloqueo         | Hecho       | 0.1.0   | —                |
| F-002 | Perímetro solo-localhost (bind, Host/Origin, CSP, sesión con expiración absoluta) | Hecho       | 0.1.0   | ADR-0004         |
| F-003 | Clave de recuperación (cifrado de envoltura) y recuperación de acceso             | En revisión | 0.1.0   | PR #14, ADR-0006 |
| F-004 | Panel de seguridad: cambiar contraseña y regenerar la clave de recuperación       | En revisión | 0.1.0   | PR #14           |
| F-005 | Actualización automática de bóvedas del formato anterior                          | En revisión | 0.1.0   | PR #14           |

## Secretos y ambientes

| ID    | Funcionalidad                                                             | Estado | Versión |
| ----- | ------------------------------------------------------------------------- | ------ | ------- |
| F-010 | Ambientes: crear, renombrar, eliminar (con conteo de secretos)            | Hecho  | 0.1.0   |
| F-011 | Secretos: crear, editar, eliminar; listado enmascarado; revelado auditado | Hecho  | 0.1.0   |
| F-012 | Búsqueda global por nombre, en vivo y entre todos los ambientes           | Hecho  | 0.1.0   |
| F-013 | Importar desde `.env` pegado, con vista previa                            | Hecho  | 0.1.0   |
| F-014 | Exportar un ambiente a `.env`, CSV o PDF                                  | Hecho  | 0.1.0   |
| F-015 | Generador de valores aleatorios                                           | Hecho  | 0.1.0   |

## Auditoría y experiencia

| ID    | Funcionalidad                                            | Estado | Versión |
| ----- | -------------------------------------------------------- | ------ | ------- |
| F-020 | Historial de auditoría local (sin valores de secretos)   | Hecho  | 0.1.0   |
| F-021 | Tema claro, oscuro o del sistema, sin parpadeo al cargar | Hecho  | 0.1.0   |

## Despliegue

| ID    | Funcionalidad                                                              | Estado | Versión |
| ----- | -------------------------------------------------------------------------- | ------ | ------- |
| F-030 | Imagen Docker no-root con puerto solo en loopback y binario autocontenido  | Hecho  | 0.1.0   |
| F-031 | Release por tag: binarios multiplataforma, GitHub Release e imagen en GHCR | Hecho  | 0.1.0   |

## Planeado (por rebanadas, en este orden)

| ID    | Rebanada                                                                                          | Estado   | Versión |
| ----- | ------------------------------------------------------------------------------------------------- | -------- | ------- |
| F-100 | Bóvedas múltiples · 1: crear una segunda bóveda y entrar a ella (la actual pasa a ser la primera) | Planeado | 0.2.0   |
| F-101 | Bóvedas múltiples · 2: archivar una bóveda perdida (se mueve el archivo, no se destruye)          | Planeado | 0.2.0   |
| F-102 | Bóvedas múltiples · 3: renombrar una bóveda                                                       | Planeado | 0.2.0   |
| F-103 | Bóvedas múltiples · 4: cambiar de bóveda sin reiniciar                                            | Planeado | 0.2.0   |

El resto del backlog (backup y restauración, borrado automático del portapapeles, E2E en CI, etc.) está en
[TODO.md](TODO.md) y entra aquí cuando se corta como rebanada.
