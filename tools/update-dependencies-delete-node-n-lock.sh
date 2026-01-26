#!/usr/bin/env zsh

set -eu
setopt pipefail extended_glob null_glob glob_dots

# Update package.json deps across the repo via npm-check-updates, refresh lockfiles,
# and verify `npm ci` can run (dry-run) so CI/Amplify won't fail.

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
    (.git/*|.hg/*|.svn/*) continue ;;
    (node_modules/*|*/node_modules/*)
      continue
      ;;
    (dist/*|*/dist/*)
      continue
      ;;
    (.astro/*|*/.astro/*)
      continue
      ;;
    (.amplify/*|*/.amplify/*)
      continue
      ;;
    (cdk.out/*|*/cdk.out/*)
      continue
      ;;
    (coverage/*|*/coverage/*)
      continue
      ;;
    (.tmp/*|*/.tmp/*|tmp/*|*/tmp/*|temp/*|*/temp/*)
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
    npx --yes npm-check-updates -u
    rm -f package-lock.json
    npm install --package-lock-only --no-audit --no-fund
    npm ci --dry-run --no-audit --no-fund
  )
done

printf '\nAll package.json files processed.\n'
