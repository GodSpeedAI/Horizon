import { readFileSync } from "node:fs";
const k = readFileSync("/home/sprime01/.horizon/setups/testing/secrets/workbench.key", "utf8").slice(0, 12);
const p = readFileSync("/home/sprime01/.horizon/setups/testing/secrets/presenting.key").subarray(0, 8).toString("hex");
for (const path of ["/desk", "/desk/state.json", "/desk/panels/op", "/desk/search?q=key", "/workspace/compare", "/desk/draft"]) {
  const r = await fetch("http://127.0.0.1:4339" + path); const t = await r.text();
  console.log(path, r.status, "workshop key:", t.includes(k) ? "FOUND" : "0", "presenting key hex:", t.includes(p) ? "FOUND" : "0");
}
