import { launch, OUT } from "./lib.ts";
const b = await launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("file:///home/sprime01/projects/Horizon/.tmp/sandbox/godspeed_terminal_v3.html"); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/mock.png` }); await b.close();
