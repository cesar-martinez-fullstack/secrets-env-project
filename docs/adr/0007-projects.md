# ADR-0007 · Proyectos como nivel de organización dentro de la bóveda

- Estado: Aceptado
- Fecha: 2026-11-10

## Contexto

Los ambientes (`Local`, `QA`, `Production`…) vivían sueltos y su nombre era único en toda la bóveda: no se
podía saber a qué aplicación pertenece "Local" ni tener un "Local" por aplicación.

## Decisión

Jerarquía **bóveda → proyecto → ambiente → secreto**. Un ambiente pertenece a exactamente un proyecto y su
nombre es único **dentro** del proyecto. Los proyectos son solo organización: el límite de cifrado y de
acceso sigue siendo la bóveda (una contraseña, una clave de datos).

- Migración 3: tabla `projects` y `environments.project_id NOT NULL` con `ON DELETE RESTRICT`. Los ambientes
  existentes pasan al proyecto `General`, que también existe en las bóvedas nuevas.
- Eliminar un proyecto exige que esté vacío: nunca se borran ambientes ni secretos en cascada desde un proyecto.
- Reconstruir `environments` exige suspender las claves foráneas: un `DROP TABLE` con ellas activas borraría en
  cascada todos los secretos. El ejecutor de migraciones lo hace con `rebuildsTables: true` (apaga
  `foreign_keys`, valida `foreign_key_check` y las reactiva, también si la migración falla).

## Alternativas consideradas

- **Etiquetas o prefijos en el nombre del ambiente** — sin integridad referencial ni vista en árbol.
- **Una bóveda por proyecto** — aísla el cifrado, pero obliga a una contraseña por proyecto; eso queda para
  las bóvedas múltiples, que resuelven otra necesidad (separar quién puede abrir qué).
- **Cascada al eliminar un proyecto** — cómodo, pero un clic podría destruir muchos secretos.

## Consecuencias

- Positivas: se distingue "General › Local" de "Tienda › Local"; la estructura admite mover ambientes entre
  proyectos, exportar por proyecto y vistas en árbol.
- Negativas: las rutas y los DTO de ambientes ahora exigen `projectId`; mover un ambiente a otro proyecto no
  está soportado todavía.
- Reversión: aplanar de nuevo exigiría otra migración que reconstruya `environments`.
