#!/usr/bin/env python3
"""Validate a Project Topology Architect plugin layout.

Usage:
  validate-plugin.py <plugin-root> [--fixture-root <dir>]

Checks (structural, deterministic):
  - .claude-plugin/plugin.json exists, parses, name is kebab-case, skills paths exist
  - skills/ contains skill dirs; each has SKILL.md with frontmatter name + description
  - skill names are kebab-case; exactly one primary skill (project-topology-architect)
  - no competing root-level SKILL.md reports the primary name as its own name
  - no stale icm-architect activation references in active plugin files
  - no hardcoded machine-specific absolute paths in active plugin markdown
  - relative links inside SKILL.md bodies resolve to real files

Exit: 0 if no errors; 1 on any error; warnings do not fail.
"""

import argparse
import json
import os
import re
import sys

ERRORS = []
WARNINGS = []


def err(msg):
    ERRORS.append(msg)
    sys.stderr.write(f"ERROR: {msg}\n")


def warn(msg):
    WARNINGS.append(msg)
    sys.stderr.write(f"WARN:  {msg}\n")


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def frontmatter(body):
    if not body.startswith("---\n"):
        return None
    end = body.find("\n---", 4)
    if end == -1:
        return None
    block = body[4:end]
    try:
        import yaml

        return yaml.safe_load(block), block
    except ImportError:
        # Fallback minimal parse: name/description lines are enough for structure.
        fm = {"name": None, "description": None}
        for line in block.splitlines():
            if line.startswith("name:"):
                fm["name"] = line.split(":", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("description:"):
                fm["description"] = line.split(":", 1)[1].strip()
        return fm, block


def kebab(s):
    return bool(s) and re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", s) is not None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--fixture-root", action="append", default=[])
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    manifest = os.path.join(root, ".claude-plugin", "plugin.json")
    skills_dir = os.path.join(root, "skills")

    # ---- manifest ----
    if not os.path.isfile(manifest):
        err("missing .claude-plugin/plugin.json")
    else:
        try:
            cfg = json.loads(read(manifest))
        except ValueError as e:
            err(f"plugin.json invalid JSON: {e}")
            cfg = {}
        if "name" not in cfg:
            err("plugin.json has no name")
        else:
            if not kebab(cfg["name"]):
                err(f"plugin name not kebab-case: {cfg['name']!r}")
            for extra in cfg.get("skills", []):
                resolved_extra = os.path.normpath(os.path.join(root, extra))
                if not os.path.isdir(resolved_extra):
                    err(f"plugin.json skills path does not exist: {extra}")

    # ---- skills ----
    if not os.path.isdir(skills_dir):
        err("missing skills/ directory")
        skills = []
    else:
        skills = sorted(
            d
            for d in os.listdir(skills_dir)
            if os.path.isdir(os.path.join(skills_dir, d))
        )
        if not skills:
            err("skills/ contains no skill directories")

    names = []
    for name in skills:
        if not kebab(name):
            warn(f"skill directory not kebab-case: {name}")
        skill_dir = os.path.join(skills_dir, name)
        skill_file = os.path.join(skill_dir, "SKILL.md")
        if not os.path.isfile(skill_file):
            err(f"skill {name}: missing SKILL.md")
            continue
        body = read(skill_file)
        fm, _ = frontmatter(body)
        if not fm:
            err(f"skill {name}: SKILL.md has no valid frontmatter")
            continue
        if not fm.get("name"):
            err(f"skill {name}: frontmatter missing name")
        else:
            names.append(fm["name"])
        if not fm.get("description"):
            err(f"skill {name}: frontmatter missing description")
        # description must trigger-identify the capability
        if isinstance(fm.get("description"), str) and len(fm["description"]) < 40:
            warn(f"skill {name}: description is terse (<40 chars) for auto-activation")

        # relative links inside SKILL.md must resolve
        for target in re.findall(r"\]\(([^)#]+\.(?:md|py))\)", body):
            if target.startswith(("http://", "https://")):
                continue
            path = os.path.normpath(os.path.join(skill_dir, target))
            if not os.path.exists(path):
                err(f"skill {name}: SKILL.md link does not resolve: {target}")

        # portable-path scan
        for found in re.findall(r"/home/\S+|/mnt/c/\S+|/Users/\S+", body):
            err(f"skill {name}: hardcoded machine path in SKILL.md: {found}")

    primaries = [n for n in names if n == "project-topology-architect"]
    if len(primaries) != 1:
        err(f"expected exactly one primary skill; found {primaries!r}")
    for n in names:
        if names.count(n) > 1:
            err(f"duplicate skill name: {n}")

    # ---- competing root SKILL.md ----
    root_skill = os.path.join(root, "SKILL.md")
    if os.path.isfile(root_skill):
        fm, _ = frontmatter(read(root_skill))
        if fm and fm.get("name") == "project-topology-architect":
            err("root SKILL.md declares the primary name; move it under skills/")
        else:
            warn("root SKILL.md exists; ensure it is not an accidental primary skill")

    # ---- stale icm-architect activation references (active plugin files only) ----
    # Only the plugin's distributable surfaces are "active" for this scan.
    # Mission docs (.tmp/), local tool state (.serena/), and the generated
    # workbench (.agents/) are out of scope for plugin-layout validation; the
    # substrate-level checks (scaffold-check.py) cover the workbench instead.
    active_roots = [
        os.path.join(root, ".claude-plugin"),
        os.path.join(root, "skills"),
    ]
    skip_dirs = {"assets", ".git"}
    def walk_active():
        for base in active_roots:
            if not os.path.isdir(base):
                continue
            for dirpath, dirnames, filenames in os.walk(base):
                dirnames[:] = [d for d in dirnames if d not in skip_dirs]
                for fn in filenames:
                    if fn.endswith((".md", ".json", ".yaml", ".yml", ".toml")):
                        yield os.path.join(dirpath, fn)

    for path in walk_active():
        if ".claude-plugin" in path and path.endswith("plugin.json"):
            if cfgs := json.loads(read(path)).get("name"):
                if cfgs == "icm-architect":
                    err("plugin.json name is stale icm-architect")
            continue
        text = read(path)
        parsed = frontmatter(text)
        fm = parsed[0] if parsed else None
        if fm and fm.get("name") == "icm-architect":
            err(f"stale activation name in {path}: icm-architect")
        # reject hardcoded machine-specific absolute paths in active prose
        for found in re.findall(r"/home/sprime01|\bprojects/sxr\b", text):
            err(f"hardcoded local machine reference in {path}: {found}")

    # ---- fixture roots ----
    for fr in args.fixture_root:
        fr_abs = os.path.abspath(fr)
        if not os.path.isdir(fr_abs):
            err(f"fixture root missing: {fr_abs}")

    print(f"validate-plugin: {len(ERRORS)} error(s), {len(WARNINGS)} warning(s)")
    print(f"plugin root: {root}")
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())