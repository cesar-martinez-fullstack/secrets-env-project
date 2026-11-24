---
name: vertical-slice
description: Entrega una funcionalidad como rebanada vertical (interfaz, API, caso de uso, datos y tests, lo mínimo en cada capa) que da valor por sí sola, con verificación en navegador. Úsalo para toda feature nueva; reemplaza al antiguo enfoque por capas.
---

Reglas completas en `.claude/rules/vertical-slices.md` y `.claude/rules/code-quality.md`. Resumen operativo:

1. **Enuncia la rebanada** en una frase y 3–5 criterios de aceptación. Pregunta solo lo que cambie el diseño.
   Añade o actualiza su fila en `docs/FEATURES.md` (_Planeado_).
2. **Revisa** con `architecture-review` (capa y dependencias); `design-patterns` solo si ya duele algo concreto.
3. **Test primero** al nivel más alto que demuestre el valor (integración con `app.request()`), y el unitario
   de lo que tenga lógica. Debe fallar por la razón correcta.
4. **Implementa lo mínimo, de punta a punta**, en el orden que haga el test verde más pronto. Contratos en
   `shared`, regla en `core` (nuevo puerto solo si hay algo externo), adaptador en `crypto`/`database`
   (migración nueva si cambia el esquema: skill `db-migration`), ruta fina en `api`, interfaz en `web`.
   Cableado únicamente en `container.ts`. Sin abstracciones para rebanadas futuras.
5. **Verifica en el navegador** con Playwright CLI desde la carpeta temporal de pruebas (no ensucies el repo):
   servidor aislado con datos en un directorio temporal (API y Vite con `SV_API_URL`, por el mismo camino que usa la persona), recorrido feliz, fallos probables y consola sin errores.
   Detén el servidor y cierra el navegador al terminar.
6. **Refactoriza** en verde (extrae al segundo uso real). Recorta comentarios que narran código.
7. **Cierra**: `bun run verify`, `bun run test:architecture`, `bun run test:security` si tocó seguridad, skill
   `owasp-security-review` si tocó superficie sensible. Actualiza `FEATURES.md` (_En revisión_), `ISSUES.md` si
   hubo un bug, y un ADR corto solo si la decisión es difícil de revertir.
8. **Un PR por rebanada**, 1–5 commits que dejan todo en verde, descripción con los criterios y el resultado de
   la verificación en navegador. Nunca un commit por capa.
