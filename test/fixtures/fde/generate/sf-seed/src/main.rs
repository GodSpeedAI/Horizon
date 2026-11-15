//! usage: sf-seed <contracts/fde dir> <out dir>
//! Drives the producer's own `append` (unmodified case_records.rs) over the
//! contract's valid request fixtures and copies the resulting case directories.
#![allow(dead_code)]
mod sfwp {
    #[path = "/home/sprime01/projects/_wt/fde-sea-rs-integration/crates/sea-forge-server/src/sfwp/case_records.rs"]
    pub mod case_records;
    #[path = "/home/sprime01/projects/_wt/fde-sea-rs-integration/crates/sea-forge-server/src/sfwp/interaction_events.rs"]
    pub mod interaction_events;
}
use serde_json::{json, Value};
use sfwp::case_records::*;
use std::fs;
use std::path::{Path, PathBuf};

struct Published(Value);
impl AnchorPublisher for Published {
    fn publish(&self, _: &str, _: &str, _: &str) -> Result<Value, String> { Ok(self.0.clone()) }
}

fn rd(p: PathBuf) -> Value { serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap() }

fn rt_register_for(root: &Path, request: &Value) {
    let refs = &request["payload"]["realitytrace_refs"];
    let mut ids: Vec<String> = vec![refs["plan_id"].as_str().unwrap().into()];
    for f in ["question_ids", "threshold_ids"] {
        ids.extend(refs[f].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()));
    }
    let dir = root.join("realitytrace");
    fs::create_dir_all(&dir).unwrap();
    let text: String = ids.iter().map(|i| format!("{}\n", json!({"record_id": i}))).collect();
    fs::write(dir.join("records.jsonl"), text).unwrap();
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let fx = PathBuf::from(&a[1]).join("fixtures/case-record-append/valid");
    let out = PathBuf::from(&a[2]);
    // (name, frozen fixture, settled fixture, anchor push time)
    let scenarios = [
        ("evaluated-settled", "request-episode-frozen.json", Some("request-episode-settled.json"), Some("2026-11-12T09:00:00Z")),
        ("evaluated-frozen-anchor-pending", "request-episode-frozen.json", None, None),
        ("exploratory-settled-unresolved", "request-episode-frozen-exploratory.json", Some("request-episode-settled-exploratory-unresolved.json"), Some("2026-11-12T09:00:00Z")),
    ];
    for (name, frozen, settled, push) in scenarios {
        let root = out.join(name);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("cases/case-0001")).unwrap();
        fs::write(root.join("cases/case-0001/case.json"), "{}").unwrap();
        let req = rd(fx.join(frozen));
        rt_register_for(&root, &req);
        let idx = FileIndex(root.clone());
        let publisher = push.map(|t| Published(json!({"server_push_time": t, "receipt_id": "r-1"})));
        let chain = vec!["case-keeper".to_string()];
        let ctx = AppendContext {
            root: &root, case_id: "case-0001", principal: "case-keeper", role: "operator", chain: &chain, rt: &idx,
            anchor: publisher.as_ref().map(|p| p as &dyn AnchorPublisher),
        };
        let r = append(&ctx, &req);
        assert_eq!(r["outcome"], "recorded", "{r}");
        let item = req["payload"]["reference"]["body"]["plan_item_id"].as_str().unwrap();
        fs::write(root.join("cases/case-0001/case-events.jsonl"), format!("{}\n",
            json!({"event_id": "ev-1", "plan_item_id": item, "actor_id": "agent:builder-01", "kind": "command_started", "timestamp": "2026-11-12T10:00:00Z"}))).unwrap();
        if let Some(s) = settled {
            let chain = vec!["verifier-1".to_string()];
            let ctx = AppendContext { root: &root, case_id: "case-0001", principal: "verifier-1", role: "operator", chain: &chain, rt: &idx, anchor: None };
            let r = append(&ctx, &rd(fx.join(s)));
            assert_eq!(r["outcome"], "recorded", "{r}");
        }
        println!("{name} ok");
    }
}
