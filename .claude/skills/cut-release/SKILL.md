---
name: cut-release
description: Corta un release con Git Flow - calcula la versión desde los Conventional Commits, escribe el CHANGELOG (inglés, Keep a Changelog), sube la versión, abre la rama release/X.Y.Z y prepara el tag. Solo cuando el usuario pida un release; siempre con confirmación antes de tagear o hacer push.
---

Todo Git/GitHub se ejecuta **vía WSL** (ver `.claude/rules/git-workflow.md`). Sin atribución de IA en
ningún mensaje. Nada se commitea, tagea ni se publica sin confirmación explícita del usuario.

## Regla de bump (SemVer)

| Commit                                    | Bump            |
| ----------------------------------------- | --------------- |
| `fix:` / `perf:` visibles para el usuario | patch           |
| `feat:`                                   | minor           |
| `BREAKING CHANGE:` o `tipo!:`             | major           |
| `chore/docs/refactor/test/style/ci/build` | sin bump propio |

El bump final es el MÁS ALTO del rango. Antes de `1.0.0`: un cambio de formato de datos o de
configuración incompatible = **minor** (se documenta en `Changed` con notas de actualización).
Un commit sin prefijo reconocible = commitlint se saltó: avisar, no adivinar.

## Procedimiento

1. **Rango.** `git describe --tags --abbrev=0` y `git log <tag>..develop --oneline`
   (sin tags: todo el historial). Verifica que `develop` está limpio y al día con `origin`.
2. **Versión nueva** a partir del `version` del `package.json` raíz (único lugar con versión de producto).
3. **Borrador del CHANGELOG** (Keep a Changelog, inglés, estilo de `CHANGELOG.md`):
   - `### Added` ← `feat` · `### Fixed` ← `fix` · `### Security` ← cambios de seguridad ·
     `### Changed` ← `refactor`/`perf` visibles o cambios incompatibles · `### Removed`/`Deprecated`.
   - Omitir `chore/docs/test/style/ci/build` salvo petición expresa.
   - Cada línea describe el efecto para quien usa la app, en lenguaje llano; sin nombres de clases.
4. **Presentar** versión, motivo del bump (qué commit lo forzó) y borrador completo. **Esperar
   confirmación.**
5. **Aplicar** (tras confirmar):
   ```bash
   git switch develop && git pull
   git switch -c release/X.Y.Z
   # editar package.json (version) y CHANGELOG.md: mover [Unreleased] a [X.Y.Z] - AAAA-MM-DD,
   # actualizar los enlaces de comparación al pie
   bun run verify && bun audit --audit-level=high && bun run test:security
   git commit -am "chore(release): X.Y.Z"
   git push -u origin release/X.Y.Z
   ```
6. **PR** `release/X.Y.Z → main` (sin atribución de IA en la descripción). Tras el merge:
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"      # pedir confirmación antes de pushear el tag
   git push origin vX.Y.Z
   git switch develop && git merge --no-ff main && git push   # back-merge
   ```
7. El tag dispara `release.yml`: verifica que el tag coincide con `package.json`, extrae las notas con
   `scripts/changelog-section.sh X.Y.Z`, publica el GitHub Release con binarios y la imagen en GHCR.
   Comprobar que terminó en verde (`gh run watch`, vía WSL).

## Hotfix

Rama `hotfix/X.Y.Z` desde `main` (patch), fix + test, CHANGELOG, PR a `main`, tag, back-merge a `develop`.
