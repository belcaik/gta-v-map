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
CONTAINER_ENGINE="${CONTAINER_ENGINE:-docker}"
IMAGE_ARCHIVE=""
DRY_RUN=0

readonly -a SSH_OPTIONS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o ConnectTimeout=10
)

usage() {
  cat <<'HELP'
Usage: scripts/deploy.sh [--dry-run] [--dataset LOCAL_DIR] [--image-archive LOCAL_TAR]

Deploy the checked-out compose.yaml and local .env.docker to a remote Docker or rootless Podman host.

Environment:
  SSH_HOST    SSH host or alias (default: baphomet)
  DEPLOY_DIR  path below the remote home directory (default: apps/gta-v-map)
  ENV_FILE    local env file, relative to the repository (default: .env.docker)
  CONTAINER_ENGINE docker (default) or podman
  DATASET_DIR dataset directory to import, relative to the repository (optional)

Options:
  --dataset DIR  transfer DIR and import DIR/dataset.json before starting the map
  --image-archive FILE  load a docker save archive instead of pulling from a registry
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
      --image-archive)
        (($# >= 2)) || die '--image-archive requires a file'
        IMAGE_ARCHIVE=$2
        shift
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

[[ $CONTAINER_ENGINE = docker || $CONTAINER_ENGINE = podman ]] || die 'CONTAINER_ENGINE must be docker or podman'
if [[ -n $IMAGE_ARCHIVE ]]; then
  IMAGE_ARCHIVE=$(resolve_repo_path "$IMAGE_ARCHIVE")
  check_input_file "$IMAGE_ARCHIVE" 'image archive'
fi

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
  if [[ -n $LOCAL_DATASET_DIR ]]; then
    command -v rsync >/dev/null 2>&1 || die 'rsync is required when --dataset is used'
  fi
fi

if [[ $CONTAINER_ENGINE = podman ]]; then
  REMOTE_COMPOSE="podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml"
else
  REMOTE_COMPOSE="docker compose --env-file .env.docker -f compose.yaml"
fi
REMOTE_CD="cd -- $(shell_quote "$DEPLOY_DIR")"

log "checking SSH access to $SSH_HOST"
remote_command 'true' || die "SSH preflight failed; verify the host key in known_hosts for $SSH_HOST"

log "checking remote $CONTAINER_ENGINE and Compose"
if [[ $CONTAINER_ENGINE = podman ]]; then
  # The remote login shell resolves its user and linger setting.
  # shellcheck disable=SC2016
  remote_command 'podman info >/dev/null && podman-compose --version >/dev/null && systemctl --user show-environment >/dev/null && test "$(loginctl show-user "$USER" -p Linger --value)" = yes' || die 'Podman, podman-compose, user systemd and loginctl linger are required'
else
  remote_command 'docker info >/dev/null && docker compose version >/dev/null' || die 'remote Docker Engine or Compose is unavailable'
fi

log "creating deployment directories under ~/$DEPLOY_DIR"
remote_command "mkdir -p -- $(shell_quote "$DEPLOY_DIR") $(shell_quote "$DEPLOY_DIR/data") $(shell_quote "$DEPLOY_DIR/import")" || die 'remote directory bootstrap failed'

log 'copying compose.yaml and .env.docker'
run_command scp "${SSH_OPTIONS[@]}" "$COMPOSE_FILE" "$(remote_target "$DEPLOY_DIR/compose.yaml")" || die 'compose.yaml transfer failed'
run_command scp "${SSH_OPTIONS[@]}" "$LOCAL_ENV_FILE" "$(remote_target "$DEPLOY_DIR/.env.docker")" || die '.env.docker transfer failed'

if [[ $CONTAINER_ENGINE = podman ]]; then
  run_command scp "${SSH_OPTIONS[@]}" "$REPO_DIR/compose.podman.yaml" "$(remote_target "$DEPLOY_DIR/compose.podman.yaml")" || die 'Podman override transfer failed'
fi

if [[ -n $LOCAL_DATASET_DIR ]]; then
  log "copying dataset from $LOCAL_DATASET_DIR"
  run_command rsync -az \
    -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10' \
    --exclude='*.db' --exclude='*.db-*' --exclude='*.sqlite' --exclude='*.sqlite-*' \
    "$LOCAL_DATASET_DIR/" "$(remote_target "$DEPLOY_DIR/import/")" || die 'dataset transfer failed'
fi

if [[ -n $IMAGE_ARCHIVE ]]; then
  log 'loading the supplied image archive'
  run_command scp "${SSH_OPTIONS[@]}" "$IMAGE_ARCHIVE" "$(remote_target "$DEPLOY_DIR/image.tar")" || die 'image archive transfer failed'
  remote_command "$REMOTE_CD && $CONTAINER_ENGINE load -i image.tar && rm -- image.tar" || die 'image load failed'
else
  log 'pulling the map image'
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE pull map" || die 'image pull failed'
fi

log 'preparing persistent directories'
if [[ $CONTAINER_ENGINE = podman ]]; then
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE run --rm -T map sh -ec $(shell_quote 'test -w /data || { echo "Data directory must be writable by the SSH user" >&2; exit 1; }')" || die 'Podman data directory is not writable'
else
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE run --rm --user 0 -v ./import:/import map sh -ec $(shell_quote 'mkdir -p /data /import && chown -R 1000:1000 /data && chmod -R u+rwX,a+rX /import')" || die 'remote directory ownership setup failed'
fi

if [[ -n $LOCAL_DATASET_DIR ]]; then
  log 'importing dataset while preserving the existing database'
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE run --rm -T -v ./import:/import:ro map node /app/backend/dist/backend/src/db/import.js /import/dataset.json" || die 'dataset import failed'
fi

log 'starting the map service'
if [[ $CONTAINER_ENGINE = podman ]]; then
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE up -d --force-recreate map" || die 'service start failed'
  HEALTH_LOOP="for attempt in \$(seq 1 30); do container=\$($REMOTE_COMPOSE ps -q 2>/dev/null); if [ -n \"\$container\" ] && podman healthcheck run \"\$container\" >/dev/null 2>&1; then exit 0; fi; sleep 2; done; exit 1"
  remote_command "$REMOTE_CD && $HEALTH_LOOP" || die 'service health check failed'
  UNIT_NAME="map-${DEPLOY_DIR//\//-}.service"
  UNIT_CONTENT="[Unit]
Description=Local map ($DEPLOY_DIR)
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=%h/$DEPLOY_DIR
ExecStart=/usr/bin/env $REMOTE_COMPOSE up -d map
ExecStop=/usr/bin/env $REMOTE_COMPOSE stop map
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=default.target"
  log "enabling user service $UNIT_NAME for boot"
  remote_command "mkdir -p \"\$HOME/.config/systemd/user\" && printf '%s\\n' $(shell_quote "$UNIT_CONTENT") > \"\$HOME/.config/systemd/user/$UNIT_NAME\" && systemctl --user daemon-reload && systemctl --user enable --now $(shell_quote "$UNIT_NAME")" || die 'user service installation failed'
else
  remote_command "$REMOTE_CD && $REMOTE_COMPOSE up -d --wait --wait-timeout 120 map" || die 'service start failed'
fi

if ((DRY_RUN)); then
  log 'dry-run complete; no files or services changed'
else
  log "deployment complete: $SSH_HOST:~/$DEPLOY_DIR"
fi
