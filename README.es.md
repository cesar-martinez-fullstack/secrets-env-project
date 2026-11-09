<div align="center">

# SecretVault

**Gestor local de secretos y variables de entorno, cifrado en reposo.**

[![CI](https://github.com/cesar-martinez-fullstack/secrets-env-project/actions/workflows/ci.yml/badge.svg)](https://github.com/cesar-martinez-fullstack/secrets-env-project/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/cesar-martinez-fullstack/secrets-env-project?include_prereleases)](https://github.com/cesar-martinez-fullstack/secrets-env-project/releases)

[English](README.md) · Español

</div>

SecretVault guarda tus API keys, tokens y variables `.env` en un archivo SQLite cifrado en
**tu propio equipo**. Sin nube, sin cuentas, sin telemetría y sin peticiones salientes. Una
contraseña maestra desbloquea la bóveda; la clave de cifrado vive **solo en RAM** mientras
está desbloqueada y se borra al bloquear.

> **Regla de oro:** los secretos nunca tocan el disco en texto plano y la clave de cifrado
> no toca el disco en absoluto.

## Funcionalidades

- **Bóveda cifrada** — AES-256-GCM; clave derivada de la contraseña maestra con PBKDF2-HMAC-SHA256 (600k iteraciones por defecto).
- **Ambientes** — organiza secretos en `Local`, `QA`, `Production`… con conteo por ambiente.
- **Enmascarado por defecto** — los valores nunca se listan; solo salen por un `reveal` auditado.
- **Búsqueda global** — por nombre de variable, instantánea y sin distinguir mayúsculas, en todos los ambientes.
- **Importar / exportar** — pega un `.env` para importar; exporta a `.env`, CSV o PDF imprimible.
- **Auditoría** — cada desbloqueo, desbloqueo fallido, revelado, exportación y rotación queda registrado (nunca con valores).
- **Auto-bloqueo** por inactividad, con tope absoluto de vida de la sesión.
- **Clave de recuperación** — una clave de 256 bits, mostrada una sola vez, permite recuperar el acceso si
  olvidas la contraseña; al usarla se emite una nueva. Cambiar la contraseña no re-cifra tus secretos
  (cifrado de envoltura).
- Generador de valores, tema claro/oscuro y despliegue en un solo contenedor Docker.

## Modelo de seguridad

Pensado para **un usuario en un equipo**. A propósito no es accesible desde tu red.

| Capa                 | Control                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Red                  | Escucha en `127.0.0.1`; Docker publica el puerto solo en loopback                                         |
| Navegador            | Lista de hosts permitidos (anti DNS-rebinding), chequeo de Origin (anti CSRF), CSP estricta               |
| Autenticación        | Token de sesión opaco de 256 bits en cookie `HttpOnly` + `SameSite=Lax`; expiración deslizante y absoluta |
| Fuerza bruta         | Rate limiting en unlock / setup / change-password (protege la contraseña maestra)                         |
| Criptografía         | AES-256-GCM, IV aleatorio, **AAD ligado a la fila** (un cifrado no se puede mover entre secretos)         |
| Almacenamiento       | SQL parametrizado, migraciones versionadas, restricciones `CHECK`, transacciones atómicas                 |
| Cadena de suministro | Dependencias mínimas, lockfile fijo, contenedor sin root                                                  |

Limitaciones (detalle en [docs/SECURITY.md](docs/SECURITY.md)):

- No hay reseteo por correo ni custodia en servidor. Si pierdes **la contraseña y la clave de recuperación**,
  pierdes los secretos. La clave de recuperación (se muestra una vez, al crear la bóveda) es un segundo
  secreto que debes guardar **fuera del equipo**: quien la tenga puede abrir la bóveda.
- Los **nombres** de variables se guardan en claro (para buscar al instante); valores y notas, cifrados.
- JavaScript no garantiza el borrado seguro de la RAM; las claves se ponen a cero en la medida de lo posible.
- El proyecto **no** ha sido auditado por terceros. Úsalo bajo tu responsabilidad.

Para reportar una vulnerabilidad: [SECURITY.md](SECURITY.md).

## Inicio rápido

### Docker (recomendado)

```bash
git clone https://github.com/cesar-martinez-fullstack/secrets-env-project.git
cd secrets-env-project
docker compose up -d --build
# abre http://localhost:3000
```

Los datos viven en el volumen Docker `secretvault-data`. Respáldalo como cualquier archivo sensible.
`docker compose down` conserva los datos; `docker compose down -v` **borra la bóveda**.

### Desde el código (Bun)

Requiere [Bun](https://bun.sh) ≥ 1.4.

```bash
bun install
bun run dev            # API en :3000 + Vite en :5173 → abre http://localhost:5173
bun run build          # compila el SPA y un binario autocontenido en ./dist
```

## Configuración

Variables por shell, `docker-compose.yml` o archivo `.env` (ver [.env.example](.env.example)).
Precedencia: entorno real > `.env` > valores por defecto. La tabla completa está en la
[versión en inglés](README.md#configuration).

## Arquitectura

Monolito modular en un monorepo Bun con Clean Architecture (puertos y adaptadores). La regla de
dependencia **se verifica con tests** (`tests/architecture.spec.ts`): `core` no conoce HTTP, Bun,
Vue ni SQLite; `crypto` y `database` implementan sus puertos; solo `apps/api/src/container.ts`
conoce todas las piezas. Diagrama en la [versión en inglés](README.md#architecture).

## Desarrollo

```bash
bun test                    # suite completa
bun run typecheck           # TypeScript estricto en todos los paquetes
bun run lint:check          # ESLint tipado (0 errores)
bun run test:architecture   # reglas de capas
bun run test:security       # suite OWASP y de perímetro
```

Documentación: [arquitectura](docs/ARCHITECTURE.md) · [ADRs](docs/adr/README.md) · [contexto](docs/context.md) · [testing](docs/TESTING.md) · [modelo de seguridad](docs/SECURITY.md) · [flujo Git](docs/GIT_WORKFLOW.md) · [roadmap](docs/TODO.md)

## Contribuir

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](CONTRIBUTING.md) (Git Flow,
Conventional Commits y expectativas de tests) y el [Código de Conducta](CODE_OF_CONDUCT.md).

## Versionado

[Semantic Versioning](https://semver.org/lang/es/). Los releases son tags anotados `vX.Y.Z` sobre
`main`; el historial está en [CHANGELOG.md](CHANGELOG.md). Antes de `1.0.0` una versión menor puede
cambiar el formato en disco: lee el changelog antes de actualizar y respalda tu bóveda.

## Licencia

[MIT](LICENSE) © Cesar Martinez
