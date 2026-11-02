#!/usr/bin/env bash
# install-sea-forge-gateway.sh: two-account setup for the SEA-Forge gateway and the Horizon runtime (Linux/WSL).
#
# Why: the SEA-Forge gateway runs as its own service account, the Horizon runtime runs as a second one, and the
# operator's login (the coding agents) is in neither group and has no path to the socket or the deployed tree.
# Executable and code trust: the server binary and the runtime tree are root-owned copies, never agent-writable.
#
# Flow (all steps are in the plan, which `gateway-setup.ts stage` writes; this script only executes it):
#   1. `just gateway-stage` (unprivileged): writes the staging bundle (plan.tsv, runtime tree, manifest, units, status)
#   2. `just gateway-plan` / `--dry-run`: prints the full privileged plan for both accounts; changes nothing
#   3. `just gateway-check` / `--check`: read-only ownership, mode, membership and socket-access check
#   4. `sudo ... --authorize-privileged`: applies the plan as root (idempotent; never overwrites an authoritative file)
#
# Usage:
#   install-sea-forge-gateway.sh [--dry-run] [--check] [--stage DIR]
#       [--authorize-privileged --binary PATH --sha256 HEX --bun PATH --bun-sha256 HEX
#        --expect-stage-sha256 HEX [--replace-binary]]
#
# Environment (defaults are product names; nothing is derived from the current user):
#   HORIZON_GATEWAY_STAGE   staging bundle directory (~/.cache/godspeed/gateway-stage); --stage overrides
#   HORIZON_GATEWAY_ROOT    prefix for all paths, for testing against a temporary directory (staging records it)
#   Account, path and bun settings are read by `gateway-setup.ts stage`; see its header.
#
# Privileged plan (what --authorize-privileged does, in order):
#   account   gateway and runtime service accounts (system, nologin, no home), created if missing
#   group     socket group; both service accounts are members; the operator is not
#   dir       bin dirs root:root 0755; socket dir GATEWAY:socket 0750;
#             gateway root (= SEA_FORGE_ROOT, holds server.yaml) GATEWAY:GATEWAY 1700 (sticky);
#             runtime state RUNTIME:RUNTIME 0700
#   bun       the owner runs this step: a Bun you already trust is copied to root:root 0755 at the runtime
#             bun path after sha256 verification (--bun PATH --bun-sha256 HEX); nothing is downloaded
#   place     sea-forge-server copied root:root 0755 after sha256 verification (refused on mismatch;
#             an existing different binary is refused unless --replace-binary, which keeps it as a sidecar)
#   realitytrace  reported only: the runtime unit points at this binary; place a root-owned copy there yourself
#   deploy    runtime tree copied root:root (dirs 0755, files 0644), manifest verified, previous tree kept as a sidecar
#   realitytrace homes  gateway-owned data and state directories for the gateway's RealityTrace settings
#   worlds    the pinned world's .sea files copied root:socket 0644 into the gateway root (cep_authority base)
#   config    server.yaml and policy.yaml are rendered once, root:socket 0640, inside the gateway root. server.yaml
#             takes the runtime account's uid from `id -u` (the runtime account is created earlier in the plan).
#             An existing file is never overwritten: a differing render is written beside it as *.generated-<UTC>.
#   generated status.json, and the two systemd units into the unit directory; a differing old file is kept as a sidecar
#   socket    checked only; the server creates the socket
#
# Why the sticky gateway root: the gateway owns the directory, so it can create its own state, but with the
# sticky bit it cannot unlink or rename a file it does not own. The config files are root-owned and 0640 (group
# socket, read-only), so the gateway can read them and cannot change them.
#
# Installing the units does not start them. Start order and checks are printed by `just gateway-install`.
#
# Rollback (run by the owner, only if nothing else uses the accounts):
#   sudo systemctl disable --now godspeed-horizon.service godspeed-sea-forge.service 2>/dev/null || true
#   sudo rm -f /etc/systemd/system/godspeed-horizon.service /etc/systemd/system/godspeed-sea-forge.service
#   sudo rm -rf /run/godspeed-sea-forge                # socket directory
#   sudo rm -rf /opt/godspeed-horizon /opt/godspeed-horizon.previous-* /opt/godspeed-horizon.manifest.sha256
#   sudo rm -rf /usr/local/lib/godspeed-sea-forge      # server binary (sidecars included)
#   # back up /etc/godspeed-sea-forge (policy and evidence) and /var/lib/godspeed-* first, then remove them
#   sudo userdel godspeed-horizon; sudo userdel godspeed-sea-forge; sudo groupdel godspeed-sock 2>/dev/null || true
set -euo pipefail

PRODUCT=godspeed
DRY=0
APPLY=0
CHECK=0
STAGE="${HORIZON_GATEWAY_STAGE:-${XDG_CACHE_HOME:-$HOME/.cache}/$PRODUCT/gateway-stage}"
BINARY=""
SHA256=""
BUN_BINARY=""
BUN_SHA256=""
EXPECT_STAGE=""
REPLACE_BINARY=0
SIDECARS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --check) CHECK=1 ;;
    --authorize-privileged) APPLY=1 ;;
    --stage) STAGE="${2:?--stage needs a directory}"; shift ;;
    --binary) BINARY="${2:?--binary needs a path}"; shift ;;
    --sha256) SHA256="${2:?--sha256 needs a hex digest}"; shift ;;
    --bun) BUN_BINARY="${2:?--bun needs a path}"; shift ;;
    --bun-sha256) BUN_SHA256="${2:?--bun-sha256 needs a hex digest}"; shift ;;
    --expect-stage-sha256) EXPECT_STAGE="${2:?--expect-stage-sha256 needs a hex digest}"; shift ;;
    --replace-binary) REPLACE_BINARY=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
# --dry-run together with --authorize-privileged stays a dry run.
if [ "$DRY" = 1 ]; then APPLY=0; fi
if [ "$CHECK" = 1 ]; then APPLY=0; fi
MODE=dry-run
[ "$CHECK" = 1 ] && MODE=check
[ "$APPLY" = 1 ] && MODE=apply

say() { printf '  %s\n' "$*"; }
refuse() { echo "refusing: $*" >&2; exit 1; }
TS="$(date -u +%Y%m%dT%H%M%SZ)"

# ---- staged bundle ----------------------------------------------------------------------------------
STAGED=1
for f in plan.tsv runtime-manifest.sha256 status.json units/godspeed-sea-forge.service units/godspeed-horizon.service runtime; do
  [ -e "$STAGE/$f" ] || STAGED=0
done
if [ "$STAGED" = 0 ]; then
  [ "$MODE" = dry-run ] || refuse "no staged bundle at $STAGE; run: just gateway-stage"
  echo "SEA-Forge gateway setup (mode: dry-run)"
  echo "no staged bundle at $STAGE, so there is no plan to print yet."
  echo "run: just gateway-stage   (unprivileged; writes the bundle only), then: just gateway-plan"
  echo "no changes made."
  exit 0
fi
STAGE_DIGEST="$(cat "$STAGE/plan.tsv" "$STAGE/runtime-manifest.sha256" "$STAGE/units/godspeed-sea-forge.service" "$STAGE/units/godspeed-horizon.service" "$STAGE/status.json" "$STAGE/config/server.yaml.in" "$STAGE/config/policy.yaml" | sha256sum | cut -d' ' -f1)"

# The staged runtime tree must match its manifest before anything is installed from it.
(cd "$STAGE/runtime" && sha256sum -c --quiet "$STAGE/runtime-manifest.sha256") || refuse "staged runtime tree does not match its manifest; run: just gateway-stage"

# ---- the server binary: verified before any mode, and always refused on mismatch ----------------------
BINARY_NOTE="not given (pass --binary PATH --sha256 HEX)"
if [ -n "$BINARY" ]; then
  [ -f "$BINARY" ] || refuse "binary $BINARY does not exist"
  [ -n "$SHA256" ] || refuse "--sha256 is required with --binary"
  SHA256="$(printf '%s' "$SHA256" | tr 'A-F' 'a-f')"
  ACTUAL="$(sha256sum "$BINARY" | cut -d' ' -f1)"
  if [ "$ACTUAL" != "$SHA256" ]; then
    refuse "sha256 of $BINARY is $ACTUAL, expected $SHA256; not copied"
  fi
  BINARY_NOTE="$BINARY verified sha256 $ACTUAL"
fi

# The runtime's bun: a copy the owner supplies and verifies; never downloaded here.
BUN_NOTE="not given (pass --bun PATH --bun-sha256 HEX; the owner runs this step)"
if [ -n "$BUN_BINARY" ]; then
  [ -f "$BUN_BINARY" ] || refuse "bun $BUN_BINARY does not exist"
  [ -n "$BUN_SHA256" ] || refuse "--bun-sha256 is required with --bun"
  BUN_SHA256="$(printf '%s' "$BUN_SHA256" | tr 'A-F' 'a-f')"
  BUN_ACTUAL="$(sha256sum "$BUN_BINARY" | cut -d' ' -f1)"
  if [ "$BUN_ACTUAL" != "$BUN_SHA256" ]; then
    refuse "sha256 of bun $BUN_BINARY is $BUN_ACTUAL, expected $BUN_SHA256; not copied"
  fi
  BUN_NOTE="$BUN_BINARY verified sha256 $BUN_ACTUAL"
fi

# ---- execution helpers ------------------------------------------------------------------------------
# Decide file placement; mirrors decideBinaryPlacement() in scripts/gateway-setup.ts.
decide_file() {
  local dest="$1" want="$2" existing=""
  [ -e "$dest" ] && existing="$(sha256sum "$dest" | cut -d' ' -f1)"
  if [ -z "$existing" ]; then echo install
  elif [ "$existing" = "$want" ]; then echo keep
  elif [ "$REPLACE_BINARY" = 1 ]; then echo replace
  else echo refuse
  fi
}

# place_file LABEL SRC SHA OWNER GROUP MODE DEST: copy SRC to DEST only when SHA matches its content.
place_file() {
  local label="$1" src="$2" want="$3" owner="$4" group="$5" mode="$6" dest="$7" action
  action="$(decide_file "$dest" "$want")"
  case "$action" in
    install) say "$label $dest: install $owner:$group $mode after sha256 check" ;;
    keep) say "$label $dest: identical, kept (mode and owner corrected)" ;;
    replace) say "$label $dest: different; old copy kept as $dest.replaced-$TS (requires --replace-binary)" ;;
    refuse) say "$label $dest: differs from $want; refusing (pass --replace-binary to replace, old kept as a sidecar)" ;;
  esac
  if [ "$APPLY" = 1 ]; then
    case "$action" in
      install) install -o "$owner" -g "$group" -m "$mode" "$src" "$dest" ;;
      keep) chown "$owner:$group" "$dest"; chmod "$mode" "$dest" ;;
      replace) mv "$dest" "$dest.replaced-$TS"; install -o "$owner" -g "$group" -m "$mode" "$src" "$dest" ;;
      refuse) refuse "$label $dest differs; pass --replace-binary" ;;
    esac
  fi
}

row_account() {
  local name="$1" role="$2"
  if id -u "$name" >/dev/null 2>&1; then say "account $name ($role): exists, reused"; return; fi
  say "account $name ($role): missing; run: groupadd --system $name; useradd --system --gid $name --no-create-home --shell /usr/sbin/nologin $name"
  if [ "$APPLY" = 1 ]; then
    getent group "$name" >/dev/null || groupadd --system "$name"
    useradd --system --gid "$name" --no-create-home --shell /usr/sbin/nologin "$name"
  fi
}

row_group() {
  local name="$1"
  say "group $name: groupadd --system $name (if missing)"
  if [ "$APPLY" = 1 ]; then getent group "$name" >/dev/null || groupadd --system "$name"; fi
}

row_member() {
  local user="$1" group="$2"
  say "member: usermod -a -G $group $user"
  if [ "$APPLY" = 1 ]; then usermod -a -G "$group" "$user"; fi
}

row_dir() {
  local owner="$1" group="$2" mode="$3" path="$4"
  say "dir: install -d -o $owner -g $group -m $mode $path"
  if [ "$APPLY" = 1 ]; then install -d -o "$owner" -g "$group" -m "$mode" "$path"; fi
}

row_place_bun() {
  local owner="$1" group="$2" mode="$3" dest="$4"
  if [ -z "$BUN_BINARY" ]; then
    say "bun $dest: copy a Bun you already trust to root:root 0755 here (owner runs this step; no network install); pass --bun PATH --bun-sha256 HEX"
    if [ "$APPLY" = 1 ]; then refuse "no bun given: pass --bun PATH --bun-sha256 HEX"; fi
    return
  fi
  say "bun: owner runs this step; the copy is verified, never downloaded"
  place_file bun "$BUN_BINARY" "$BUN_SHA256" "$owner" "$group" "$mode" "$dest"
}

row_optional_exec() {
  local path="$1"
  if [ -x "$path" ]; then say "realitytrace $path: present (the runtime unit points at it)"; return; fi
  say "realitytrace $path: absent; the runtime unit points at it. Place a root-owned copy there yourself if you use RealityTrace (not installed here)"
}

row_place_binary() {
  local owner="$1" group="$2" mode="$3" dest="$4"
  if [ -z "$BINARY" ]; then
    say "binary $dest: no binary given (pass --binary PATH --sha256 HEX)"
    if [ "$APPLY" = 1 ]; then refuse "no binary given: pass --binary PATH --sha256 HEX"; fi
    return
  fi
  place_file binary "$BINARY" "$SHA256" "$owner" "$group" "$mode" "$dest"
}

row_deploy_tree() {
  local owner="$1" group="$2" dst="$3" new="$3.new-$TS"
  say "deploy $STAGE/runtime -> $dst: root-owned copy (dirs 0755, files 0644), manifest verified, previous tree kept as $dst.previous-$TS"
  if [ "$APPLY" = 1 ]; then
    install -d -o "$owner" -g "$group" -m 0755 "$(dirname "$dst")"
    rm -rf "$new"
    cp -a "$STAGE/runtime" "$new"
    chown -R -h "$owner:$group" "$new"
    find "$new" -type d -exec chmod 0755 {} +
    find "$new" -type f -exec chmod 0644 {} +
    if ! (cd "$new" && sha256sum -c --quiet "$STAGE/runtime-manifest.sha256"); then
      rm -rf "$new"
      refuse "copied runtime tree does not match the manifest"
    fi
    if [ -e "$dst" ]; then mv "$dst" "$dst.previous-$TS"; fi
    mv "$new" "$dst"
    install -o "$owner" -g "$group" -m 0644 "$STAGE/runtime-manifest.sha256" "$dst.manifest.sha256"
  fi
}

# The runtime account's name comes from the plan, never from a constant.
runtime_account_name() { awk -F'\t' '$1=="account" && $3=="runtime" {print $2; exit}' "$STAGE/plan.tsv"; }

# Render a staged template into $3. Two substitutions, read at install: the runtime uid (`id -u`) and the
# socket group's gid (`getent group`, the group named in the staged plan). Root and non-numeric values are refused.
render_config() {
  local tmpl="$1" rt="$2" out="$3" uid="" gid="" sock=""
  cp "$STAGE/$tmpl" "$out"
  if grep -q '"__RUNTIME_UID__"' "$STAGE/$tmpl"; then
    uid="$(id -u "$rt")" || refuse "runtime account '$rt' does not exist; the account step must run first"
    [[ "$uid" =~ ^[1-9][0-9]{0,9}$ ]] || refuse "runtime account '$rt' has no usable uid (root and non-numeric are refused)"
    sed -i "s/\"__RUNTIME_UID__\"/$uid/g" "$out"
  fi
  if grep -q '"__SOCKET_GID__"' "$STAGE/$tmpl"; then
    sock="$(awk -F'\t' '$1=="group"{print $2; exit}' "$STAGE/plan.tsv")"
    [ -n "$sock" ] || refuse "the staged plan names no socket group"
    gid="$(getent group "$sock" | cut -d: -f3)"
    [[ "$gid" =~ ^[1-9][0-9]{0,9}$ ]] || refuse "socket group '$sock' has no usable gid (root and non-numeric are refused)"
    sed -i "s/\"__SOCKET_GID__\"/$gid/g" "$out"
  fi
}

row_config_file() {
  local owner="$1" group="$2" mode="$3" path="$4" tmpl="$5" rt new
  rt="$(runtime_account_name)"
  if [ "$APPLY" != 1 ]; then
    if [ -e "$path" ]; then say "config $path: exists, kept as authoritative (a differing render becomes a sidecar)"
    elif grep -q '"__RUNTIME_UID__"' "$STAGE/$tmpl"; then say "config $path: rendered from $tmpl with the uid of $rt (id -u) at install, $owner:$group $mode"
    else say "config $path: placed from $tmpl, $owner:$group $mode"; fi
    return
  fi
  new="$(mktemp)"
  render_config "$tmpl" "$rt" "$new"
  if [ ! -e "$path" ]; then
    install -o "$owner" -g "$group" -m "$mode" "$new" "$path"
    say "config $path: rendered, $owner:$group $mode"
  elif cmp -s "$new" "$path"; then
    chown "$owner:$group" "$path"; chmod "$mode" "$path"
    say "config $path: identical, kept (mode and owner corrected)"
  else
    install -o "$owner" -g "$group" -m "$mode" "$new" "$path.generated-$TS"
    SIDECARS=$((SIDECARS+1))
    say "config $path: authoritative and differs from this checkout; kept it, wrote $path.generated-$TS"
  fi
  rm -f "$new"
}

row_worlds() {
  local owner="$1" group="$2" dest="$3" src="$STAGE/$4" list
  list="$(cd "$src" && find . -name '*.sea' -not -path '*/validation/*' -not -path '*/__pycache__/*' | sed 's|^\./||' | sort)"
  say "worlds $dest: $(printf '%s\n' "$list" | grep -c .) .sea file(s) copied from the verified runtime domain, $owner:$group 0644"
  if [ "$APPLY" = 1 ]; then
    rm -rf "$dest"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      install -D -o "$owner" -g "$group" -m 0644 "$src/$f" "$dest/$f"
    done <<< "$list"
  fi
}

row_generated() {
  local owner="$1" group="$2" mode="$3" src="$4" dst="$5"
  if [ ! -e "$dst" ]; then say "generated $dst: install $owner:$group $mode"
  elif cmp -s "$STAGE/$src" "$dst"; then say "generated $dst: identical, kept (mode corrected)"
  else say "generated $dst: differs; old copy kept as $dst.generated-$TS"
  fi
  if [ "$APPLY" = 1 ]; then
    mkdir -p "$(dirname "$dst")"
    if [ -e "$dst" ] && ! cmp -s "$STAGE/$src" "$dst"; then mv "$dst" "$dst.generated-$TS"; fi
    install -o "$owner" -g "$group" -m "$mode" "$STAGE/$src" "$dst"
  fi
}

# ---- checks (read-only; used by --check and as a precondition of --authorize-privileged) ------------
check_row_stat() {
  local owner="$1" group="$2" mode="$3" path="$4" want actual
  want="$owner:$group $(printf '%o' "$((8#$mode))")"
  if [ ! -e "$path" ]; then
    # A path under a directory this login cannot traverse looks missing. That is the containment working, not an absent file.
    # Only root can confirm it. Report it as unverified, not as a problem.
    # Walk up to the nearest ancestor this login can see. If that ancestor exists but is closed, the path is unverified.
    local ancestor; ancestor="$(dirname "$path")"
    while [ "$ancestor" != "/" ] && [ ! -e "$ancestor" ]; do ancestor="$(dirname "$ancestor")"; done
    if [ "$(id -u)" != 0 ] && [ -e "$ancestor" ] && { [ ! -x "$ancestor" ] || [ ! -r "$ancestor" ]; }; then
      echo "  UNVERIFIED $path (not visible to this login; $ancestor is closed to other accounts; run the check as root to confirm)"
      return 0
    fi
    echo "  MISSING $path (expected $want)"; return 1
  fi
  actual="$(stat -c '%U:%G %a' "$path")"
  if [ "$actual" = "$want" ]; then echo "  ok      $path: $actual"; return 0; fi
  echo "  BAD     $path: $actual, expected $want"; return 1
}

run_check() {
  local fails=0 agent groups sock_group="" rt="" gw="" socket=""
  while IFS=$'\t' read -r -u 3 -a F; do
    case "${F[0]}" in
      account) [ "${F[2]}" = gateway ] && gw="${F[1]}"; [ "${F[2]}" = runtime ] && rt="${F[1]}" ;;
      group) sock_group="${F[1]}" ;;
      socket) socket="${F[1]}" ;;
    esac
  done 3< "$STAGE/plan.tsv"
  agent="$(id -un)"
  groups=" $(id -Gn "$agent") "
  echo "agent account (the login running this check): $agent"
  if [ -n "$sock_group" ] && [[ "$groups" == *" $sock_group "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in socket group $sock_group"; fi
  if [ -n "$gw" ] && [[ "$groups" == *" $gw "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in gateway group $gw"; fi
  if [ -n "$rt" ] && [[ "$groups" == *" $rt "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in runtime group $rt"; fi
  if [ "$agent" = "$gw" ] || [ "$agent" = "$rt" ]; then fails=$((fails+1)); echo "  FAIL    agent is a service account"; fi
  while IFS=$'\t' read -r -u 3 -a F; do
    case "${F[0]}" in
      account) id -u "${F[1]}" >/dev/null 2>&1 && echo "  ok      account ${F[1]} exists" || { fails=$((fails+1)); echo "  MISSING account ${F[1]}"; } ;;
      member) id -nG "${F[1]}" 2>/dev/null | tr ' ' '\n' | grep -qx "${F[2]}" && echo "  ok      ${F[1]} in ${F[2]}" || { fails=$((fails+1)); echo "  MISSING ${F[1]} not in ${F[2]}"; } ;;
      dir|config-file|generated|place-binary|place-bun)
        case "${F[0]}" in
          dir) check_row_stat "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" || fails=$((fails+1)) ;;
          config-file) check_row_stat "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" || fails=$((fails+1)) ;;
          generated) check_row_stat "${F[1]}" "${F[2]}" "${F[3]}" "${F[5]}" || fails=$((fails+1)) ;;
          place-binary|place-bun) check_row_stat "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" || fails=$((fails+1)) ;;
        esac ;;
      optional-exec) [ -x "${F[1]}" ] && echo "  ok      ${F[1]} present" || echo "  note    ${F[1]} absent (RealityTrace not installed by this installer)" ;;
      deploy-tree)
        if (cd "${F[3]}" 2>/dev/null && sha256sum -c --quiet "${F[3]}.manifest.sha256" 2>/dev/null); then
          echo "  ok      runtime tree ${F[3]} matches its manifest"
        else fails=$((fails+1)); echo "  BAD     runtime tree ${F[3]} missing or not matching its manifest"; fi ;;
      socket)
        if [ -S "${F[1]}" ] && command -v python3 >/dev/null 2>&1; then
          result="$(python3 -c 'import socket,sys
s=socket.socket(socket.AF_UNIX)
try:
    s.connect(sys.argv[1]); print("CONNECTED")
except PermissionError: print("permission denied")
except OSError as e: print("error: %s" % e)' "${F[1]}")"
          if [ "$result" = "permission denied" ]; then echo "  ok      agent cannot open the socket (permission denied, expected)";
          else fails=$((fails+1)); echo "  FAIL    agent socket open: $result"; fi
        else echo "  note    socket ${F[1]} not present or python3 missing; socket check skipped"; fi ;;
    esac
  done 3< "$STAGE/plan.tsv"
  if [ "$fails" = 0 ]; then echo "check: ok"; return 0; fi
  echo "check: $fails problem(s)"; return 1
}

# ---- plan execution ---------------------------------------------------------------------------------
run_plan() {
  while IFS=$'\t' read -r -u 3 -a F; do
    case "${F[0]}" in
      account) row_account "${F[1]}" "${F[2]}" ;;
      group) row_group "${F[1]}" ;;
      member) row_member "${F[1]}" "${F[2]}" ;;
      dir) row_dir "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" ;;
      place-bun) row_place_bun "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" ;;
      optional-exec) row_optional_exec "${F[1]}" ;;
      place-binary) row_place_binary "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" ;;
      deploy-tree) row_deploy_tree "${F[1]}" "${F[2]}" "${F[3]}" ;;
      config-file) row_config_file "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" "${F[5]}" ;;
      worlds) row_worlds "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" ;;
      generated) row_generated "${F[1]}" "${F[2]}" "${F[3]}" "${F[4]}" "${F[5]}" ;;
      socket) say "socket ${F[1]}: created by the gateway service, checked by --check" ;;
      *) refuse "unknown plan step '${F[0]}'" ;;
    esac
  done 3< "$STAGE/plan.tsv"
}

if [ "$CHECK" = 1 ]; then
  echo "SEA-Forge gateway check (read-only); stage $STAGE, digest $STAGE_DIGEST"
  run_check
  exit $?
fi

echo "SEA-Forge gateway setup (mode: $MODE)"
echo "stage: $STAGE"
echo "stage digest: $STAGE_DIGEST"
echo "binary: $BINARY_NOTE"
echo "bun: $BUN_NOTE"
echo "privileged plan:"

if [ "$APPLY" = 1 ]; then
  [ "$(id -u)" = 0 ] || refuse "--authorize-privileged must run as root (sudo)"
  [ "$EXPECT_STAGE" = "$STAGE_DIGEST" ] || refuse "--expect-stage-sha256 does not match the staged bundle digest $STAGE_DIGEST; review the plan and pass that digest"
  [ -n "$BINARY" ] || refuse "--binary and --sha256 are required with --authorize-privileged"
  [ -n "$BUN_BINARY" ] || refuse "--bun and --bun-sha256 are required with --authorize-privileged"
  # The operator who ran sudo must not become a gateway, runtime or socket-group member.
  invoker="${SUDO_USER:-root}"
  if [ "$invoker" != root ] && id -u "$invoker" >/dev/null 2>&1; then
    while IFS=$'\t' read -r -u 3 -a F; do
      if [ "${F[0]}" = account ] && [ "${F[1]}" = "$invoker" ]; then refuse "the invoking login '$invoker' is a service account in the plan"; fi
      if [ "${F[0]}" = group ] && id -nG "$invoker" | tr ' ' '\n' | grep -qx "${F[1]}"; then refuse "the invoking login '$invoker' is in the socket group ${F[1]}"; fi
    done 3< "$STAGE/plan.tsv"
  fi
fi

run_plan

if [ "$APPLY" = 1 ]; then
  if [ "$SIDECARS" -gt 0 ]; then
    echo "note: $SIDECARS authoritative config file(s) differ from this checkout; the generated versions sit beside them (*.generated-<UTC>). Compare and merge by hand."
  fi
  echo "done. Units are installed, not started. Next: sudo systemctl daemon-reload, then start the gateway, then the runtime."
  exit 0
fi

echo "no changes made."
echo "to apply, as root (sudo asks for your password; the owner runs this, including the bun step):"
echo "  sudo $0 --authorize-privileged --stage $STAGE --binary ${BINARY:-<path to sea-forge-server>} --sha256 ${SHA256:-<sha256>} --bun ${BUN_BINARY:-<path to a trusted bun>} --bun-sha256 ${BUN_SHA256:-<sha256 of bun>} --expect-stage-sha256 $STAGE_DIGEST"
echo "the installer renders server.yaml (runtime uid from id -u) and places policy.yaml in the gateway root; --check verifies them."
