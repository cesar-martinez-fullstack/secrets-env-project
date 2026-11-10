# Documentación

Mapa del proyecto. Cada tema tiene un único documento: se actualiza el existente antes de crear otro.

## Cómo va el proyecto

| Documento                          | Responde a                                                       |
| ---------------------------------- | ---------------------------------------------------------------- |
| [FEATURES.md](FEATURES.md)         | ¿Qué hace el producto y en qué estado está cada funcionalidad?   |
| [ISSUES.md](ISSUES.md)             | ¿Qué bugs, riesgos y deuda hemos encontrado y cómo se previenen? |
| [TODO.md](TODO.md)                 | ¿Qué sigue? Backlog priorizado                                   |
| [../CHANGELOG.md](../CHANGELOG.md) | ¿Qué cambió en cada versión publicada?                           |

## Cómo está construido

| Documento                          | Contenido                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagramas C4, trade-offs, qué NO hacemos, camino de evolución |
| [adr/](adr/README.md)              | Decisiones difíciles de revertir y sus alternativas           |
| [SECURITY.md](SECURITY.md)         | Modelo de amenazas y controles (OWASP)                        |
| [TESTING.md](TESTING.md)           | Estrategia de pruebas por capa                                |
| [context.md](context.md)           | Traspaso: diseño criptográfico, datos y decisiones de fondo   |

## Cómo trabajamos

| Documento                          | Contenido                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [GIT_WORKFLOW.md](GIT_WORKFLOW.md) | Git Flow, commits, PRs y releases                                                                                         |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Herramientas y MCPs necesarios                                                                                            |
| [../CLAUDE.md](../CLAUDE.md)       | Guía para el agente; enlaza las reglas de `.claude/rules/` (rebanadas verticales, calidad de código, API, datos, testing) |

## Qué se actualiza y cuándo

- **Una rebanada entregada:** su fila en `FEATURES.md`, en el mismo PR.
- **Un bug hallado:** una entrada en `ISSUES.md`, con causa raíz y prueba de regresión.
- **Un release:** `CHANGELOG.md` (skill `cut-release`) y el estado de `FEATURES.md`.
- **Una decisión difícil de revertir:** un ADR corto.
- **Una herramienta o MCP nuevo:** `REQUIREMENTS.md`.
