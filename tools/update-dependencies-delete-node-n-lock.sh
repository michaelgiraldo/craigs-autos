#!/usr/bin/env zsh

set -eu
setopt pipefail extended_glob null_glob glob_dots

# Update all package.json files (ignoring generated directories like node_modules/dist/coverage)
# using npm-check-updates, then run npm install in each directory.

readonly SCRIPT_PATH=${(%):-%N}
readonly SCRIPT_DIR=${SCRIPT_PATH:A:h}
readonly ROOT_DIR=${SCRIPT_DIR:h}

cd "$ROOT_DIR"
printf 'Scanning for package.json files under repository root: %s\n' "$ROOT_DIR"

if ! (( $+commands[npx] )); then
  printf 'npx is required but was not found in PATH.\n' >&2
  exit 1
fi

if ! (( $+commands[npm] )); then
  printf 'npm is required but was not found in PATH.\n' >&2
  exit 1
fi

typeset -a packages
packages=(**/package.json(.N))

typeset filtered=()
for pkg in ${packages[@]}; do
  rel=${pkg#./}
  case $rel in
    (.git/*|.hg/*|.svn/*)
      continue
      ;;
    (.cache/*|.pnpm-store/*|.venv/*)
      continue
      ;;
    (node_modules/*|*/node_modules/*)
      continue
      ;;
    (dist/*|*/dist/*)
      continue
      ;;
    (cdk.out/*|*/cdk.out/*)
      continue
      ;;
    (coverage/*|*/coverage/*)
      continue
      ;;
    (reports/*|*/reports/*)
      continue
      ;;
    (tmp/*|*/tmp/*|temp/*|*/temp/*)
      continue
      ;;
    (playground/*|*/playground/*)
      continue
      ;;
    (external_fixtures/*|*/external_fixtures/*)
      continue
      ;;
    (docs/file-cards/*|*/docs/file-cards/*)
      continue
      ;;
    (vendor/*|*/vendor/*)
      continue
      ;;
  esac
  filtered+=($pkg)
done
packages=(${filtered[@]})

if (( $#packages == 0 )); then
  printf 'No package.json files found.\n'
  exit 0
fi

typeset pkg dir
for pkg in ${packages[@]}; do
  dir=${pkg:h}
  printf '\n=== Updating dependencies in: %s ===\n' "$dir"
  (
    cd "$dir"
    npx npm-check-updates -u
    rm -rf node_modules package-lock.json
    CXXFLAGS='--std=c++20' npm install
  )
done

printf '\nAll package.json files processed.\n'
