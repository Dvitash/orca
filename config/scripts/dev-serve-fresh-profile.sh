#!/usr/bin/env bash
# Start a standalone Orca dev runtime server with a fresh userData profile.
# The profile directory is deleted before every run so pairing/server state starts clean.
#
# Usage:
#   ./config/scripts/dev-serve-fresh-profile.sh
#   ./config/scripts/dev-serve-fresh-profile.sh --port 6769
#   ./config/scripts/dev-serve-fresh-profile.sh --build
#   ./config/scripts/dev-serve-fresh-profile.sh --pairing-address 127.0.0.1
#
# Environment:
#   ORCA_REMOTE_DEV_SERVER_PORT=6769
#   ORCA_REMOTE_DEV_PAIRING_ADDRESS=100.x.y.z   # optional; defaults to tailscale ip -4
#   ORCA_REMOTE_DEV_USER_DATA_PATH=$HOME/.config/orca-dev-remote-server-fresh
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

PORT="${ORCA_REMOTE_DEV_SERVER_PORT:-6769}"
PAIRING_ADDRESS="${ORCA_REMOTE_DEV_PAIRING_ADDRESS:-}"
PROFILE_DIR="${ORCA_REMOTE_DEV_USER_DATA_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/orca-dev-remote-server-fresh}"
RUN_BUILD=0

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
}

detect_tailscale_ipv4() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi
  local candidate
  while IFS= read -r candidate; do
    if [[ -n "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(tailscale ip -4 2>/dev/null)
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      RUN_BUILD=1
      shift
      ;;
    --port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --port" >&2
        exit 2
      fi
      PORT="$2"
      shift 2
      ;;
    --pairing-address)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --pairing-address" >&2
        exit 2
      fi
      PAIRING_ADDRESS="$2"
      shift 2
      ;;
    --profile-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --profile-dir" >&2
        exit 2
      fi
      PROFILE_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$PAIRING_ADDRESS" ]]; then
  if ! PAIRING_ADDRESS="$(detect_tailscale_ipv4)"; then
    echo "Could not detect a Tailscale IPv4 address with 'tailscale ip -4'." >&2
    echo "Pass --pairing-address <host> or set ORCA_REMOTE_DEV_PAIRING_ADDRESS." >&2
    exit 2
  fi
fi

if [[ -z "$PROFILE_DIR" || "$PROFILE_DIR" == "/" || "$PROFILE_DIR" == "$HOME" ]]; then
  echo "Refusing to delete unsafe ORCA_REMOTE_DEV_USER_DATA_PATH: '$PROFILE_DIR'" >&2
  exit 2
fi

case "$PROFILE_DIR" in
  *orca-dev*|*Orca-Dev*) ;;
  *)
    # Why: this script deletes PROFILE_DIR on every run; require an Orca-dev-named path.
    echo "Refusing to delete profile path without 'orca-dev' in its name: $PROFILE_DIR" >&2
    exit 2
    ;;
esac

cd "$REPO_ROOT"

if [[ "$RUN_BUILD" -eq 1 ]]; then
  echo "[dev-serve-fresh-profile] building desktop artifacts"
  pnpm run build:desktop
fi

echo "[dev-serve-fresh-profile] deleting userData=$PROFILE_DIR"
rm -rf -- "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"

echo "[dev-serve-fresh-profile] serving on port=$PORT pairingAddress=$PAIRING_ADDRESS"
exec env ORCA_DEV_USER_DATA_PATH="$PROFILE_DIR" \
  node config/scripts/orca-dev.mjs serve \
  --port "$PORT" \
  --pairing-address "$PAIRING_ADDRESS"
