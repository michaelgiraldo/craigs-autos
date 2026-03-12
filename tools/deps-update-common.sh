#!/usr/bin/env zsh

# Shared helpers for dependency update scripts.

typeset -ga DEP_UPDATE_RG_EXCLUDES=(
  '**/.git/**'
  '**/.hg/**'
  '**/.svn/**'
  '**/node_modules/**'
  '**/dist/**'
  '**/.astro/**'
  '**/.amplify/**'
  '**/cdk.out/**'
  '**/coverage/**'
  '**/.tmp/**'
  '**/tmp/**'
  '**/temp/**'
  '**/.npm-cache/**'
  '**/.cache/**'
)

require_dep_update_commands() {
  local cmd
  for cmd in npx npm; do
    if ! (( $+commands[$cmd] )); then
      printf '%s is required but was not found in PATH.\n' "$cmd" >&2
      return 1
    fi
  done
}

init_dep_update_cache() {
  local cache_root
  cache_root=${TMPDIR:-/tmp}
  NPM_CACHE_DIR="${cache_root%/}/npm-cache"
  mkdir -p "$NPM_CACHE_DIR"
}

package_json_signature() {
  if [[ ! -f package.json ]]; then
    print -r -- ''
    return 0
  fi
  cksum package.json | awk '{print $1 ":" $2}'
}

create_dep_update_backup() {
  local source_path="$1"
  local backup_path=''
  if [[ -f "$source_path" ]]; then
    backup_path=$(mktemp "${TMPDIR:-/tmp}/$(basename "$source_path").XXXXXX")
    cp "$source_path" "$backup_path"
  fi
  print -r -- "$backup_path"
}

cleanup_dep_update_backups() {
  local backup_path
  for backup_path in "$@"; do
    if [[ -n "$backup_path" ]]; then
      rm -f "$backup_path"
    fi
  done
}

restore_dep_update_state() {
  local dir="$1"
  local package_backup="$2"
  local lock_backup="$3"

  if [[ -n "$package_backup" && -f "$package_backup" ]]; then
    cp "$package_backup" package.json
  fi

  if [[ -n "$lock_backup" && -f "$lock_backup" ]]; then
    cp "$lock_backup" package-lock.json
  fi

  printf 'Restored previous package manifest state in %s.\n' "$dir" >&2
  if ! run_npm ci; then
    printf 'npm ci still failed after restoring previous state in %s.\n' "$dir" >&2
    return 1
  fi
}

# Run npm/npx with explicit options and no deprecated production config.
run_npm() {
  env -u npm_config_production -u NPM_CONFIG_PRODUCTION \
    npm_config_cache="$NPM_CACHE_DIR" \
    npm --include=dev --no-audit --no-fund "$@"
}

run_npx() {
  env -u npm_config_production -u NPM_CONFIG_PRODUCTION \
    npm_config_cache="$NPM_CACHE_DIR" \
    npx --yes "$@"
}

dep_update_is_excluded_path() {
  local rel="$1"
  case "$rel" in
    (.git/*|*/.git/*|.hg/*|*/.hg/*|.svn/*|*/.svn/*) return 0 ;;
    (node_modules/*|*/node_modules/*) return 0 ;;
    (dist/*|*/dist/*) return 0 ;;
    (.astro/*|*/.astro/*) return 0 ;;
    (.amplify/*|*/.amplify/*) return 0 ;;
    (cdk.out/*|*/cdk.out/*) return 0 ;;
    (coverage/*|*/coverage/*) return 0 ;;
    (.tmp/*|*/.tmp/*|tmp/*|*/tmp/*|temp/*|*/temp/*) return 0 ;;
    (.npm-cache/*|*/.npm-cache/*|.cache/*|*/.cache/*) return 0 ;;
  esac
  return 1
}

find_dep_update_packages() {
  local -a packages filtered
  local pkg rel

  if (( $+commands[rg] )); then
    local -a rg_args
    local exclude_glob
    rg_args=(--files -g 'package.json')
    for exclude_glob in "${DEP_UPDATE_RG_EXCLUDES[@]}"; do
      rg_args+=(-g "!${exclude_glob}")
    done
    rg "${rg_args[@]}"
    return 0
  fi

  packages=(**/package.json(.N))
  for pkg in "${packages[@]}"; do
    rel=${pkg#./}
    if dep_update_is_excluded_path "$rel"; then
      continue
    fi
    filtered+=("$pkg")
  done
  print -r -l -- "${filtered[@]}"
}

refresh_dep_update_install_state() {
  local dir="$1"
  # `npm install --package-lock-only` plus `npm ci --dry-run` can miss
  # transitive lockfile entries that a real clean install later requires.
  # Refresh the lockfile with a full install, then validate it with `npm ci`,
  # which matches the clean-install path used by Amplify.
  run_npm install
  if ! run_npm ci; then
    printf 'npm ci failed in %s.\n' "$dir" >&2
    return 1
  fi
}

dep_update_normal_mode() {
  local dir="$1"
  local before_signature after_signature
  local package_backup lock_backup

  package_backup=$(create_dep_update_backup package.json)
  lock_backup=$(create_dep_update_backup package-lock.json)
  before_signature=$(package_json_signature)
  run_npx npm-check-updates -u
  after_signature=$(package_json_signature)

  if [[ "$before_signature" == "$after_signature" ]]; then
    printf 'package.json unchanged in %s; validating current lockfile with npm ci.\n' "$dir"
    if ! run_npm ci; then
      restore_dep_update_state "$dir" "$package_backup" "$lock_backup" || true
      cleanup_dep_update_backups "$package_backup" "$lock_backup"
      return 1
    fi
    cleanup_dep_update_backups "$package_backup" "$lock_backup"
    return 0
  fi

  if ! refresh_dep_update_install_state "$dir"; then
    restore_dep_update_state "$dir" "$package_backup" "$lock_backup" || true
    cleanup_dep_update_backups "$package_backup" "$lock_backup"
    return 1
  fi

  cleanup_dep_update_backups "$package_backup" "$lock_backup"
}

dep_update_clean_mode() {
  local dir="$1"
  local before_signature after_signature
  local package_backup lock_backup

  package_backup=$(create_dep_update_backup package.json)
  lock_backup=$(create_dep_update_backup package-lock.json)
  before_signature=$(package_json_signature)
  run_npx npm-check-updates -u
  after_signature=$(package_json_signature)

  if [[ "$before_signature" == "$after_signature" ]]; then
    printf 'package.json unchanged in %s; preserving current lockfile and running npm ci.\n' "$dir"
    if ! run_npm ci; then
      restore_dep_update_state "$dir" "$package_backup" "$lock_backup" || true
      cleanup_dep_update_backups "$package_backup" "$lock_backup"
      return 1
    fi
    cleanup_dep_update_backups "$package_backup" "$lock_backup"
    return 0
  fi

  rm -rf node_modules package-lock.json
  if ! refresh_dep_update_install_state "$dir"; then
    restore_dep_update_state "$dir" "$package_backup" "$lock_backup" || true
    cleanup_dep_update_backups "$package_backup" "$lock_backup"
    return 1
  fi

  cleanup_dep_update_backups "$package_backup" "$lock_backup"
}

update_dep_update_package() {
  local mode="$1"
  local dir="$2"

  (
    cd "$dir"
    case "$mode" in
      (normal)
        dep_update_normal_mode "$dir"
        ;;
      (clean)
        dep_update_clean_mode "$dir"
        ;;
      (*)
        printf 'Unknown dependency update mode: %s\n' "$mode" >&2
        return 1
        ;;
    esac
  )
}

deps_update_main() {
  local mode="$1"
  local root_dir="$2"

  if [[ -z "$mode" || -z "$root_dir" ]]; then
    printf 'Usage: deps_update_main <normal|clean> <root_dir>\n' >&2
    return 1
  fi

  case "$mode" in
    (normal|clean) ;;
    (*)
      printf 'Unknown dependency update mode: %s\n' "$mode" >&2
      return 1
      ;;
  esac

  cd "$root_dir"
  printf 'Scanning for package.json files under repository root: %s\n' "$root_dir"

  require_dep_update_commands
  export NODE_ENV=development
  init_dep_update_cache

  local -a packages
  packages=(${(f)"$(find_dep_update_packages | LC_ALL=C sort -u)"})

  if (( $#packages == 0 )); then
    printf 'No package.json files found.\n'
    return 0
  fi

  local pkg dir
  for pkg in "${packages[@]}"; do
    dir=${pkg:h}
    printf '\n=== Updating dependencies in: %s ===\n' "$dir"
    update_dep_update_package "$mode" "$dir"
  done

  printf '\nAll package.json files processed.\n'
}
