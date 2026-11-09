# ADR-0001 · Monolito modular con Clean Architecture

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

Aplicación para una sola persona, en su equipo, que debe poder crecer sin reescribirse. Se necesita
despliegue trivial, depuración sencilla y límites claros para cambiar tecnologías (motor de datos, cifrado,
UI) sin tocar las reglas de negocio.

## Decisión

Un único proceso (monolito) organizado en un monorepo Bun con paquetes por responsabilidad
(`shared`, `core`, `crypto`, `database`, `api`, `web`), siguiendo puertos y adaptadores. `core` define los
puertos y no depende de ningún framework; `apps/api/src/container.ts` es el único lugar que conoce las
implementaciones. La regla de dependencia se verifica en `tests/architecture.spec.ts`.

## Alternativas consideradas

- **Microservicios** — añaden red, despliegue y superficie de ataque sin beneficio para un usuario.
- **Aplicación en capas sin puertos** — más rápida de escribir, pero acopla el negocio a SQLite/Hono.
- **Un único paquete** — frontera menos explícita; la disciplina dependería solo de la revisión.

## Consecuencias

- Positivas: despliegue de un binario/contenedor, tests rápidos del núcleo, tecnologías intercambiables.
- Negativas: algo de ceremonia (interfaces, `container.ts`); no se escala por componente (no hace falta).
- Reversión: fusionar paquetes es mecánico; el coste real sería perder la verificación automática de capas.
