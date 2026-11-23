#!/usr/bin/env bash
# Actualiza SecretVault desde la rama main de GitHub y reconstruye la imagen Docker.
# Los secretos viven en el volumen de Docker (fuera de la imagen) y no se tocan; antes de
# actualizar se guarda una copia comprimida en ./backups (el contenido sigue cifrado).
#
# Uso:
#   ./scripts/update.sh            actualiza si hay cambios nuevos
#   ./scripts/update.sh --check    solo informa si hay cambios, sin modificar nada
#   ./scripts/update.sh --force    reconstruye la imagen aunque no haya cambios
#
# Variables: SV_UPDATE_BRANCH (por defecto main), SV_PORT (puerto local, por defecto 3000).
set -euo pipefail

# Git Bash en Windows reescribe rutas como /app/data; en macOS y Linux no hace nada.
export MSYS_NO_PATHCONV=1

BRANCH="${SV_UPDATE_BRANCH:-main}"
PORT="${SV_PORT:-3000}"
MODE="update"

for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --force) MODE="force" ;;
    -h | --help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Opción desconocida: $arg (usa --check, --force o --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

cd "$(dirname "$0")/.."

command -v git >/dev/null || fail "git no está instalado."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "esta carpeta no es un clon de git."

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$current_branch" = "$BRANCH" ] ||
  fail "estás en la rama '$current_branch'; el script actualiza desde '$BRANCH'. Ejecuta: git checkout $BRANCH"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "hay cambios locales sin guardar; guárdalos o descártalos antes de actualizar."
fi

say "Buscando cambios en origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$BRANCH")"

if [ "$local_sha" = "$remote_sha" ] && [ "$MODE" != "force" ]; then
  echo "Ya tienes la última versión ($(git rev-parse --short HEAD))."
  exit 0
fi

if [ "$local_sha" != "$remote_sha" ]; then
  git merge-base --is-ancestor "$local_sha" "$remote_sha" ||
    fail "tu copia local tiene cambios que no están en origin/$BRANCH; no se puede avanzar sin mezclarlos."
  echo "Cambios nuevos:"
  git log --oneline --no-decorate "$local_sha..$remote_sha" | head -20
fi

if [ "$MODE" = "check" ]; then
  echo
  echo "Hay una versión nueva. Para instalarla ejecuta: ./scripts/update.sh"
  exit 0
fi

command -v docker >/dev/null || fail "docker no está instalado."
docker info >/dev/null 2>&1 || fail "Docker no está en marcha; ábrelo y vuelve a intentarlo."
docker compose version >/dev/null 2>&1 || fail "falta 'docker compose' (Docker Desktop o el plugin compose)."

project="$(docker compose config --format json 2>/dev/null | sed -n 's/^  "name": *"\([^"]*\)".*/\1/p' | head -1)"
has_data=""
if [ -n "$project" ]; then
  has_data="$(docker volume ls --quiet \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.volume=secretvault-data")"
fi

backup_file=""
if [ -n "$has_data" ]; then
  say "Deteniendo SecretVault (cierre ordenado de la base de datos)"
  docker compose stop

  say "Guardando copia de seguridad de los datos"
  mkdir -p backups
  chmod 700 backups
  backup_file="backups/secretvault-$(date +%Y%m%d-%H%M%S).tar.gz"
  if ! (umask 077 && docker compose run --rm --no-deps -T --entrypoint tar secretvault \
    czf - -C /app/data . >"$backup_file") || [ ! -s "$backup_file" ]; then
    rm -f "$backup_file"
    docker compose start >/dev/null 2>&1 || true
    fail "no se pudo guardar la copia de seguridad; no se actualizó nada y SecretVault sigue en marcha."
  fi
  echo "Copia guardada en $backup_file"
else
  echo "No hay una instalación previa en marcha: se instala desde cero."
fi

if [ "$local_sha" != "$remote_sha" ]; then
  say "Descargando la versión nueva"
  git merge --ff-only --quiet "origin/$BRANCH"
fi

say "Reconstruyendo la imagen y arrancando (los datos se conservan en su volumen)"
docker compose up -d --build

say "Esperando a que responda"
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "SecretVault está en marcha en http://localhost:$PORT (versión $(git rev-parse --short HEAD))."
    [ -z "$backup_file" ] || echo "Copia de seguridad previa: $backup_file"
    exit 0
  fi
  sleep 2
done

echo "No respondió a tiempo. Últimas líneas del registro:" >&2
docker compose logs --tail 30 >&2 || true
fail "la actualización terminó pero SecretVault no responde. Tus datos siguen intactos${backup_file:+ (copia: $backup_file)}."
