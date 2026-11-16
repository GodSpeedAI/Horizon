#!/usr/bin/env python3
"""Release qualification for Horizon (WP-68). Standard library only.

  assemble  Collect the per-platform build artifacts and qualification records of ONE release run, refuse any record whose
            commit is not the tag commit, name released assets (QUALIFIED platforms drop "unqualified"), and write
            SHA256SUMS, per-platform SHA256SUMS.<platform>, qualification.json and QUALIFICATION.md.
  promote   Re-validate the qualification records attached to a PUBLISHED release (including real-hardware evidence added
            after publication) against the release's own SHA256SUMS, and write the regenerated qualification.json,
            QUALIFICATION.md and the notes block.
  notes     Print the readiness block for the release notes from a qualification.json.

A release is READY only when every platform claimed in scripts/qualification-platforms.json is QUALIFIED. A platform with no
record is NOT QUALIFIED. Exit 1 on any validation failure; the message names the offending record.
"""
import argparse
import glob
import hashlib
import json
import os
import shutil
import sys

RECORD_SCHEMA = "horizon.qualification/1"
SUMMARY_SCHEMA = "horizon.release-qualification/1"
BEGIN, END = "<!-- readiness:begin -->", "<!-- readiness:end -->"
ATTESTED_MARK = "<!-- provenance:attested -->"


def released_name(name):
    """The released spelling of an artifact name (the 'unqualified' label dropped). Used to compare either spelling."""
    return name.replace("horizon-desktop-unqualified_", "horizon-desktop_").replace("horizon-headless-unqualified-", "horizon-headless-")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_sums(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            out[parts[1].lstrip("*")] = parts[0].lower()
    return out


def load_platforms(path):
    return json.load(open(path, encoding="utf-8"))["platforms"]


def load_records(directory):
    """Every horizon.qualification/1 JSON under directory, keyed by platform. Duplicate platforms are an error."""
    records, errors = {}, []
    for path in sorted(glob.glob(os.path.join(directory, "**", "*.json"), recursive=True)):
        try:
            rec = json.load(open(path, encoding="utf-8"))
        except ValueError as e:
            errors.append(f"{path}: not JSON ({e})")
            continue
        if not isinstance(rec, dict) or rec.get("schema") != RECORD_SCHEMA:
            continue  # not a qualification record (for example an aggregate): ignore
        plat = rec.get("platform")
        if plat in records:
            errors.append(f"{path}: second record for platform {plat}")
            continue
        rec["_path"] = path
        records[plat] = rec
    return records, errors


def build_platform(cfg):
    """The platform whose build a record qualifies: real-hardware rows qualify another platform's released assets."""
    return cfg.get("build_platform", cfg["id"])


def validate_record(rec, platforms, commit, expected=None):
    """Return a list of problems with one record (empty = acceptable evidence for this commit).

    expected: {released name: sha256} of the assets the record's platform must have qualified (None skips the artifact check).
    """
    problems = []
    where = rec["_path"]
    cfg = next((p for p in platforms if p["id"] == rec.get("platform")), None)
    if cfg is None:
        return [f"{where}: unknown platform {rec.get('platform')!r}"]
    if rec.get("commit") != commit:
        problems.append(f"{where}: record commit {rec.get('commit')!r} is not the release commit {commit}")
    if cfg["id"].endswith("-jetson") and rec.get("host", {}).get("real_hardware") is not True:
        problems.append(f"{where}: {cfg['id']} needs host.real_hardware == true")
    by = {s.get("name"): s.get("status") for s in rec.get("steps", [])}
    if rec.get("status") == "QUALIFIED":
        bad = [r for r in cfg.get("required_steps", []) if by.get(r) != "PASS"]
        if bad or "FAIL" in by.values():
            problems.append(f"{where}: status QUALIFIED but required steps {bad or '[]'} did not PASS or a step FAILed")
    if expected is not None:
        got = {released_name(a.get("name", "")): str(a.get("sha256", "")).lower() for a in rec.get("artifacts") or []}
        if not got:
            problems.append(f"{where}: record lists no artifacts")
        for name in sorted(set(got) ^ set(expected)):
            problems.append(f"{where}: artifact {name} is {'not part of' if name in got else 'missing from'} the {build_platform(cfg)} release assets")
        for name in sorted(set(got) & set(expected)):
            if got[name] != expected[name]:
                problems.append(f"{where}: artifact {name} sha256 differs from the release")
    return problems


def reasons(rec):
    """Why a record is not QUALIFIED: failed steps and required steps that did not pass."""
    required = set(rec.get("required_steps", []))
    out = []
    for s in rec.get("steps", []):
        if s["status"] == "FAIL" or (s["name"] in required and s["status"] != "PASS"):
            out.append(f"{s['name']} {s['status']}: {s.get('reason', '')}".strip().rstrip(":"))
    return out


def summarize(platforms, records, tag, commit):
    rows = []
    for p in platforms:
        if not p.get("claimed", True):
            continue
        rec = records.get(p["id"])
        if rec is None:
            status, why = "NOT QUALIFIED", ["no qualification record"]
            if p["id"].endswith("-jetson"):
                why = ["no real-hardware record yet (docs/how-to/release.md)"]
        else:
            status = rec["status"]
            why = [] if status == "QUALIFIED" else (reasons(rec) or [f"record status {status}"])
        rows.append({"id": p["id"], "label": p["label"], "status": status, "reasons": why})
    ready = bool(rows) and all(r["status"] == "QUALIFIED" for r in rows)
    return {"schema": SUMMARY_SCHEMA, "tag": tag, "commit": commit, "release_ready": ready, "platforms": rows}


def cell(text):
    return text.replace("|", "\\|").replace("\n", " ")[:300]


def table(summary):
    lines = ["| Platform | Status | NOT_RUN / FAIL reasons |", "|---|---|---|"]
    for r in summary["platforms"]:
        lines.append(f"| {cell(r['label'])} (`{r['id']}`) | {r['status']} | {cell('; '.join(r['reasons'])) or '-'} |")
    return "\n".join(lines)


def render_md(summary):
    head = "READY: every claimed platform is QUALIFIED." if summary["release_ready"] else "NOT READY: this release is a prerelease until every claimed platform is QUALIFIED."
    return (f"# Qualification: {summary['tag']}\n\nCommit `{summary['commit']}`. {head}\n\n{table(summary)}\n\n"
            "A platform is QUALIFIED only when every required step PASSed in a record made for this exact commit "
            "(docs/how-to/qualify-desktop-install.md). Upgrade is NOT_RUN: no previous release exists.\n")


def notes_block(summary, attested):
    head = "Every claimed platform is QUALIFIED." if summary["release_ready"] else "PRERELEASE: not every claimed platform is QUALIFIED yet."
    return "\n".join([BEGIN, "## Qualification", "", head, "", table(summary), END] + ([ATTESTED_MARK] if attested else []))


def write_summary(summary, out_json, out_md):
    for path in (out_json, out_md):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    json.dump(summary, open(out_json, "w", encoding="utf-8"), indent=2)
    open(out_md, "w", encoding="utf-8").write(render_md(summary))


def die(problems):
    for p in problems:
        print(f"::error::{p}")
    sys.exit(1)


def cmd_assemble(a):
    platforms = load_platforms(a.platforms)
    records, problems = load_records(a.records)
    for rec in records.values():
        problems += validate_record(rec, platforms, a.commit)
    summary = summarize(platforms, records, a.tag, a.commit)
    status = {r["id"]: r["status"] for r in summary["platforms"]}
    os.makedirs(a.out, exist_ok=True)
    all_sums, per_platform = [], {}
    for p in platforms:
        src = os.path.join(a.dist, f"horizon-unqualified-{p['id']}")
        if not os.path.isdir(src):
            continue  # real-hardware-only platforms have no build of their own
        rec = records.get(p["id"])
        if rec is None:
            problems.append(f"no qualification record for built platform {p['id']}")
            continue
        recorded = {a_["name"]: a_["sha256"].lower() for a_ in rec.get("artifacts", [])}
        qualified = status.get(p["id"]) == "QUALIFIED"
        plat_sums = []
        for name in sorted(os.listdir(src)):
            if name == "SHA256SUMS":
                continue
            path = os.path.join(src, name)
            digest = sha256(path)
            if recorded.get(name) != digest:
                problems.append(f"{p['id']}: {name} is not the artifact the qualification record qualified")
                continue
            final = released_name(name) if qualified else name
            if os.path.exists(os.path.join(a.out, final)):
                problems.append(f"{final}: two platforms produce the same asset name")
                continue
            shutil.copyfile(path, os.path.join(a.out, final))
            plat_sums.append(f"{digest}  {final}")
            per_platform.setdefault(p["id"], {})[released_name(final)] = digest
        open(os.path.join(a.out, f"SHA256SUMS.{p['id']}"), "w", encoding="utf-8").write("\n".join(plat_sums) + "\n")
        all_sums += plat_sums
    # Every accepted record is kept, including real-hardware ones that have no build directory of their own.
    for pid, rec in records.items():
        cfg = next((p for p in platforms if p["id"] == pid), None)
        if cfg is not None:
            problems += validate_record(rec, platforms, a.commit, per_platform.get(build_platform(cfg), {}))
        shutil.copyfile(rec["_path"], os.path.join(a.out, f"qualification-{pid}.json"))
    if problems:
        die(sorted(set(problems)))
    open(os.path.join(a.out, "SHA256SUMS"), "w", encoding="utf-8").write("\n".join(sorted(all_sums, key=lambda l: l.split("  ", 1)[1])) + "\n")
    write_summary(summary, os.path.join(a.out, "qualification.json"), os.path.join(a.out, "QUALIFICATION.md"))
    print(json.dumps({"release_ready": summary["release_ready"]}))


def cmd_promote(a):
    platforms = load_platforms(a.platforms)
    records, problems = load_records(a.records)
    for rec in records.values():
        cfg = next((p for p in platforms if p["id"] == rec.get("platform")), None)
        expected = None
        if cfg is not None:
            sums_file = os.path.join(a.sums_dir, f"SHA256SUMS.{build_platform(cfg)}")
            if not os.path.isfile(sums_file):
                problems.append(f"{rec['_path']}: the release has no {os.path.basename(sums_file)}")
                continue
            expected = {released_name(k): v for k, v in parse_sums(sums_file).items()}
        problems += validate_record(rec, platforms, a.commit, expected)
    if problems:
        die(problems)
    summary = summarize(platforms, records, a.tag, a.commit)
    write_summary(summary, a.out_json, a.out_md)
    print(json.dumps({"release_ready": summary["release_ready"]}))


def cmd_notes(a):
    print(notes_block(json.load(open(a.json, encoding="utf-8")), a.attested == "true"))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("assemble")
    s.add_argument("--platforms", required=True)
    s.add_argument("--dist", required=True)
    s.add_argument("--records", required=True)
    s.add_argument("--commit", required=True)
    s.add_argument("--tag", required=True)
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_assemble)
    s = sub.add_parser("promote")
    s.add_argument("--platforms", required=True)
    s.add_argument("--records", required=True)
    s.add_argument("--sums-dir", required=True, help="directory holding the release's SHA256SUMS.<platform> files")
    s.add_argument("--commit", required=True)
    s.add_argument("--tag", required=True)
    s.add_argument("--out-json", required=True)
    s.add_argument("--out-md", required=True)
    s.set_defaults(fn=cmd_promote)
    s = sub.add_parser("notes")
    s.add_argument("--json", required=True)
    s.add_argument("--attested", default="false")
    s.set_defaults(fn=cmd_notes)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
