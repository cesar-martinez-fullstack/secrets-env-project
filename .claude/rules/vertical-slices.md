# Desarrollo por rebanadas verticales

El proyecto **no** se construye en cascada (primero toda la API, luego toda la base de datos, luego la
interfaz). Cada funcionalidad es una **rebanada vertical**: atraviesa todas las capas lo mínimo necesario
y **da valor por sí sola**, desde el primer momento en que alguien puede usarla.

## Qué es una rebanada

- Un comportamiento **visible para la persona usuaria** de principio a fin: interfaz → API → caso de uso
  → datos, con tests.
- Lo más fina posible: lo mínimo en cada capa para que el comportamiento funcione hoy.
- Entregable y verificable sola. Si no se puede probar en el navegador, es demasiado fina o está mal cortada.
- Cortar por **comportamiento, no por capa**. "Crear la tabla de bóvedas" no es una rebanada;
  "crear una segunda bóveda y entrar a ella" sí.

## Cómo se trabaja una rebanada

1. **Enunciarla** en una frase y con 3–5 criterios de aceptación (dado / cuando / entonces). Va en la
   descripción del PR y en la fila de `docs/FEATURES.md` (estado _Planeado_ → _En revisión_ → _Hecho_).
2. **Test primero**, al nivel más alto que ya demuestre el valor (normalmente integración con
   `app.request()`); después los unitarios que hagan falta.
3. **Implementar lo mínimo en todas las capas** para ponerlo en verde. Sin abstracciones para rebanadas futuras.
4. **Verificar en el navegador** con Playwright CLI (recorrido feliz y los fallos más probables) y revisar la
   consola. El resultado se resume en el PR; no se pide a la persona que lo repita.
5. **Refactorizar** con los tests en verde. Una abstracción se extrae cuando aparece su **segundo** uso real.
6. **Documentar lo justo**: fila en `FEATURES.md`; entrada en `ISSUES.md` si apareció un bug; ADR solo si hay
   una decisión difícil de revertir (corto, sin diseño de rebanadas futuras).

## Qué NO se hace

- Diseñar de antemano rebanadas que no se van a construir ya. Se decide lo que la rebanada actual necesita.
- Construir capas, puertos, tablas o endpoints "para después".
- Dejar una rebanada a medias (código sin interfaz, interfaz sin datos reales) en `develop`.

## Tamaño de PR y de commits

- **Un PR = una rebanada** (o un cambio coherente). Debe poder revisarse de una sentada; como guía, menos de
  ~400 líneas de diff sin contar lockfile ni archivos generados. Si es mayor, se corta **por rebanadas**, nunca
  por capas.
- **1 a 5 commits por PR**, cada uno un paso con sentido que deja el repositorio en verde (compila, tests,
  lint). Nada de commits "wip", ni un commit por archivo o por capa, ni una cascada de PRs minúsculos.
- Los arreglos de la revisión se integran en el commit al que pertenecen antes de subir (sin `fixup` sueltos).
- Un bug que aparece **dentro** de la rebanada se corrige en el mismo PR; uno **ajeno** va en su propio PR.

## Definición de terminado

Tests en verde (incluida la rebanada nueva) · typecheck y lint sin errores · verificación en navegador
hecha · seguridad revisada si toca superficie sensible · `FEATURES.md` actualizado · sin código muerto, sin
`TODO` huérfanos, sin comentarios que expliquen lo obvio.
