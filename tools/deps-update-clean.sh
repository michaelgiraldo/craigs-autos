#!/usr/bin/env zsh

# Allow explicit `bash tools/deps-update-clean.sh` invocations by
# re-execing this script under zsh before any zsh-only builtins run.
if [ -z "${ZSH_VERSION:-}" ]; then
  if command -v zsh >/dev/null 2>&1; then
    exec zsh "$0" "$@"
  fi
  printf 'This script requires zsh, but zsh is not available in PATH.\n' >&2
  exit 1
fi

set -eu
setopt pipefail

# Clean dependency refresh:
# - bump package.json ranges with npm-check-updates
# - remove lockfiles and node_modules
# - rebuild lockfiles and perform full npm ci

readonly SCRIPT_PATH=${(%):-%N}
readonly SCRIPT_DIR=${SCRIPT_PATH:A:h}
readonly ROOT_DIR=${SCRIPT_DIR:h}
readonly COMMON_HELPERS="${SCRIPT_DIR}/deps-update-common.sh"

if [[ ! -f "$COMMON_HELPERS" ]]; then
  printf 'Required helper script missing: %s\n' "$COMMON_HELPERS" >&2
  exit 1
fi
source "$COMMON_HELPERS"
deps_update_main clean "$ROOT_DIR"
