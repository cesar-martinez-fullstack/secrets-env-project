# ADR-0005 · Git Flow, Conventional Commits y tags SemVer

- Estado: Aceptado
- Fecha: 2026-11-09

## Contexto

Repositorio público que otras personas podrían usar y al que podrían contribuir. Se necesita un historial
legible, releases reproducibles y un changelog confiable sin esfuerzo manual excesivo.

## Decisión

- **Git Flow**: `main` (releases) y `develop` (integración); ramas `feature/*`, `fix/*`, `release/X.Y.Z`,
  `hotfix/X.Y.Z`. PRs a `develop`, merges `--no-ff`.
- **Conventional Commits** en inglés, cortos, validados por commitlint (local y en CI), sin atribución de
  herramientas o asistentes.
- **SemVer** con tags anotados `vX.Y.Z` solo sobre `main`; un único `version` en el `package.json` raíz.
- **CHANGELOG** Keep a Changelog, escrito al cortar el release a partir de los commits.
- El tag dispara `release.yml`: GitHub Release, binarios y la imagen en GHCR.

## Alternativas consideradas

- **Trunk-based development** — más ágil, pero menos explícito para releases con changelog curado.
- **GitHub Flow** — válido; se prefirió Git Flow por separar integración (`develop`) de lo publicado (`main`).

## Consecuencias

- Positivas: historial y releases predecibles; el changelog se deriva de los commits.
- Negativas: más ramas y ceremonia; los hooks bloquean commits directos en ramas permanentes.
- Reversión: bastaría con dejar de usar `develop` y apuntar los PRs a `main`.
