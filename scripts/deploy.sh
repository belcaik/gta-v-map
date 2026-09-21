#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly REPO_DIR

SSH_HOST="${SSH_HOST:-baphomet}"
DEPLOY_DIR="${DEPLOY_DIR:-apps/gta-v-map}"
ENV_FILE="${ENV_FILE:-.env.docker}"
DATASET_DIR="${DATASET_DIR:-}"
DRY_RUN=0

readonly -a SSH_OPTIONS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=10
)

usage() {
  cat <<'HELP'
Usage: scripts/deploy.sh [--dry-run] [--dataset LOCAL_DIR]

Deploy the checked-out compose.yaml and local .env.docker to a remote Docker host.

Environment:
  SSH_HOST    SSH host or alias (default: baphomet)
  DEPLOY_DIR  path below the remote home directory (default: apps/gta-v-map)
  ENV_FILE    local env file, relative to the repository (default: .env.docker)
  DATASET_DIR dataset directory to import, relative to the repository (optional)

Options:
  --dataset DIR  transfer DIR and import DIR/dataset.json before starting the map
  --dry-run      print the planned commands without connecting or changing files
  -h, --help     show this help

The remote data directory is persistent. Dataset transfer never deletes remote files
and excludes SQLite database files, so an import preserves existing progress.
HELP
}

die() {
  printf 'deploy: error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf 'deploy: %s\n' "$*"
}

shell_quote() {
  local value=${1-}
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

print_command() {
  local arg
  printf 'deploy: dry-run:'
  for arg in "$@"; do
    printf ' %s' "$(shell_quote "$arg")"
  done
  printf '\n'
}

run_command() {
  if ((DRY_RUN)); then
    print_command "$@"
    return 0
  fi
  "$@"
}

remote_target() {
  printf '%s:%s' "$SSH_HOST" "$1"
}

remote_command() {
  local command=$1
  if ((DRY_RUN)); then
    print_command ssh "${SSH_OPTIONS[@]}" "$SSH_HOST" "$command"
    return 0
  fi
  # shellcheck disable=SC2029 # command is assembled from fixed text and shell_quote'd paths.
  ssh "${SSH_OPTIONS[@]}" "$SSH_HOST" "$command"
}

valid_deploy_dir() {
  [[ $1 != /* && $1 != -* && $1 != . && $1 != ./* && $1 != */. && $1 != .. && $1 != ../* && $1 != */../* && $1 != */.. && $1 != */./* && $1 != */. ]] || return 1
  [[ $1 =~ ^[A-Za-z0-9._/-]+$ ]]
}

valid_ssh_host() {
  [[ $1 != -* && $1 =~ ^[A-Za-z0-9_.:@%:-]+$ ]]
}

resolve_repo_path() {
  local value=$1
  if [[ $value = /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s/%s\n' "$REPO_DIR" "$value"
  fi
}

check_input_file() {
  local path=$1 label=$2
  [[ -f $path && -r $path ]] || die "$label is not a readable regular file: $path"
}

check_dataset() {
  [[ -d $1 && -r $1 ]] || die "dataset directory is not readable: $1"
  [[ -f "$1/dataset.json" && -r "$1/dataset.json" ]] || die "dataset directory has no readable dataset.json: $1"
}

parse_args() {
  while (($#)); do
    case $1 in
      --help|-h)
        usage
        exit 0
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
      --dataset)
        (($# >= 2)) || die '--dataset requires a directory'
        DATASET_DIR=$2
        shift
        ;;
      --dataset=*)
        DATASET_DIR=${1#*=}
        [[ -n $DATASET_DIR ]] || die '--dataset requires a directory'
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
    shift
  done
}

parse_args "$@"

valid_ssh_host "$SSH_HOST" || die 'SSH_HOST contains unsupported characters'
valid_deploy_dir "$DEPLOY_DIR" || die 'DEPLOY_DIR must be a relative path below the remote home directory'

COMPOSE_FILE="$REPO_DIR/compose.yaml"
LOCAL_ENV_FILE=$(resolve_repo_path "$ENV_FILE")
check_input_file "$COMPOSE_FILE" 'compose.yaml'
check_input_file "$LOCAL_ENV_FILE" 'ENV_FILE'

if [[ -n $DATASET_DIR ]]; then
  LOCAL_DATASET_DIR=$(resolve_repo_path "$DATASET_DIR")
  check_dataset "$LOCAL_DATASET_DIR"
else
  LOCAL_DATASET_DIR=''
fi

if (( ! DRY_RUN )); then
  command -v ssh >/dev/null 2>&1 || die 'ssh is required'
  command -v scp >/dev/null 2>&1 || die 'scp is required'
fi

REMOTE_COMPOSE="docker compose --env-file .env.docker -f compose.yaml"
REMOTE_CD="cd -- $(shell_quote "$DEPLOY_DIR")"

log "checking SSH access to $SSH_HOST"
remote_command 'true' || die "SSH preflight failed; verify the host key in known_hosts for $SSH_HOST"

log 'checking remote Docker Compose'
remote_command 'docker compose version >/dev/null 2>&1' || die 'remote Docker Compose is unavailable'

log "creating deployment directories under ~/$DEPLOY_DIR"
remote_command "mkdir -p -- $(shell_quote "$DEPLOY_DIR") $(shell_quote "$DEPLOY_DIR/data") $(shell_quote "$DEPLOY_DIR/import")" || die 'remote directory bootstrap failed'

log 'copying compose.yaml and .env.docker'
run_command scp "${SSH_OPTIONS[@]}" "$COMPOSE_FILE" "$(remote_target "$DEPLOY_DIR/compose.yaml")" || die 'compose.yaml transfer failed'
run_command scp "${SSH_OPTIONS[@]}" "$LOCAL_ENV_FILE" "$(remote_target "$DEPLOY_DIR/.env.docker")" || die '.env.docker transfer failed'

if [[ -n $LOCAL_DATASET_DIR ]]; then
  log "copying dataset from $LOCAL_DATASET_DIR"
  if (( ! DRY_RUN )); then
    command -v rsync >/dev/null 2>&1 || die 'rsync is required when --dataset is used'
  fi
  run_command rsync -az \
    -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10' \
    --exclude='*.db' --exclude='*.db-*' --exclude='*.sqlite' --exclude='*.sqlite-*' \
    "$LOCAL_DATASET_DIR/" "$(remote_target "$DEPLOY_DIR/import/")" || die 'dataset transfer failed'
fi

log 'pulling the map image'
remote_command "$REMOTE_CD && $REMOTE_COMPOSE pull map" || die 'image pull failed'

log 'preparing persistent directories for uid 1000'
remote_command "$REMOTE_CD && $REMOTE_COMPOSE run --rm --user 0 -v ./import:/import map sh -ec $(shell_quote 'mkdir -p /data /import && chown -R 1000:1000 /data && chmod -R u+rwX,a+rX /import')" || die 'remote directory ownership setup failed'

if [[ -n $LOCAL_DATASET_DIR ]]; then
  log 'importing dataset while preserving the existing database'
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE run --rm -v ./import:/import:ro map node /app/backend/dist/backend/src/db/import.js /import/dataset.json" || die 'dataset import failed'
fi

log 'starting the map service'
remote_command "$REMOTE_CD && $REMOTE_COMPOSE up -d --wait --wait-timeout 120 map" || die 'service start failed'

if ((DRY_RUN)); then
  log 'dry-run complete; no files or services changed'
else
  log "deployment complete: $SSH_HOST:~/$DEPLOY_DIR"
fi
