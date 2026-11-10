# Funcionalidades

Catálogo vivo de lo que hace SecretVault. Cada fila es una **rebanada vertical** (interfaz, API, datos y tests):
ver [la forma de trabajo](../.claude/rules/vertical-slices.md). Se actualiza en el mismo PR que la entrega.

Estados: **Hecho** (en `develop`/`main`) · **En revisión** (PR abierto) · **Planeado**.
La versión indica en qué release llega o llegará; el historial detallado está en [CHANGELOG.md](../CHANGELOG.md).

## Bóveda y acceso

| ID    | Funcionalidad                                                                     | Estado | Versión | Referencia       |
| ----- | --------------------------------------------------------------------------------- | ------ | ------- | ---------------- |
| F-001 | Crear bóveda con contraseña maestra, desbloquear, bloquear y auto-bloqueo         | Hecho  | 0.1.0   | —                |
| F-002 | Perímetro solo-localhost (bind, Host/Origin, CSP, sesión con expiración absoluta) | Hecho  | 0.1.0   | ADR-0004         |
| F-003 | Clave de recuperación (cifrado de envoltura) y recuperación de acceso             | Hecho  | 0.1.0   | PR #14, ADR-0006 |
| F-004 | Panel de seguridad: cambiar contraseña y regenerar la clave de recuperación       | Hecho  | 0.1.0   | PR #14           |
| F-005 | Actualización automática de bóvedas del formato anterior                          | Hecho  | 0.1.0   | PR #14           |

## Secretos y ambientes

| ID    | Funcionalidad                                                                         | Estado | Versión |
| ----- | ------------------------------------------------------------------------------------- | ------ | ------- |
| F-010 | Ambientes: crear, renombrar, eliminar (con conteo de secretos)                        | Hecho  | 0.1.0   |
| F-011 | Secretos: crear, editar, eliminar; listado enmascarado; revelado auditado             | Hecho  | 0.1.0   |
| F-012 | Búsqueda global por nombre, en vivo y entre todos los ambientes                       | Hecho  | 0.1.0   |
| F-013 | Importar desde `.env` pegado, con vista previa                                        | Hecho  | 0.1.0   |
| F-014 | Exportar un ambiente a `.env`, CSV o PDF                                              | Hecho  | 0.1.0   |
| F-016 | Exportar un ambiente a JSON (documento versionado con ambiente, nombre, valor y nota) | Hecho  | 0.2.0   |
| F-015 | Generador de valores aleatorios                                                       | Hecho  | 0.1.0   |

## Organización

| ID    | Funcionalidad                                                                                     | Estado      | Versión |
| ----- | ------------------------------------------------------------------------------------------------- | ----------- | ------- |
| F-120 | Proyectos: agrupar ambientes en un árbol; crear, renombrar y eliminar proyectos vacíos (ADR-0007) | En revisión | 0.2.0   |

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
| F-110 | Importar desde archivo: `.env`/TXT, CSV y JSON (mismo formato que se exporta), con vista previa   | Planeado | 0.2.0   |
| F-111 | Exportar solo los secretos seleccionados (casillas en la tabla), en cualquier formato             | Planeado | 0.2.0   |
| F-112 | Paginación por offset del listado de secretos (`limit` y `offset`, con total)                     | Planeado | 0.2.0   |

El resto del backlog (backup y restauración, borrado automático del portapapeles, E2E en CI, etc.) está en
[TODO.md](TODO.md) y entra aquí cuando se corta como rebanada.

## Planeado · organización y Postman

| ID    | Rebanada                                                                                         | Estado   | Versión |
| ----- | ------------------------------------------------------------------------------------------------ | -------- | ------- |
| F-121 | Vistas de secretos: lista (actual), tarjetas y compacta, con la preferencia guardada             | Planeado | 0.2.0   |
| F-122 | Exportar a Postman Environment (JSON; valores como `secret`, compatible con todas las versiones) | Planeado | 0.2.0   |
| F-123 | Importar desde Postman (Environment, Globals y variables de una colección v2.1) a un proyecto    | Planeado | 0.2.0   |
| F-124 | Mover un ambiente a otro proyecto                                                                | Planeado | 0.2.0   |

## Planeado · gestión de secretos y ajustes

| ID    | Rebanada                                                                                                            | Estado   | Versión |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| F-125 | Selección múltiple y borrado en lote, con confirmación que cuenta y lista los nombres (atómico)                     | Planeado | 0.2.0   |
| F-126 | Orden alfabético A→Z / Z→A, con la preferencia guardada                                                             | Planeado | 0.2.0   |
| F-127 | Orden manual por ambiente: arrastrar y soltar, con botones subir y bajar (solo en modo Manual)                      | Planeado | 0.2.0   |
| F-130 | Ajustes · 1: cambiar el logo de la pantalla de entrada (PNG, JPEG o WebP; fuera de la bóveda)                       | Planeado | 0.2.0   |
| F-131 | Ajustes · 2: nombre de la app, color de acento y tema por defecto                                                   | Planeado | 0.2.0   |
| F-132 | Ajustes · 3: seguridad editable (auto-bloqueo, vida de sesión, borrado del portapapeles); pide contraseña           | Planeado | 0.2.0   |
| F-133 | Ajustes · 4: copia de seguridad (exportar el archivo cifrado) y retención o vaciado de la auditoría                 | Planeado | 0.2.0   |
| F-134 | Idioma de la interfaz: español e inglés                                                                             | Planeado | 0.2.0   |
| F-135 | Tema con vista previa: modo (claro, oscuro o automático), 7 acentos y fondo; reemplaza los colores fijos por tokens | Planeado | 0.2.0   |
| F-136 | Asistente de primer arranque: idioma, nombre, logo y tema antes de crear la bóveda (se puede omitir)                | Planeado | 0.2.0   |
| F-137 | Tour guiado tras crear la bóveda: crear y revelar secretos, buscar, importar, exportar, proyectos y seguridad       | Planeado | 0.2.0   |

Los ajustes son **por instancia** (quien tiene la bóveda abierta los administra, sin roles) y se guardan fuera de
la bóveda, en la carpeta de datos, para poder leerse antes de desbloquear. El logo solo admite imágenes
rasterizadas (el SVG puede ejecutar scripts), valida el contenido real del archivo y limita su tamaño.

### Orden propuesto

1. F-125, F-126 y F-127 (selección, orden alfabético y orden manual).
2. F-122 (exportar a Postman) y luego F-110 y F-123 (importar desde archivo y desde Postman).
3. F-121 (vistas) y F-124 (mover ambientes).
4. Personalización (ADR-0008), cada una sobre la anterior: F-130 y F-131 (ajustes, nombre y logo), F-135 (tema),
   F-134 (idioma: los textos del asistente y del tour deben estar ya externalizados), F-136 (asistente) y F-137 (tour).
5. F-100 a F-103 (bóvedas múltiples), F-111 (exportar seleccionados, depende de F-125) y F-112 (paginación).

El idioma es la rebanada más grande (externalizar todos los textos); se corta por pantallas, con el español como base
y respaldo. El release v0.1.0 puede cortarse antes de cualquiera de estas.
