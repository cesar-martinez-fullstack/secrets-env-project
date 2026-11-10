# ADR-0006 · Cifrado de envoltura y clave de recuperación

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

Con la clave derivada directamente de la contraseña maestra, olvidar la contraseña significaba perder
todos los secretos sin remedio, y cambiarla obligaba a re-cifrar cada secreto. Se evaluó un enlace de
recuperación por correo (con un proveedor como Brevo) y se descartó: un enlace solo prueba identidad, pero
aquí lo que falta es **la clave**; para que un correo pudiera restaurar el acceso la clave tendría que
viajar por correo o custodiarse en un servidor, y la seguridad pasaría a depender de la bandeja de entrada.
Además rompería la propiedad "sin cuentas ni peticiones salientes".

## Decisión

Cifrado de envoltura (envelope encryption):

- Una **clave de datos (DEK)** aleatoria de 256 bits cifra todos los secretos y el verificador.
- La DEK se guarda **envuelta dos veces** con AES-256-GCM: con una KEK derivada de la contraseña
  (PBKDF2-HMAC-SHA256) y con una KEK derivada de una **clave de recuperación** aleatoria de 256 bits
  (HKDF-SHA256; no necesita un KDF lento porque ya tiene entropía máxima).
- La clave de recuperación se muestra **una sola vez** (Crockford base32, 13 grupos de 4) y no se guarda.
- Cambiar la contraseña solo **re-envuelve la DEK** (una fila, atómico); los secretos no se tocan.
- Recuperar el acceso (`POST /api/vault/recover`, ruta pública con rate limit) abre la DEK con la clave de
  recuperación, fija una contraseña nueva y **reemplaza** la clave de recuperación por otra nueva.
- Las bóvedas del formato anterior (`format_version = 1`) se actualizan solas al desbloquearlas: la clave
  derivada pasa a ser la DEK (sin re-cifrar nada) y se entrega su clave de recuperación.

## Alternativas consideradas

- **Enlace por correo (Brevo u otro)** — descartado (ver Contexto): custodia de la clave fuera del equipo.
- **Reparto de la clave (Shamir) entre personas de confianza** — potente pero con mucha más complejidad.
- **Dejarlo sin recuperación** — coherente con la promesa original, pero demasiado frágil para uso real.
- **Pista de contraseña** — debilita la contraseña y no permite recuperar nada.

## Consecuencias

- Positivas: se puede recuperar el acceso sin servidores; cambiar la contraseña es instantáneo y atómico;
  el diseño ya admite añadir más "envolturas" (otro dispositivo, otra persona) sin re-cifrar datos.
- Negativas: la clave de recuperación es un **segundo secreto que la persona debe custodiar**; quien la tenga
  abre la bóveda. Si se pierden contraseña y clave, sigue sin haber recuperación. Aumenta la superficie
  (un endpoint público más, protegido por una clave de 256 bits, rate limit y auditoría).
- Datos: migración de esquema 2 (columnas de la envoltura con `CHECK` de coherencia); `format_version`
  distingue las bóvedas anteriores. Antes de 1.0.0 es un cambio de formato (incremento menor).
- Reversión: no es trivial una vez entregada una clave de recuperación; habría que migrar de vuelta a la DEK
  derivada y retirar el endpoint.
