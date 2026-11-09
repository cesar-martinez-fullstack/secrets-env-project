---
name: architecture-principles
description: Principios de arquitectura de software aplicados a SecretVault (Clean/Hexagonal, SOLID, DRY/KISS/YAGNI, ACID, seguridad por diseño). Úsalo al tomar una decisión de diseño, al revisar una propuesta o cuando algo "huele" mal.
---

## Cómo usar esta skill

Antes de diseñar, recorre la lista y anota **qué principio está en tensión**. Si dos chocan
(p. ej. DRY vs. acoplamiento), gana el que reduce el costo de cambio probable, no el más elegante.
Un principio que no resuelve un problema real de este código **no se aplica**.

## 1. Regla de dependencia (Clean / Hexagonal)

Las dependencias apuntan **hacia adentro**: `web → api → core ← (crypto, database)`.
`core` define puertos (interfaces) que expresan lo que el negocio necesita; los adaptadores los
implementan. Cambiar SQLite por Postgres o `node:crypto` por WebCrypto = tocar un paquete adaptador
y una línea del `container.ts`.

- Test rápido: ¿puedo ejecutar el caso de uso en un test sin Bun, sin red y sin disco? Si no, hay fuga.
- El dominio no conoce HTTP (códigos de estado vienen en `DomainError` solo como dato; la traducción
  es de `api`).

## 2. SOLID aplicado

| Principio | En este proyecto                                                                                       | Señal de violación                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **S**RP   | `SecretService` orquesta secretos; cifrar vive en `VaultCryptoService`; auditar en `AuditRepository`   | una clase con >1 razón para cambiar; método que valida + cifra + persiste + formatea |
| **O**CP   | Añadir un formato de export sin tocar la ruta (Strategy/registro)                                      | `if/else`/`switch` creciente sobre un tipo                                           |
| **L**SP   | Cualquier `SecretRepository` (SQLite, en memoria) debe comportarse igual ante los mismos tests         | un adaptador que lanza donde el puerto promete `null`                                |
| **I**SP   | Puertos pequeños por responsabilidad (`SessionStore`, `AuditRepository`…)                              | un puerto "dios" que obliga a mockear 12 métodos                                     |
| **D**IP   | Casos de uso reciben puertos por constructor; `container.ts` es el único que hace `new` de adaptadores | `new SqliteX()` dentro de `core`, o importar `bun:sqlite` allí                       |

## 3. Cohesión y acoplamiento

- Alta cohesión: lo que cambia junto, vive junto (módulo por capacidad, no por tipo técnico cuando crezca).
- Acoplamiento por **contrato** (interfaz/DTO), no por detalle (columnas, formato de blob).
- Ley de Demeter: una ruta no debería conocer cómo se cifra; pide el caso de uso.

## 4. DRY / KISS / YAGNI

- **DRY** de _conocimiento_, no de texto: dos fragmentos parecidos con razones distintas de cambio
  no se unifican. Sí se unifica toda regla de negocio duplicada (p. ej. `verifyPassword`).
- **KISS**: la solución más simple que cumple los invariantes de seguridad.
- **YAGNI**: sin capas ni patrones "por si acaso". Monorepo de un usuario; escalar = poder, no hacer.

## 5. Datos: ACID y consistencia

Ver `.claude/rules/database.md`. Principio: **la integridad se garantiza en la base**
(constraints, transacciones), no solo en el código. Toda escritura multi-fila es atómica.

## 6. Seguridad por diseño

- **Mínimo privilegio**: usuario no-root en el contenedor, puerto solo en loopback.
- **Defensa en profundidad**: bind loopback → Host guard → Origin guard → SameSite → CSP → sesión → cifrado.
- **Fallar cerrado**: ante la duda, denegar (rutas protegidas por defecto; públicas = allowlist).
- **Secure by default**: la configuración por defecto es la segura; relajarla exige opt-in explícito.
- **Mínima exposición de secretos**: el valor existe en claro solo en RAM y solo durante `reveal`/export.
- **No confiar en el cliente**: validar en el servidor aunque el frontend ya valide.

## 7. Testabilidad como criterio de diseño

Reloj, azar y E/S inyectables. Si algo es difícil de testear, el diseño está acoplado.

## 8. Decisiones: ADR ligero

Para decisiones que cuesta revertir (formato cifrado, motor de datos, modelo de sesión), añade un
bloque a `docs/context.md` (sección "Decisiones") con: contexto · decisión · alternativas · consecuencias.

## 9. Trade-offs: toda decisión tiene un costo

Antes de decidir, escribe **qué ganas y qué pagas** (consistencia vs. disponibilidad, simplicidad vs.
flexibilidad, seguridad vs. comodidad). Lo no obvio y difícil de revertir va a un **ADR** en `docs/adr/`.
Los trade-offs vigentes están tabulados en `docs/ARCHITECTURE.md §4`.

## 10. Escalar a propósito, no por adelantado

Diseña los **puntos de extensión** (puertos, migraciones, versión de formato) y **no** construyas lo que
aún no hace falta. Patrones de sistemas distribuidos y qué hacemos con ellos:

| Patrón                                                  | Aquí                                             | Disparador para reconsiderarlo                                               |
| ------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Microservicios / serverless / API Gateway               | No                                               | Varios equipos o usuarios con despliegues independientes                     |
| CQRS / Event Sourcing                                   | No                                               | Auditoría legal inmutable o lecturas con modelo muy distinto al de escritura |
| Colas / brokers                                         | No                                               | Trabajo asíncrono real o integraciones externas                              |
| Caché (Redis/CDN)                                       | No (y cachear secretos descifrados es un riesgo) | Latencia medida, no supuesta                                                 |
| Sharding / réplicas                                     | No                                               | Volumen que SQLite no soporte (improbable)                                   |
| Circuit breaker / Saga / retries                        | No                                               | Primera dependencia externa en red                                           |
| Observabilidad (logs estructurados, `/ready`, métricas) | Parcial                                          | Despliegue desatendido o multiusuario; tracing solo si hay varios servicios  |

Camino de evolución concreto: `docs/ARCHITECTURE.md §6`.

## 11. Seguridad y resiliencia como requisito de diseño

- **Security by design**: el control existe desde el diseño y tiene un test que falla si se retira.
- **Resiliencia a escala local** = integridad y recuperación: transacciones, migraciones transaccionales,
  `quick_check`, **backup consistente + restauración probada** (pendiente en `docs/TODO.md`).
- **Fallar cerrado y sin dejar datos a medias**; nunca confiar en que "el cliente ya validó".
- Cifrado en reposo (AES-GCM) y en tránsito (TLS cuando haya acceso remoto vía proxy).

## 12. Comunicar la arquitectura

- Diagramas **C4** (contexto → contenedores → componentes) en `docs/ARCHITECTURE.md`; actualízalos
  en el mismo cambio que altere la estructura.
- Explica una decisión a tres niveles: una frase para quien no es técnico, el trade-off para quien
  decide, y el ADR/código para quien implementa.
- Prioriza por **valor y riesgo** (qué protege más al usuario / reduce más el costo de cambio), no por
  novedad técnica.

## Checklist de revisión rápida

- [ ] ¿La dependencia apunta hacia adentro?
- [ ] ¿Una sola razón de cambio por clase/módulo?
- [ ] ¿Hay `if/else` sobre tipos que debería ser polimorfismo/registro?
- [ ] ¿La regla de negocio está en `core` y no en la ruta ni el repositorio?
- [ ] ¿Escrituras múltiples atómicas?
- [ ] ¿El default es el seguro?
- [ ] ¿Es lo más simple que funciona? ¿Hay algo "por si acaso"?
