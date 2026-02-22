#!/usr/bin/env zsh

set -eu
setopt pipefail

# Standard dependency refresh:
# - bump package.json ranges with npm-check-updates
# - refresh lockfiles
# - verify npm ci can succeed (dry-run)

readonly SCRIPT_PATH=${(%):-%N}
readonly SCRIPT_DIR=${SCRIPT_PATH:A:h}
readonly ROOT_DIR=${SCRIPT_DIR:h}
readonly COMMON_HELPERS="${SCRIPT_DIR}/deps-update-common.sh"

if [[ ! -f "$COMMON_HELPERS" ]]; then
  printf 'Required helper script missing: %s\n' "$COMMON_HELPERS" >&2
  exit 1
fi
source "$COMMON_HELPERS"
deps_update_main normal "$ROOT_DIR"
