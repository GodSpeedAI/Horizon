#!/usr/bin/env python3
"""Generate RealityTrace fixtures with the REAL `realitytrace` binary (observed ingest/derive/compare).
Mirrors sxr-cli/tests/compare.rs::setup (WP-17). Usage: gen-rt.py <realitytrace-bin> <rt-seed-bin> <out-dir>"""
import json, hashlib, os, subprocess, sys, tempfile, shutil

RT, SEED, OUT = sys.argv[1:4]
F = "concept:6ba7b810-9dad-51d1-80b4-00c04fd430c8"
M = "concept:6ba7b811-9dad-51d1-80b4-00c04fd430c8"
U = "concept:6ba7b814-9dad-51d1-80b4-00c04fd430c8"
C = "concept:6ba7b813-9dad-51d1-80b4-00c04fd430c8"
WORLD = "world:sop@sha256:" + hashlib.sha256(b"fde-s1-fixture-world").hexdigest()

def canon(v): return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
def sha(v): return hashlib.sha256(canon(v).encode()).hexdigest()

def profile():
    def entry(kind, comparison, extra):
        m = {"true": "confirmed", "false": "contradicted", "unknown": "insufficient"}; m.update(extra)
        return {"kind": kind, "comparison": comparison, "quantifier": "universal", "min_support": 1,
                "allow_vacuous_truth": False, "deadline": None, "class_mapping": m}
    return {"contract": "comparison-profile.v1", "profile_id": "profile:s1", "kinds": [
        entry("policy_evaluable", "episode", {}), entry("structural", "structural", {"undeclared": "observed_undeclared"})]}

def ev(ep, rid, seq, key, op, res):
    return {"envelope_kind": "execution_trace", "extensions": {"godspeed.interaction_event": {
        "world_ref": WORLD, "semantic_ref": "sop::Element", "declaration_key": key,
        "actor": {"principal": "p1", "role": "clerk"}, "operation": op, "resource": res,
        "context": {"case_id": "case1", "plan_item_id": "step1", "episode_ref": ep},
        "correlation": {"case_id": "case1"}, "authority": {"decision_id": "not_required"},
        "outcome": {"status": "succeeded"},
        "source": {"system": "sea-forge", "record_id": rid, "sequence": seq, "recorded_at": "2026-11-14T10:00:00Z"},
        "executor_provenance": "program", "kind": "evaluated", "expectation_refs": ["question:q1"]}}}

SCEN = {
  # name: (events, silent_source_dependency, anchored_tail)
  "confirmed-undeclared-unverified-tail": ([("r1",1,F,"freeze","case1"),("r2",2,M,"move","case1"),("r3",3,U,"purge","case1")], False, False),
  "confirmed-undeclared-verified-tail":   ([("r1",1,F,"freeze","case1"),("r2",2,M,"move","case1"),("r3",3,U,"purge","case1")], False, True),
  "contradicted":                         ([("r1",1,M,"move","case1"),("r2",2,F,"freeze","case1")], False, False),
  "insufficient-silent-source":           ([("r1",1,F,"freeze","case1"),("r2",2,M,"move","case1")], True, False),
}

def run(env, *a, check=True):
    p = subprocess.run(a, env=env, capture_output=True, text=True)
    if check and p.returncode != 0: sys.exit(f"FAILED {a}: {p.stderr}")
    return p

for name, (events, silent, anchored) in SCEN.items():
    tmp = tempfile.mkdtemp(dir=os.environ.get("TMPDIR"))
    env = dict(os.environ, XDG_DATA_HOME=tmp+"/data", XDG_STATE_HOME=tmp+"/state")
    for k in ("SXR_DAEMON_SOCKET","REALITYTRACE_DOMAINFORGE_BIN","SXR_DOMAINFORGE_BIN"): env.pop(k, None)
    repo = tmp+"/repo"; os.makedirs(repo); open(repo+"/README","w").write("fixture\n")
    for g in (["init","-q"],["add","-A"],["-c","user.email=t@t","-c","user.name=t","commit","-qm","init"]):
        subprocess.run(["git"]+g, cwd=repo, check=True, capture_output=True)
    rid = json.loads(run(env, RT, "repo", "enroll", repo, "--json").stdout)["repo_id"]
    db = f"{tmp}/data/sxr/repos/{rid}/ledger.db"
    p = profile()
    srcs = [{"source_id": "src-sf", "system": "sea-forge", "purpose": "p"}]
    if silent: srcs.append({"source_id": "src-ghost", "system": "ghost-system", "purpose": "p"})
    body = {"case_id": "case1", "plan_item_id": "step1", "n": 1, "world_ref": WORLD, "kind": "evaluated",
            "executor_provenance": "program",
            "criteria": {"intention": "i", "expected_change": "c", "invariants": [], "predicted_irrelevancies": [],
                         "success_region": "s", "failure_region": "f", "falsifiers": ["x"]},
            "comparison_profile": {"id": "profile:s1", "sha256": sha(p)},
            "decision_maker": {"principal": "p", "role": "r"}, "evidence_sources": srcs,
            "coverage_manifest": [{"emitter": "sea-forge", "event_kinds": ["move"]}]}
    episode = f"episode:case1:step1:1@sha256:{sha(body)}"
    d = f"{OUT}/{name}"; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    json.dump({"episode_ref": episode, "body": body}, open(d+"/reference.json","w"), indent=1)
    json.dump(p, open(d+"/profile.json","w"), indent=1)
    run(env, SEED, db, rid, *[e[0] for e in events])
    nd = "\n".join(canon(ev(episode, r, s, k, o, res)) for r, s, k, o, res in events)
    open(tmp+"/events.ndjson","w").write(nd)
    run(env, RT, "observed", "ingest", "--repo", rid, "--file", tmp+"/events.ndjson")
    json.dump([F, M, C], open(tmp+"/declared.json","w"))
    ex = {"id": "flow", "kind": "structural", "relation": "flow", "ref": "FrozenExpectation", "from": F, "to": M, "question": "question:q1"}
    if silent: ex["evidence_sources"] = ["src-ghost"]
    mapping = {"contract": "compare-mapping.v1", "undeclared_question": "question:q1", "operations": {}, "expectations": [ex]}
    json.dump(mapping, open(d+"/mapping.json","w"), indent=1)
    run(env, RT, "observed", "derive", "--repo", rid, "--world", WORLD, "--scope", "case:case1", "--episode", episode,
        "--kind", "evaluated", "--profile", "profile:s1", "--independent-system", "sea-forge",
        "--declared", tmp+"/declared.json", "--out", d+"/observed.json")
    cmp = ["observed","compare","--repo",rid,"--observed",d+"/observed.json","--reference",d+"/reference.json",
           "--profile",d+"/profile.json","--mapping",d+"/mapping.json","--world",WORLD,"--declared","snapshot:sop-1"]
    if anchored:
        w = json.load(open(d+"/observed.json"))["window"]
        cmp += ["--expected-head", w["head_entry_hash"], "--expected-record-count", str(w["record_count"])]
    r = run(env, RT, *cmp)
    open(d+"/compare.json","w").write(r.stdout)
    print(name, "ok")
    shutil.rmtree(tmp)
