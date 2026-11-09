#!/usr/bin/env bash
# Prints the CHANGELOG.md section of one version (without the heading), for release notes.
# Usage: scripts/changelog-section.sh 0.1.0
set -euo pipefail

version="${1:?usage: changelog-section.sh <version>}"
file="${CHANGELOG_FILE:-CHANGELOG.md}"

section="$(awk -v v="$version" '
  $0 ~ "^## \\[" v "\\]" { found = 1; next }
  found && /^## \[/      { exit }
  found && /^\[[^]]+\]: / { next }
  found                  { print }
' "$file")"

if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "No CHANGELOG section found for version $version" >&2
  exit 1
fi

printf '%s\n' "$section"
