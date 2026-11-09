# Estilo de código

## TypeScript

- `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`: usa `import type` para tipos.
- Prefiere `interface` para contratos (puertos) y `type` para uniones.
- Sin `any` salvo en fronteras sin tipos (justificado en un comentario de una línea).
- Errores esperados = subclases de `DomainError` con código estable de `shared/error-codes.ts`.
  `throw new Error(...)` genérico solo para fallos de infraestructura o invariantes rotas.
- Inmutabilidad por defecto: `readonly`, `as const`, sin mutar parámetros.

## Nombrado

- Casos de uso / servicios: `VerbNounService` o `noun-service.ts`; métodos como verbos (`create`, `reveal`).
- Puertos: interfaz sin prefijo `I` (`SecretRepository`); implementación con tecnología (`SqliteSecretRepository`).
- Constantes: `SCREAMING_SNAKE_CASE`. Booleanos: `isX`, `hasX`, `canX`.

## Tamaño y complejidad (warnings de ESLint)

- Funciones ≤30 líneas, complejidad ≤8, profundidad ≤3, ≤3 parámetros (6 en DI/rutas).
- Si superas un límite, **extrae** (método privado, helper puro, objeto de parámetros) en vez de
  silenciar la regla. Las funciones que registran rutas están exentas por ser declarativas.

## Imports

- Entre paquetes: siempre por nombre de workspace (`@secretvault/core`), nunca rutas relativas que
  crucen paquetes (lo verifica `architecture.spec.ts`).
- Dentro de un paquete: relativos cortos; si superan `../../`, usa el alias del paquete (`@/…` en web).

## Comentarios

- Explica el **por qué** no obvio (una decisión de seguridad, un workaround). No el qué.
- JSDoc en puertos y en funciones exportadas con contrato no trivial.
