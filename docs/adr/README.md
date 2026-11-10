# Architecture Decision Records (ADR)

Registro corto de las decisiones de arquitectura difíciles de revertir: **qué** se decidió, **por qué** y
**qué costó**. Un ADR aceptado no se edita: si la decisión cambia, se escribe uno nuevo que lo reemplaza
y el anterior pasa a `Reemplazado por ADR-XXXX`.

## Cuándo escribir uno

Formato de cifrado o de datos · motor de base de datos · modelo de sesión/autenticación · límites entre
paquetes · superficie de red · flujo de trabajo del repositorio. No para decisiones locales y reversibles.

## Índice

| ADR                                              | Título                                                          | Estado    |
| ------------------------------------------------ | --------------------------------------------------------------- | --------- |
| [0001](0001-modular-monolith.md)                 | Monolito modular con Clean Architecture                         | Aceptado  |
| [0002](0002-sqlite-storage.md)                   | SQLite de un solo archivo como almacenamiento                   | Aceptado  |
| [0003](0003-row-bound-aad.md)                    | Cifrado AES-GCM con AAD ligado a la fila                        | Aceptado  |
| [0004](0004-local-only-perimeter.md)             | Perímetro solo-localhost                                        | Aceptado  |
| [0006](0006-envelope-encryption-recovery-key.md) | Cifrado de envoltura y clave de recuperación                    | Aceptado  |
| [0007](0007-projects.md)                         | Proyectos como nivel de organización dentro de la bóveda        | Aceptado  |
| [0008](0008-decoupled-personalization.md)        | Personalización desacoplada: ajustes, tokens de diseño y textos | Propuesto |
| [0009](0009-share-package.md)                    | Paquete cifrado para compartir proyectos y ambientes            | Aceptado  |
| [0005](0005-git-flow-and-releases.md)            | Git Flow, Conventional Commits y tags SemVer                    | Aceptado  |

## Plantilla

```markdown
# ADR-XXXX · Título

- Estado: Propuesto | Aceptado | Reemplazado por ADR-YYYY
- Fecha: AAAA-MM-DD

## Contexto

Qué problema o fuerza obliga a decidir.

## Decisión

Qué se decide, en una o dos frases claras.

## Alternativas consideradas

- Opción A — por qué no.
- Opción B — por qué no.

## Consecuencias

- Positivas: …
- Negativas / deuda aceptada: …
- Qué habría que cambiar para revertirla: …
```
