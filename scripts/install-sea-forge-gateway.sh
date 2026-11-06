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
#   install-sea-forge-gateway.sh [--dry-run] [--check] [--verify-only --expect-stage-sha256 HEX [--binary ... --bun ...]] [--stage DIR]
#       [--authorize-privileged --binary PATH --sha256 HEX --bun PATH --bun-sha256 HEX
#        --expect-stage-sha256 HEX [--replace-binary]]
#
# Snapshot (threat: agents run as the owner's login and can write the stage and the --binary/--bun sources at any time,
# including while this script runs as root): every mode that reads the stage first copies the stage dir, --binary and --bun
# into a fresh private directory (mktemp -d under /run or /root as root, removed on exit) with symlinks copied as links.
# Every check and install step reads only that snapshot: the digest, the manifest check, the hashes and the plan.
# The stage digest is sha256 over sorted `sha256  path` lines of every regular file in the stage outside runtime/
# (the manifest and symlink list among them, which pin runtime/ exactly). Any other entry type there is refused.
# runtime/ must equal runtime-manifest.sha256 (files) and runtime-symlinks.tsv (`dir<TAB>path` lines for every directory,
# `symlink<TAB>target<TAB>path` lines for every relative, in-tree symlink): an unlisted or missing entry of any kind,
# a changed file or link target, an absolute or escaping link, a device/fifo/socket, or a path or link target containing
# a newline, carriage return, tab or backslash is refused. The same checks run again on the deployed copy.
# Every staged file the plan reads (config templates, units, status, worlds) must exist as a regular file.
# --verify-only runs snapshot + digest + tree checks and exits; it needs no root and installs nothing.
#
# Environment (defaults are product names; nothing is derived from the current user):
#   HORIZON_GATEWAY_STAGE   staging bundle directory (~/.cache/godspeed/gateway-stage); --stage overrides; ignored as root
#   HORIZON_GATEWAY_ROOT    prefix for all paths, for testing against a temporary directory (staging records it)
#   As root (uid 0) the script refuses when any HORIZON_GATEWAY_* variable is set and requires --stage.
#   Account, path and bun settings are read by `gateway-setup.ts stage`; see its header.
#
# Privileged plan (what --authorize-privileged does, in order):
#   account   gateway and runtime service accounts (system, nologin, no home), created if missing
#   group     socket group; both service accounts are members; the operator is not
#   dir       bin dirs root:root 0755; socket dir GATEWAY:socket 0750;
#             gateway root (= SEA_FORGE_ROOT, holds server.yaml) GATEWAY:GATEWAY 711;
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
# The gateway root is 0711 (gateway-owned). The gateway's own hardening enforces this mode on every start, so the
# installer expects it. The config files are root-owned and 0640 (group socket, read-only), so the gateway can read
# them and cannot write them. It can still replace one by rename or unlink, because a directory's owner may remove
# any entry in it; a sticky bit would not prevent that. Config integrity against the gateway rests on the file
# ownership and mode.
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
VERIFY=0
STAGE=""
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
    --verify-only) VERIFY=1 ;;
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
[ "$VERIFY" = 1 ] && [ "$APPLY" = 1 ] && { echo "--verify-only cannot be combined with --authorize-privileged (it installs nothing; run them separately)" >&2; exit 2; }
if [ -n "${INSTALLER_TEST_MODE:-}" ] && [ "$APPLY" = 1 ]; then echo "INSTALLER_TEST_MODE cannot be combined with --authorize-privileged" >&2; exit 2; fi
if [ "$(id -u)" = 0 ] || [ "$(id -ru)" = 0 ] || [ "${EUID:-1}" = 0 ]; then
  # Root never takes a destination, stage or test seam from the environment.
  if [ -n "${INSTALLER_TEST_MODE:-}" ]; then echo "refusing: INSTALLER_TEST_MODE is set; the installer test seam is never active as root" >&2; exit 2; fi
  if compgen -e | grep -q '^HORIZON_GATEWAY_'; then echo "refusing: a HORIZON_GATEWAY_* variable is set ($(compgen -e | grep '^HORIZON_GATEWAY_' | tr '\n' ' ')); unset it before running as root" >&2; exit 2; fi
  [ -n "$STAGE" ] || { echo "refusing: pass --stage DIR explicitly when running as root" >&2; exit 2; }
elif [ -z "$STAGE" ]; then
  STAGE="${HORIZON_GATEWAY_STAGE:-${XDG_CACHE_HOME:-$HOME/.cache}/$PRODUCT/gateway-stage}"
fi
# --dry-run together with --authorize-privileged stays a dry run.
if [ "$DRY" = 1 ]; then APPLY=0; fi
if [ "$CHECK" = 1 ]; then APPLY=0; fi
if [ "$VERIFY" = 1 ] && { [ "$DRY" = 1 ] || [ "$CHECK" = 1 ]; }; then echo "--verify-only cannot be combined with --dry-run or --check" >&2; exit 2; fi
MODE=dry-run
[ "$CHECK" = 1 ] && MODE=check
if [ "$VERIFY" = 1 ]; then APPLY=0; MODE=verify-only; fi
[ "$APPLY" = 1 ] && MODE=apply

say() { printf '  %s\n' "$*"; }
refuse() { echo "refusing: $*" >&2; exit 1; }
TS="$(date -u +%Y%m%dT%H%M%SZ)"

# ---- staged bundle ----------------------------------------------------------------------------------
STAGE_SRC="${STAGE%"${STAGE##*[!/]}"}" # no trailing slash, so the symlink test below sees the stage root itself
STAGE="$STAGE_SRC"
BINARY_SRC="$BINARY"
BUN_SRC="$BUN_BINARY"
STAGED=1
for f in plan.tsv runtime-manifest.sha256 runtime-symlinks.tsv status.json units/godspeed-sea-forge.service units/godspeed-horizon.service runtime; do
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

# The privileged mode needs root before anything else is read.
if [ "$APPLY" = 1 ]; then
  [ "$(id -u)" = 0 ] || refuse "--authorize-privileged must run as root (sudo)"
fi

# ---- snapshot: from here on only the private copy is read ---------------------------------------------
# Test seam (never active as root): INSTALLER_TEST_MODE=1 with --verify-only runs INSTALLER_TEST_HOOK_AFTER_SNAPSHOT
# (a bash script path) right after the snapshot, so a test can modify the original stage and show it is not used.
if [ "$(id -u)" = 0 ]; then
  SNAP_PARENT=/run; [ -d /run ] && [ -w /run ] || SNAP_PARENT=/root
else
  SNAP_PARENT="${TMPDIR:-/tmp}"
fi
SNAP="$(mktemp -d "$SNAP_PARENT/gateway-snapshot.XXXXXX")" || refuse "cannot create a snapshot directory under $SNAP_PARENT"
chmod 0700 "$SNAP"
trap 'rm -rf -- "$SNAP"' EXIT
{ [ -d "$STAGE_SRC" ] && [ ! -L "$STAGE_SRC" ]; } || refuse "stage $STAGE_SRC is not a real directory (a symlinked stage root is refused)"
mkdir -- "$SNAP/stage"
STAGE_ID="$(stat -c %d:%i -- "$STAGE_SRC")" || refuse "cannot stat the stage $STAGE_SRC"
# cp -a copies symlinks as links (never follows them); ownership is not preserved, so the copy is owned by the invoker.
# No -a and no --preserve=mode (GNU cp would carry ACLs with it): neither ACLs, xattrs, ownership nor mode bits reach root's copy;
# modes are set explicitly by the chmod normalisation below and by the install steps.
cp -dR --preserve=timestamps,links --no-preserve=mode,ownership,xattr,context -- "$STAGE_SRC/." "$SNAP/stage/" || refuse "could not snapshot the stage $STAGE_SRC"
# The stage root must still be the same non-symlink directory it was when it was checked and measured.
{ [ -d "$STAGE_SRC" ] && [ ! -L "$STAGE_SRC" ] && [ "$(stat -c %d:%i -- "$STAGE_SRC")" = "$STAGE_ID" ]; } || refuse "stage $STAGE_SRC changed while it was copied"
STAGE="$SNAP/stage"
snapshot_file() {
  local label="$1" src="$2" dst="$3"
  [ -e "$src" ] || [ -L "$src" ] || refuse "$label $src does not exist"
  [ ! -L "$src" ] || refuse "$label $src is a symlink; pass the resolved path (readlink -f)"
  [ -f "$src" ] || refuse "$label $src is not a regular file"
  # cp -a recreates a special file instead of reading it (a fifo swapped in cannot hang root); the copy is then required
  # to be a regular file, so a symlink or special file swapped in after the checks above is refused, not followed.
  cp -dR --preserve=timestamps,links --no-preserve=mode,ownership,xattr,context -- "$src" "$dst" || refuse "could not snapshot $label $src"
  { [ -f "$dst" ] && [ ! -L "$dst" ]; } || refuse "$label $src changed while it was copied (the copy is not a regular file)"
}
if [ -n "$BINARY" ]; then snapshot_file binary "$BINARY_SRC" "$SNAP/binary"; BINARY="$SNAP/binary"; fi
if [ -n "$BUN_BINARY" ]; then snapshot_file bun "$BUN_SRC" "$SNAP/bun"; BUN_BINARY="$SNAP/bun"; fi
# Whatever mode bits the agent set on the originals never reach root's working copy: owner-only, no setuid/setgid/sticky.
chmod -R u+rwX,go-rwx -- "$SNAP"
find "$SNAP" ! -type l -exec chmod ugo-s,-t {} +
# The hook gets only the original stage path: no TMPDIR to find the snapshot by, no SNAP variable.
if [ "$VERIFY" = 1 ] && [ "${INSTALLER_TEST_MODE:-}" = 1 ] && [ -n "${INSTALLER_TEST_HOOK_AFTER_SNAPSHOT:-}" ] \
  && [ "$(id -u)" != 0 ] && [ "$(id -ru)" != 0 ] && [ "${EUID:-1}" != 0 ]; then
  env -u TMPDIR -u SNAP bash "$INSTALLER_TEST_HOOK_AFTER_SNAPSHOT" "$STAGE_SRC"
fi
# SNAPSHOT-END: STAGE_SRC, BINARY_SRC and BUN_SRC are used for messages only from here on.

# staged_file REL: a staged path root reads must be a regular file in the snapshot, inside the stage, never a symlink.
staged_file() {
  case "$1" in ""|/*|..|../*|*/..|*/../*) refuse "staged path '$1' is not a plain relative path" ;; esac
  { [ -f "$STAGE/$1" ] && [ ! -L "$STAGE/$1" ]; } || refuse "staged $1 is missing or not a regular file"
}
for f in plan.tsv runtime-manifest.sha256 runtime-symlinks.tsv status.json; do staged_file "$f"; done
[ -d "$STAGE/runtime" ] && [ ! -L "$STAGE/runtime" ] || refuse "staged runtime is missing or not a real directory"

# The digest: sha256 over sorted "sha256  path" lines of every regular file outside runtime/ (computed on the snapshot).
# Anything else outside runtime/ (symlink, device, fifo, socket) is refused, so nothing root reads goes unbound.
compute_stage_digest() {
  local d="$1" odd
  odd="$(cd "$d" && find . -path ./runtime -prune -o ! -type d ! -type f -print -quit)"
  [ -z "$odd" ] || { echo "refusing: non-regular entry in the stage outside runtime: $odd" >&2; return 1; }
  odd="$(cd "$d" && find . -path ./runtime -prune -o -name $'*\n*' -print -quit)"
  [ -z "$odd" ] || { echo "refusing: stage path with a newline in its name" >&2; return 1; }
  (cd "$d" && find . -path ./runtime -prune -o -type f -print0 | LC_ALL=C sort -z \
    | while IFS= read -r -d '' p; do p="${p#./}"; printf '%s  %s\n' "$(sha256sum < "$p" | cut -d' ' -f1)" "$p"; done) | sha256sum | cut -d' ' -f1
}
STAGE_DIGEST="$(compute_stage_digest "$STAGE")" || refuse "cannot compute the stage digest"

# Compare the approved digest before anything else is looked at (verify-only and apply).
if [ "$APPLY" = 1 ] || [ "$VERIFY" = 1 ]; then
  [ "$EXPECT_STAGE" = "$STAGE_DIGEST" ] || refuse "--expect-stage-sha256 does not match the staged bundle digest $STAGE_DIGEST; review the plan and pass that digest"
fi

# verify_tree DIR MANIFEST LIST: DIR must be exactly what the manifest (files + sha256) and the list (dir/symlink lines) name.
verify_tree() {
  local dir="$1" manifest="$2" list="$3" odd want got root target nlines
  odd="$(find "$dir" ! -type f ! -type d ! -type l -print -quit)"
  [ -z "$odd" ] || { echo "refusing: non-regular entry in the runtime tree (device, fifo or socket): $odd" >&2; return 1; }
  # Names the manifest and list formats cannot carry unambiguously (same rule as the stager's assertPlainName): checked on the
  # full relative path (-path, below the tree root) and on every link target (-lname), not just base names.
  odd="$(cd "$dir" && find . -mindepth 1 \( -path $'*\n*' -o -path $'*\r*' -o -path $'*\t*' -o -path '*\\*' \
    -o -lname $'*\n*' -o -lname $'*\r*' -o -lname $'*\t*' -o -lname '*\\*' \) -print -quit)"
  [ -z "$odd" ] || { echo "refusing: runtime path or symlink target with a newline, carriage return, tab or backslash in it" >&2; return 1; }
  # files: the set must be exactly the manifest's, then every hash
  want="$(sed -E 's/^[0-9a-f]{64}  //' "$manifest" | LC_ALL=C sort)"
  got="$(cd "$dir" && find . -type f -print | sed 's|^\./||' | LC_ALL=C sort)"
  if [ "$want" != "$got" ]; then
    echo "refusing: runtime files differ from the manifest (unlisted or missing):" >&2
    diff <(printf '%s\n' "$want") <(printf '%s\n' "$got") | grep '^[<>]' | head -10 >&2 || true
    return 1
  fi
  (cd "$dir" && sha256sum -c --quiet "$manifest" >/dev/null 2>&1) || { echo "refusing: a runtime file differs from its manifest hash" >&2; return 1; }
  # the list holds only dir and symlink lines
  nlines="$(grep -c '' "$list" || true)"
  [ "$nlines" = "$(grep -cE $'^(dir\t[^\t]+|symlink\t[^\t]+\t[^\t]+)$' "$list" || true)" ] || { echo "refusing: the runtime list has a line that is neither dir nor symlink" >&2; return 1; }
  # directories: exactly the listed ones (a directory nothing names is still something root would install)
  want="$(grep $'^dir\t' "$list" | LC_ALL=C sort || true)"
  got="$(cd "$dir" && find . -mindepth 1 -type d -printf 'dir\t%P\n' | LC_ALL=C sort)"
  if [ "$want" != "$got" ]; then
    echo "refusing: runtime directories differ from the list (extra or missing):" >&2
    diff <(printf '%s\n' "$want") <(printf '%s\n' "$got") | grep '^[<>]' | head -10 >&2 || true
    return 1
  fi
  # symlinks: exactly the listed ones, same targets
  want="$(grep $'^symlink\t' "$list" | LC_ALL=C sort || true)"
  got="$(cd "$dir" && find . -type l -printf 'symlink\t%l\t%P\n' | LC_ALL=C sort)"
  if [ "$want" != "$got" ]; then
    echo "refusing: runtime symlinks differ from the list (extra, missing or changed target):" >&2
    diff <(printf '%s\n' "$want") <(printf '%s\n' "$got") | grep '^[<>]' | head -10 >&2 || true
    return 1
  fi
  # every link relative and, once resolved, inside the tree
  root="$(realpath "$dir")"
  while IFS= read -r -d '' l; do
    target="$(readlink "$l")"
    case "$target" in /*) echo "refusing: absolute symlink ${l#"$dir"/} -> $target" >&2; return 1 ;; esac
    case "$(realpath -m "$l")/" in "$root"/*) ;; *) echo "refusing: symlink ${l#"$dir"/} -> $target escapes the runtime tree" >&2; return 1 ;; esac
  done < <(find "$dir" -type l -print0)
  return 0
}

# The staged runtime tree must equal its manifest and symlink list before anything is installed from it.
verify_tree "$STAGE/runtime" "$STAGE/runtime-manifest.sha256" "$STAGE/runtime-symlinks.tsv" || refuse "staged runtime tree does not match its manifest; run: just gateway-stage"

# The only plan rows root will act on. plan.tsv is written by the unprivileged stager, so it can only SELECT from this table:
# every destination, owner, group and mode root applies comes from here, never from the plan. Fields are separated by "|"
# here and by a tab in plan.tsv. A staged plan with another path, account, owner, group or mode (for example a development
# layout or HORIZON_GATEWAY_ROOT) is refused in every mode; change this table in a reviewed commit to support it.
PLAN_TABLE=(
  $'account\tgodspeed-sea-forge\tgateway'
  $'account\tgodspeed-horizon\truntime'
  $'group\tgodspeed-sock'
  $'member\tgodspeed-sea-forge\tgodspeed-sock'
  $'member\tgodspeed-horizon\tgodspeed-sock'
  $'dir\troot\troot\t0755\t/usr/local/lib/godspeed-sea-forge'
  $'dir\troot\troot\t0755\t/usr/local/lib/godspeed-sea-forge/bin'
  $'dir\troot\troot\t0755\t/usr/local/lib/godspeed-horizon/bin'
  $'dir\tgodspeed-sea-forge\tgodspeed-sock\t0750\t/run/godspeed-sea-forge'
  $'dir\tgodspeed-sea-forge\tgodspeed-sea-forge\t711\t/var/lib/godspeed-sea-forge'
  $'dir\tgodspeed-sea-forge\tgodspeed-sea-forge\t0700\t/var/lib/godspeed-sea-forge/realitytrace/data'
  $'dir\tgodspeed-sea-forge\tgodspeed-sea-forge\t0700\t/var/lib/godspeed-sea-forge/realitytrace/state'
  $'worlds\troot\tgodspeed-sock\t/var/lib/godspeed-sea-forge/worlds\truntime/domain'
  $'dir\tgodspeed-horizon\tgodspeed-horizon\t0700\t/var/lib/godspeed-horizon'
  $'place-bun\troot\troot\t0755\t/usr/local/lib/godspeed-horizon/bin/bun'
  $'optional-exec\t/usr/local/lib/godspeed-horizon/bin/realitytrace'
  $'place-binary\troot\troot\t0755\t/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server'
  $'deploy-tree\troot\troot\t/opt/godspeed-horizon'
  $'config-file\troot\tgodspeed-sock\t0640\t/var/lib/godspeed-sea-forge/server.yaml\tconfig/server.yaml.in'
  $'config-file\troot\tgodspeed-sock\t0640\t/var/lib/godspeed-sea-forge/policy.yaml\tconfig/policy.yaml'
  $'generated\troot\tgodspeed-sock\t0640\tstatus.json\t/var/lib/godspeed-sea-forge/status.json'
  $'generated\troot\troot\t0644\tunits/godspeed-sea-forge.service\t/etc/systemd/system/godspeed-sea-forge.service'
  $'generated\troot\troot\t0644\tunits/godspeed-horizon.service\t/etc/systemd/system/godspeed-horizon.service'
  $'socket\t/run/godspeed-sea-forge/sea-forge.sock'
)
# Test seam (non-root, test mode, never with --authorize-privileged): INSTALLER_TEST_PLAN_TABLE=FILE replaces the table with
# the rows of that file, so tests can stage fake accounts and a temporary root. It is refused as root like the other seams.
if [ "${INSTALLER_TEST_MODE:-}" = 1 ] && [ -n "${INSTALLER_TEST_PLAN_TABLE:-}" ] && [ "$(id -u)" != 0 ] && [ "$(id -ru)" != 0 ] && [ "${EUID:-1}" != 0 ]; then
  mapfile -t PLAN_TABLE < "$INSTALLER_TEST_PLAN_TABLE"
fi

# load_plan: the ONLY place plan.tsv is opened. It is read once from the snapshot into PLAN_ROWS, and every later consumer
# (check_plan_sources, run_plan, run_check, dry-run printing, account and group lookups) reads that array. The file is refused
# unless it ends in a newline, has no CR, "|" or NUL, and every line is exactly one PLAN_TABLE row (tabs preserved), which also
# fixes each step's field count.
PLAN_ROWS=()
load_plan() {
  local raw row t ok
  if IFS= read -r -d '' raw < "$STAGE/plan.tsv"; then refuse "plan.tsv contains a NUL byte"; fi
  [[ "$raw" == *$'\n' ]] || refuse "plan.tsv does not end with a newline"
  case "$raw" in *$'\r'*) refuse "plan.tsv contains a carriage return" ;; esac
  case "$raw" in *'|'*) refuse "plan.tsv contains a '|'" ;; esac
  [[ "$raw" != *$'\n\n'* && "$raw" != $'\n'* ]] || refuse "plan.tsv has an empty line"
  mapfile -t PLAN_ROWS <<< "${raw%$'\n'}"
  [ "${#PLAN_ROWS[@]}" -gt 0 ] || refuse "plan.tsv has no rows"
  for row in "${PLAN_ROWS[@]}"; do
    ok=0
    for t in "${PLAN_TABLE[@]}"; do [ "$row" = "$t" ] && { ok=1; break; }; done
    [ "$ok" = 1 ] || refuse "plan row is not in the installer's fixed table (destination, owner, group or mode differs): $(printf '%q' "$row")"
  done
  # The table is a required set, not a whitelist: every row exactly once, in order. A plan that drops, repeats or reorders rows
  # would pass the per-row check yet stop the apply half-way (or run steps in the wrong order).
  if [ "${#PLAN_ROWS[@]}" -ne "${#PLAN_TABLE[@]}" ]; then
    refuse "plan.tsv has ${#PLAN_ROWS[@]} rows; the installer's fixed table requires exactly ${#PLAN_TABLE[@]}"
  fi
  local i
  for i in "${!PLAN_TABLE[@]}"; do
    [ "${PLAN_ROWS[$i]}" = "${PLAN_TABLE[$i]}" ] || refuse "plan row $((i + 1)) differs from the installer's fixed table (missing, duplicated or reordered row): $(printf '%q' "${PLAN_ROWS[$i]}")"
  done
}

# Every staged source the plan reads must exist as a regular file in the snapshot, so --verify-only cannot bless a bundle the
# apply would fail on half-way. The list is derived from the plan rows, not hardcoded.
check_plan_sources() {
  local -a F
  local row
  load_plan
  for row in "${PLAN_ROWS[@]}"; do
    IFS=$'\t' read -r -a F <<< "$row"
    case "${F[0]}" in
      account|group|member|dir|place-bun|optional-exec|place-binary|socket) ;;
      deploy-tree) [ -d "$STAGE/runtime" ] ;;
      config-file) staged_file "${F[5]:-}" ;;
      generated) staged_file "${F[4]:-}" ;;
      worlds)
        case "${F[4]:-}" in runtime/*) ;; *) refuse "plan worlds source '${F[4]:-}' is not under runtime/" ;; esac
        case "${F[4]}" in *..*) refuse "plan worlds source '${F[4]}' is not a plain relative path" ;; esac
        { [ -d "$STAGE/${F[4]}" ] && [ ! -L "$STAGE/${F[4]}" ]; } || refuse "plan worlds source ${F[4]} is missing or not a real directory in the stage"
        [ -z "$(find "$STAGE/${F[4]}" -name '*.sea' ! -type f -print -quit)" ] || refuse "a *.sea entry under ${F[4]} is a directory or symlink, not a regular file" ;;
      *) refuse "unknown plan step '${F[0]}'" ;;
    esac
  done
}
check_plan_sources

# ---- the server binary: verified before any mode, and always refused on mismatch ----------------------
BINARY_NOTE="not given (pass --binary PATH --sha256 HEX)"
if [ -n "$BINARY" ]; then
  [ -n "$SHA256" ] || refuse "--sha256 is required with --binary"
  SHA256="$(printf '%s' "$SHA256" | tr 'A-F' 'a-f')"
  ACTUAL="$(sha256sum -- "$BINARY" | cut -d' ' -f1)"
  if [ "$ACTUAL" != "$SHA256" ]; then
    refuse "sha256 of $BINARY_SRC does not match the approved sha256; not copied"
  fi
  BINARY_NOTE="$BINARY_SRC verified (snapshot) sha256 $ACTUAL"
fi

# The runtime's bun: a copy the owner supplies and verifies; never downloaded here.
BUN_NOTE="not given (pass --bun PATH --bun-sha256 HEX; the owner runs this step)"
if [ -n "$BUN_BINARY" ]; then
  [ -n "$BUN_SHA256" ] || refuse "--bun-sha256 is required with --bun"
  BUN_SHA256="$(printf '%s' "$BUN_SHA256" | tr 'A-F' 'a-f')"
  BUN_ACTUAL="$(sha256sum -- "$BUN_BINARY" | cut -d' ' -f1)"
  if [ "$BUN_ACTUAL" != "$BUN_SHA256" ]; then
    refuse "sha256 of bun $BUN_SRC does not match the approved sha256; not copied"
  fi
  BUN_NOTE="$BUN_SRC verified (snapshot) sha256 $BUN_ACTUAL"
fi

# ---- execution helpers ------------------------------------------------------------------------------
# Decide file placement; mirrors decideBinaryPlacement() in scripts/gateway-setup.ts.
decide_file() {
  local dest="$1" want="$2" existing=""
  [ -e "$dest" ] && existing="$(sha256sum -- "$dest" | cut -d' ' -f1)"
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
    keep) say "$label $dest: identical, kept (set to $owner:$group $mode)" ;;
    replace) say "$label $dest: different; old copy kept as $dest.replaced-$TS (requires --replace-binary)" ;;
    refuse) say "$label $dest: differs from $want; refusing (pass --replace-binary to replace, old kept as a sidecar)" ;;
  esac
  if [ "$APPLY" = 1 ]; then
    case "$action" in
      install) install -o "$owner" -g "$group" -m "$mode" -- "$src" "$dest" ;;
      keep) chown "$owner:$group" -- "$dest"; chmod "$mode" -- "$dest" ;;
      replace) mv -- "$dest" "$dest.replaced-$TS"; install -o "$owner" -g "$group" -m "$mode" -- "$src" "$dest" ;;
      refuse) refuse "$label $dest differs; pass --replace-binary" ;;
    esac
  fi
}

row_account() {
  local name="$1" role="$2"
  if id -u -- "$name" >/dev/null 2>&1; then say "account $name ($role): exists, reused"; return; fi
  say "account $name ($role): missing; run: groupadd --system $name; useradd --system --gid $name --no-create-home --shell /usr/sbin/nologin $name"
  if [ "$APPLY" = 1 ]; then
    getent group -- "$name" >/dev/null || groupadd --system -- "$name"
    useradd --system --gid "$name" --no-create-home --shell /usr/sbin/nologin -- "$name"
  fi
}

row_group() {
  local name="$1"
  say "group $name: groupadd --system $name (if missing)"
  if [ "$APPLY" = 1 ]; then getent group -- "$name" >/dev/null || groupadd --system -- "$name"; fi
}

row_member() {
  local user="$1" group="$2"
  say "member: usermod -a -G $group $user"
  if [ "$APPLY" = 1 ]; then usermod -a -G "$group" -- "$user"; fi
}

row_dir() {
  local owner="$1" group="$2" mode="$3" path="$4"
  say "dir: install -d -o $owner -g $group -m $mode $path"
  if [ "$APPLY" = 1 ]; then install -d -o "$owner" -g "$group" -m "$mode" -- "$path"; fi
}

row_place_bun() {
  local owner="$1" group="$2" mode="$3" dest="$4"
  if [ -z "$BUN_BINARY" ]; then
    say "bun $dest: copy a Bun you already trust to $owner:$group $mode here (owner runs this step; no network install); pass --bun PATH --bun-sha256 HEX"
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
  say "deploy runtime (snapshot of $STAGE_SRC) -> $dst: copy owned $owner:$group (dirs 0755, files 0644), manifest verified, previous tree kept as $dst.previous-$TS"
  if [ "$APPLY" = 1 ]; then
    install -d -o "$owner" -g "$group" -m 0755 -- "$(dirname -- "$dst")"
    rm -rf -- "$new"
    cp -dR --preserve=timestamps,links --no-preserve=mode,ownership,xattr,context -- "$STAGE/runtime" "$new"
    chown -R -h "$owner:$group" -- "$new"
    find "$new" -type d -exec chmod 0755 {} +
    find "$new" -type f -exec chmod 0644 {} +
    if ! verify_tree "$new" "$STAGE/runtime-manifest.sha256" "$STAGE/runtime-symlinks.tsv"; then
      rm -rf -- "$new"
      refuse "copied runtime tree does not match the manifest"
    fi
    if [ -e "$dst" ]; then mv -- "$dst" "$dst.previous-$TS"; fi
    mv -- "$new" "$dst"
    install -o "$owner" -g "$group" -m 0644 -- "$STAGE/runtime-manifest.sha256" "$dst.manifest.sha256"
  fi
}

# The runtime account's name comes from the plan, never from a constant.
runtime_account_name() {
  local row; local -a F
  for row in "${PLAN_ROWS[@]}"; do IFS=$'\t' read -r -a F <<< "$row"; if [ "${F[0]}" = account ] && [ "${F[2]}" = runtime ]; then echo "${F[1]}"; return; fi; done
}
socket_group_name() {
  local row; local -a F
  for row in "${PLAN_ROWS[@]}"; do IFS=$'\t' read -r -a F <<< "$row"; if [ "${F[0]}" = group ]; then echo "${F[1]}"; return; fi; done
}

# Render a staged template into $3. Two substitutions, read at install: the runtime uid (`id -u`) and the
# socket group's gid (`getent group`, the group named in the staged plan). Root and non-numeric values are refused.
render_config() {
  local tmpl="$1" rt="$2" out="$3" uid="" gid="" sock=""
  cp -- "$STAGE/$tmpl" "$out"
  if grep -q '"__RUNTIME_UID__"' "$STAGE/$tmpl"; then
    uid="$(id -u -- "$rt")" || refuse "runtime account '$rt' does not exist; the account step must run first"
    [[ "$uid" =~ ^[1-9][0-9]{0,9}$ ]] || refuse "runtime account '$rt' has no usable uid (root and non-numeric are refused)"
    sed -i "s/\"__RUNTIME_UID__\"/$uid/g" "$out"
  fi
  if grep -q '"__SOCKET_GID__"' "$STAGE/$tmpl"; then
    sock="$(socket_group_name)"
    [ -n "$sock" ] || refuse "the staged plan names no socket group"
    gid="$(getent group -- "$sock" | cut -d: -f3)"
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
  new="$(mktemp "$SNAP/render.XXXXXX")"
  render_config "$tmpl" "$rt" "$new"
  if [ ! -e "$path" ]; then
    install -o "$owner" -g "$group" -m "$mode" -- "$new" "$path"
    say "config $path: rendered, $owner:$group $mode"
  elif cmp -s -- "$new" "$path"; then
    chown "$owner:$group" -- "$path"; chmod "$mode" -- "$path"
    say "config $path: identical, kept (set to $owner:$group $mode)"
  else
    install -o "$owner" -g "$group" -m "$mode" -- "$new" "$path.generated-$TS"
    SIDECARS=$((SIDECARS+1))
    say "config $path: authoritative and differs from this checkout; kept it, wrote $path.generated-$TS"
  fi
  rm -f -- "$new"
}

row_worlds() {
  local owner="$1" group="$2" dest="$3" src="$STAGE/$4" list
  list="$(cd -- "$src" && find . -name '*.sea' -not -path '*/validation/*' -not -path '*/__pycache__/*' | sed 's|^\./||' | sort)"
  say "worlds $dest: $(printf '%s\n' "$list" | grep -c .) .sea file(s) copied from the verified runtime domain, $owner:$group 0644"
  if [ "$APPLY" = 1 ]; then
    rm -rf -- "$dest"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      install -D -o "$owner" -g "$group" -m 0644 -- "$src/$f" "$dest/$f"
    done <<< "$list"
  fi
}

row_generated() {
  local owner="$1" group="$2" mode="$3" src="$4" dst="$5"
  if [ ! -e "$dst" ]; then say "generated $dst: install $owner:$group $mode"
  elif cmp -s -- "$STAGE/$src" "$dst"; then say "generated $dst: identical, kept (set to $owner:$group $mode)"
  else say "generated $dst: differs; old copy kept as $dst.generated-$TS"
  fi
  if [ "$APPLY" = 1 ]; then
    mkdir -p -- "$(dirname -- "$dst")"
    if [ -e "$dst" ] && ! cmp -s -- "$STAGE/$src" "$dst"; then mv -- "$dst" "$dst.generated-$TS"; fi
    install -o "$owner" -g "$group" -m "$mode" -- "$STAGE/$src" "$dst"
  fi
}

# Test seam (non-root only, never with --authorize-privileged): INSTALLER_TEST_MODE=1 --verify-only with
# INSTALLER_TEST_DEPLOY_DST=DIR runs the real deploy-tree copy and its post-copy verification into DIR, owned by the invoker.
if [ "$VERIFY" = 1 ]; then
  if [ "${INSTALLER_TEST_MODE:-}" = 1 ] && [ -n "${INSTALLER_TEST_DEPLOY_DST:-}" ] && [ "$(id -u)" != 0 ] && [ "$(id -ru)" != 0 ] && [ "${EUID:-1}" != 0 ]; then
    APPLY=1 row_deploy_tree "$(id -un)" "$(id -gn)" "$INSTALLER_TEST_DEPLOY_DST"
  fi
  echo "verify-only: ok; stage $STAGE_SRC digest $STAGE_DIGEST, runtime tree matches manifest and list, plan sources present. Nothing installed."
  exit 0
fi

# ---- checks (read-only; used by --check and as a precondition of --authorize-privileged) ------------
check_row_stat() {
  local owner="$1" group="$2" mode="$3" path="$4" want actual
  want="$owner:$group $(printf '%o' "$((8#$mode))")"
  if [ ! -e "$path" ]; then
    # A path under a directory this login cannot traverse looks missing. That is the containment working, not an absent file.
    # Only root can confirm it. Report it as unverified, not as a problem.
    # Walk up to the nearest ancestor this login can see. If that ancestor exists but is closed, the path is unverified.
    local ancestor; ancestor="$(dirname -- "$path")"
    while [ "$ancestor" != "/" ] && [ ! -e "$ancestor" ]; do ancestor="$(dirname -- "$ancestor")"; done
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
  for row in "${PLAN_ROWS[@]}"; do
    IFS=$'\t' read -r -a F <<< "$row"
    case "${F[0]}" in
      account) [ "${F[2]}" = gateway ] && gw="${F[1]}"; [ "${F[2]}" = runtime ] && rt="${F[1]}" ;;
      group) sock_group="${F[1]}" ;;
      socket) socket="${F[1]}" ;;
    esac
  done
  agent="$(id -un)"
  groups=" $(id -Gn "$agent") "
  echo "agent account (the login running this check): $agent"
  if [ -n "$sock_group" ] && [[ "$groups" == *" $sock_group "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in socket group $sock_group"; fi
  if [ -n "$gw" ] && [[ "$groups" == *" $gw "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in gateway group $gw"; fi
  if [ -n "$rt" ] && [[ "$groups" == *" $rt "* ]]; then fails=$((fails+1)); echo "  FAIL    agent is in runtime group $rt"; fi
  if [ "$agent" = "$gw" ] || [ "$agent" = "$rt" ]; then fails=$((fails+1)); echo "  FAIL    agent is a service account"; fi
  for row in "${PLAN_ROWS[@]}"; do
    IFS=$'\t' read -r -a F <<< "$row"
    case "${F[0]}" in
      account) id -u -- "${F[1]}" >/dev/null 2>&1 && echo "  ok      account ${F[1]} exists" || { fails=$((fails+1)); echo "  MISSING account ${F[1]}"; } ;;
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
        if (cd -- "${F[3]}" 2>/dev/null && sha256sum -c --quiet "${F[3]}.manifest.sha256" 2>/dev/null); then
          echo "  ok      runtime tree ${F[3]} matches its manifest"
        else fails=$((fails+1)); echo "  BAD     runtime tree ${F[3]} missing or not matching its manifest"; fi ;;
      socket)
        if [ "$(id -u)" = 0 ]; then echo "  note    agent socket open: not tested as root (root connects to any socket); run --check as the operator login to test it";
        elif ! [ -e "${F[1]}" ] && [[ "$(stat "${F[1]}" 2>&1 || true)" == *"Permission denied"* ]]; then echo "  ok      agent cannot reach the socket path (permission denied, expected)";
        elif [ -S "${F[1]}" ] && command -v python3 >/dev/null 2>&1; then
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
  done
  if [ "$fails" = 0 ]; then echo "check: ok"; return 0; fi
  echo "check: $fails problem(s)"; return 1
}

# ---- plan execution ---------------------------------------------------------------------------------
run_plan() {
  for row in "${PLAN_ROWS[@]}"; do
    IFS=$'\t' read -r -a F <<< "$row"
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
  done
}

if [ "$CHECK" = 1 ]; then
  echo "SEA-Forge gateway check (read-only); stage $STAGE_SRC, digest $STAGE_DIGEST"
  run_check
  exit $?
fi

echo "SEA-Forge gateway setup (mode: $MODE)"
echo "stage: $STAGE_SRC (verified from a private snapshot)"
echo "stage digest: $STAGE_DIGEST"
echo "binary: $BINARY_NOTE"
echo "bun: $BUN_NOTE"
if [ "$APPLY" = 1 ]; then echo "privileged plan:"; else echo "privileged plan (display only; root re-verifies the snapshot, digest and every plan row against its fixed table at apply time):"; fi

if [ "$APPLY" = 1 ]; then
  [ -n "$BINARY" ] || refuse "--binary and --sha256 are required with --authorize-privileged"
  [ -n "$BUN_BINARY" ] || refuse "--bun and --bun-sha256 are required with --authorize-privileged"
  # The operator who ran sudo must not become a gateway, runtime or socket-group member.
  invoker="${SUDO_USER:-root}"
  if [ "$invoker" != root ] && id -u -- "$invoker" >/dev/null 2>&1; then
    for row in "${PLAN_ROWS[@]}"; do
    IFS=$'\t' read -r -a F <<< "$row"
      if [ "${F[0]}" = account ] && [ "${F[1]}" = "$invoker" ]; then refuse "the invoking login '$invoker' is a service account in the plan"; fi
      if [ "${F[0]}" = group ] && id -nG "$invoker" | tr ' ' '\n' | grep -qx "${F[1]}"; then refuse "the invoking login '$invoker' is in the socket group ${F[1]}"; fi
    done
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
# Every interpolated value is %q-quoted; an empty value prints an angle-bracket placeholder the owner replaces.
qarg() { if [ -n "$2" ]; then printf '%s %q ' "$1" "$2"; else printf '%s <%s> ' "$1" "$3"; fi; }
printf '  sudo %q --authorize-privileged ' "$0"
qarg --stage "$STAGE_SRC" ""
qarg --binary "$BINARY_SRC" "path to sea-forge-server"
qarg --sha256 "$SHA256" "sha256"
qarg --bun "$BUN_SRC" "path to a trusted bun"
qarg --bun-sha256 "$BUN_SHA256" "sha256 of bun"
qarg --expect-stage-sha256 "$STAGE_DIGEST" ""
printf '\n'
echo "the installer renders server.yaml (runtime uid from id -u) and places policy.yaml in the gateway root; --check verifies them."
