# Git y releases

Referencia completa: [docs/GIT_WORKFLOW.md](../../docs/GIT_WORKFLOW.md).

## Ejecutar Git a través de WSL

```bash
wsl.exe bash -lc 'cd /mnt/c/Users/alienware/Desktop/secretos_project && git status'
```

- Credenciales de GitHub (`gh auth`) y push: **solo en WSL**.
- Identidad local del repo: `Cesar Martinez` + correo noreply de GitHub (ya configurada con
  `git config --local`). No usar el correo de trabajo.
- Finales de línea: `.gitattributes` fuerza LF; `core.autocrlf=input`. No commitear CRLF.
- Los hooks de Husky corren dentro de WSL: si `bunx` no se resuelve, añadir al PATH el directorio de
  Bun de Windows antes de reintentar (sin `--no-verify`).

## Ramas (Git Flow)

| Rama                                                                                               | Origen    | Destino            | Notas                                          |
| -------------------------------------------------------------------------------------------------- | --------- | ------------------ | ---------------------------------------------- |
| `main`                                                                                             | —         | —                  | solo releases/hotfixes; tags `vX.Y.Z` anotados |
| `develop`                                                                                          | `main`    | —                  | integración                                    |
| `feature/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*`, `ci/*`, `build/*`, `security/*` | `develop` | `develop`          | PR + `--no-ff`                                 |
| `release/X.Y.Z`                                                                                    | `develop` | `main` y `develop` | solo versión, changelog y fixes de release     |
| `hotfix/X.Y.Z`                                                                                     | `main`    | `main` y `develop` | urgente, versión patch                         |

Nombres en minúsculas y kebab-case. El hook `pre-push` valida el patrón.

## Commits

- `type(scope): description` — inglés, minúsculas, ≤72 caracteres, imperativo, sin punto final.
- Cuerpo opcional y corto (≤3 líneas de ≤72 columnas): el _porqué_, no el _qué_.
- Scopes habituales: `shared` `core` `crypto` `database` `api` `web` `docker` `deps` `release`.
- Un cambio lógico por commit. Sin emojis. **Sin trailers de coautoría ni atribución de IA.**
- Nunca `--no-verify`. Plan de commits → confirmación del usuario → recién entonces `git commit`.

## Releases (skill `cut-release`)

1. Rama `release/X.Y.Z` desde `develop`; subir `version` del `package.json` raíz y escribir el CHANGELOG.
2. `bun run verify && bun audit` en verde.
3. PR a `main` → tag anotado `vX.Y.Z` **sobre `main`** → merge de `main` de vuelta a `develop`.
4. El push del tag dispara `.github/workflows/release.yml` (GitHub Release, binarios, imagen en GHCR).

Nunca tagear ni hacer push sin confirmación explícita del usuario.
