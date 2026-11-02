#!/usr/bin/env bash
# install-sea-forge-gateway.sh: set up the dedicated SEA-Forge gateway service account (Linux/WSL).
#
# Why: the gateway must run as its own service account, not as the operator or the coding agents,
# and agent processes must not be able to write the gateway's configuration or policy.
#
# Default behavior is --dry-run: detect the state and print the exact privileged plan, change nothing,
# exit 0. Privileged steps run only with --authorize-privileged (and without --dry-run), and are
# idempotent: an existing account, directory or file is reused and only its ownership/mode is corrected.
#
# Usage: install-sea-forge-gateway.sh [--dry-run] [--authorize-privileged]
#
# Environment (defaults are product names; nothing is derived from the current user):
#   HORIZON_GATEWAY_ACCOUNT   service account / group name        (godspeed-sea-forge)
#   HORIZON_GATEWAY_SOCKET_DIR socket directory                   (/run/godspeed-sea-forge)
#   HORIZON_GATEWAY_CONFIG_DIR config and policy directory        (/etc/godspeed-sea-forge)
#   HORIZON_GATEWAY_STATE_DIR  state directory                    (/var/lib/godspeed-sea-forge)
#   HORIZON_GATEWAY_ROOT       prefix prepended to all paths (testing against a temp directory)
#
# Plan (what --authorize-privileged does):
#   1. create the system group and the nologin system user (no home, no shell, not in sudo/wheel)
#   2. socket dir: owner ACCOUNT:ACCOUNT, mode 0750 (agents may traverse only via group; they are not members)
#   3. config dir: owner root:ACCOUNT, mode 0750; server.yaml and policy.yaml owner root:ACCOUNT, mode 0640
#      (the gateway reads them; neither it nor agent processes can write them)
#   4. state dir: owner ACCOUNT:ACCOUNT, mode 0700
#
# Rollback (run by the owner, only if nothing else uses the account):
#   systemctl stop godspeed-sea-forge 2>/dev/null || true   # if you installed a unit for it
#   rm -rf "$SOCKET_DIR"                  # runtime socket directory
#   rm -rf "$CONFIG_DIR" "$STATE_DIR"     # only after backing up policy.yaml and evidence you want to keep
#   userdel "$ACCOUNT"; groupdel "$ACCOUNT" 2>/dev/null || true
set -euo pipefail

DRY_RUN=1
AUTHORIZE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --authorize-privileged) AUTHORIZE=1; DRY_RUN=0 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
# --dry-run given together with --authorize-privileged stays a dry run.
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY_RUN=1; done

ACCOUNT="${HORIZON_GATEWAY_ACCOUNT:-godspeed-sea-forge}"
ROOT="${HORIZON_GATEWAY_ROOT:-}"
SOCKET_DIR="${ROOT}${HORIZON_GATEWAY_SOCKET_DIR:-/run/godspeed-sea-forge}"
CONFIG_DIR="${ROOT}${HORIZON_GATEWAY_CONFIG_DIR:-/etc/godspeed-sea-forge}"
STATE_DIR="${ROOT}${HORIZON_GATEWAY_STATE_DIR:-/var/lib/godspeed-sea-forge}"

echo "SEA-Forge gateway setup (mode: $([ "$DRY_RUN" = 1 ] && echo dry-run || echo authorized))"
echo "state detected:"
if id -u "$ACCOUNT" >/dev/null 2>&1; then
  ACCOUNT_EXISTS=1
  echo "  account '$ACCOUNT': exists, will be reused"
else
  ACCOUNT_EXISTS=0
  echo "  account '$ACCOUNT': missing"
fi
for d in "$SOCKET_DIR" "$CONFIG_DIR" "$STATE_DIR"; do
  if [ -d "$d" ]; then echo "  directory $d: exists"; else echo "  directory $d: missing"; fi
done

PLAN=()
if [ "$ACCOUNT_EXISTS" = 0 ]; then
  PLAN+=("groupadd --system $ACCOUNT" "useradd --system --gid $ACCOUNT --no-create-home --shell /usr/sbin/nologin $ACCOUNT")
fi
PLAN+=(
  "install -d -o $ACCOUNT -g $ACCOUNT -m 0750 $SOCKET_DIR"
  "install -d -o root -g $ACCOUNT -m 0750 $CONFIG_DIR"
  "install -d -o $ACCOUNT -g $ACCOUNT -m 0700 $STATE_DIR"
  "chown root:$ACCOUNT $CONFIG_DIR/server.yaml $CONFIG_DIR/policy.yaml   # when present"
  "chmod 0640 $CONFIG_DIR/server.yaml $CONFIG_DIR/policy.yaml            # when present"
)

echo "privileged plan:"
for step in "${PLAN[@]}"; do echo "  $step"; done

if [ "$DRY_RUN" = 1 ] || [ "$AUTHORIZE" = 0 ]; then
  echo "no changes made. Re-run with --authorize-privileged (as root) to apply this plan."
  exit 0
fi

[ "$(id -u)" = 0 ] || { echo "refusing: --authorize-privileged must run as root" >&2; exit 1; }
if [ "$ACCOUNT_EXISTS" = 0 ]; then
  groupadd --system "$ACCOUNT"
  useradd --system --gid "$ACCOUNT" --no-create-home --shell /usr/sbin/nologin "$ACCOUNT"
fi
install -d -o "$ACCOUNT" -g "$ACCOUNT" -m 0750 "$SOCKET_DIR"
install -d -o root -g "$ACCOUNT" -m 0750 "$CONFIG_DIR"
install -d -o "$ACCOUNT" -g "$ACCOUNT" -m 0700 "$STATE_DIR"
for f in server.yaml policy.yaml; do
  if [ -e "$CONFIG_DIR/$f" ]; then chown "root:$ACCOUNT" "$CONFIG_DIR/$f"; chmod 0640 "$CONFIG_DIR/$f"; fi
done
echo "done. The gateway service account '$ACCOUNT' must now start sea-forge-server on $SOCKET_DIR."
