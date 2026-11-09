# ADR-0004 · Perímetro solo-localhost

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

La aplicación custodia secretos de una sola persona. Exponerla a la red local o a Internet ampliaría
mucho la superficie (fuerza bruta remota, CSRF desde otros dispositivos) sin beneficio para el caso de uso.

## Decisión

Defensa en profundidad, todas las capas activas por defecto:

1. Escucha en `127.0.0.1`; Docker publica `127.0.0.1:3000` y el contenedor corre sin root.
2. `hostGuard`: solo `localhost`, `127.0.0.1` y `[::1]` (más `SV_ALLOWED_HOSTS` explícito) → anti DNS-rebinding.
3. `originGuard`: las peticiones que mutan estado deben ser del mismo origen → anti CSRF.
4. CSP estricta (`script-src 'self'`), `frame-ancestors 'none'`, `nosniff`, `no-referrer`.
5. Sesión: token opaco en cookie `HttpOnly`/`SameSite=Lax`, expiración deslizante y absoluta.
6. Rate limiting en unlock/setup/change-password (protege la contraseña maestra, no una "API pública").

## Alternativas consideradas

- **Escuchar en `0.0.0.0` con autenticación** — innecesario y arriesgado para un uso personal.
- **TLS local con certificado propio** — complejidad sin ganancia en loopback; sí se recomienda tras un proxy.
- **Eliminar el rate limiting por ser solo-localhost** — se mantiene: es la última barrera frente a fuerza
  bruta desde cualquier proceso local o página maliciosa que lograra alcanzar el puerto.

## Consecuencias

- Positivas: superficie mínima; cada capa tiene tests en `perimeter.spec.ts`.
- Negativas: no apto para uso en red sin un proxy propio y una nueva revisión de amenazas.
- Evolución: acceso remoto = nuevo ADR (TLS, `SV_COOKIE_SECURE`, `SV_TRUST_PROXY`, límites por usuario).
