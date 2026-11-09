---
name: test-coverage
description: Mide la cobertura con bun test, identifica código sin tests o con ramas sin cubrir y genera los specs faltantes siguiendo las convenciones del proyecto.
---

1. `bun run test:cov` y revisa archivos con <85 % de líneas o ramas críticas sin cubrir.
2. Prioriza: **seguridad/cripto/sesiones** > casos de uso (`core`) > repositorios > rutas > utilidades.
3. Por tipo:
   - Caso de uso → mocks tipados + inyección por constructor (happy, no encontrado, conflicto,
     invariantes, efectos).
   - Repositorio → SQLite `:memory:` real (constraints, búsqueda, cascadas).
   - Ruta → `app.request()`; incluye 401 sin sesión y validación de entrada hostil.
   - Cripto → cripto real; tamper, AAD cruzado, clave incorrecta.
   - Frontend → utilidades puras con `bun test`; componentes con `@vue/test-utils` + `happy-dom`.
4. Un test nuevo de seguridad debe **fallar** si quitas el control que prueba (compruébalo).
5. No persigas el 100 % por el 100 %: cubre comportamiento y bordes, no líneas triviales.
6. Termina con `bun test`, `bun run typecheck`, `bun run lint:check`.
