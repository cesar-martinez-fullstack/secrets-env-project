# Calidad de código

El código debe ser **limpio, vigente y probado**. Nada heredado, obsoleto ni "por si acaso".

## Comentarios y documentación en el código

- Por defecto **ningún comentario**: los nombres y la estructura deben bastar.
- Solo se comenta el **porqué** que no se puede deducir (una decisión de seguridad, un workaround, un
  límite del entorno). Nunca el qué, nunca historia de la tarea, nunca código comentado.
- Sin banners ni cabeceras de archivo que repiten el nombre. JSDoc únicamente en los **puertos** y en
  funciones exportadas con un contrato no evidente (precondiciones, errores, unidades).
- Al tocar un archivo, se recortan los comentarios que solo narran el código. No se hace una limpieza
  masiva de archivos ajenos a la rebanada (ver `ISSUES.md`).
- La documentación vive en `docs/` y es corta: se **actualiza** lo que existe antes de crear otro documento.

## Estándar moderno (TypeScript / JavaScript)

- ES2022+ y ESM. `node:` en los imports de Node. `import type` para tipos (`verbatimModuleSyntax`).
- `const` por defecto; sin `var`. Funciones pequeñas y puras cuando se pueda; inmutabilidad (`readonly`,
  `as const`, `satisfies`); `?.`, `??`, `Array.prototype.at`, `structuredClone`, `Promise.allSettled`.
- Tipos estrictos: **sin `any`** (usar `unknown` y estrechar), **sin `enum`** (uniones literales u objetos
  `as const`), uniones discriminadas con `switch` exhaustivo (`never`), `noUncheckedIndexedAccess`.
- Preferir la **plataforma** (`fetch`, Web Crypto, `node:crypto`, APIs de Bun) antes que una dependencia.
- **Prohibido lo obsoleto o deprecado**: `document.execCommand`, `var`, callbacks de Node en lugar de
  promesas, `require`, `substr`, `new Buffer`, polyfills innecesarios, Options API o mixins de Vue.
- Vue 3: `<script setup lang="ts">`, Composition API, stores de Pinia en formato _setup_, `defineProps` /
  `defineEmits` tipados. Sin estilos ni lógica de negocio en las plantillas. Una prop booleana ausente vale
  `false` (no `undefined`): para un valor por defecto `true` se usa `withDefaults`.
- Sin exportaciones por defecto salvo las que exige la herramienta (SFC, archivos de configuración).
- Errores esperados como `DomainError` con código estable; nada de `catch {}` que se traga fallos sin razón
  explícita.

## Dependencias

- Menos es más: cada dependencia nueva exige justificar por qué la plataforma no alcanza. Versiones actuales
  y mantenidas; `bun audit` limpio. Los saltos de versión mayor van en su propio PR, con su verificación.

## Pruebas

- Toda lógica nueva trae su prueba; todo bug corregido trae una prueba que lo reproduce antes del arreglo.
- Pirámide: muchos unitarios en `core`, integración para cableado y seguridad, y verificación E2E de la
  rebanada. Pruebas deterministas (reloj y azar inyectados) y legibles (`it('should …')`, un motivo de fallo).
- Una prueba de seguridad debe fallar si se retira el control que protege.

## Tamaño y estructura

- Funciones ≤30 líneas, complejidad ≤8, ≤3 parámetros (el lint avisa). Si se supera, se extrae; no se silencia.
- Un módulo, una responsabilidad. Nombres que dicen la intención (`openWithRecovery`, no `process2`).
- Sin código muerto: lo que no se usa se borra (git lo recuerda).
