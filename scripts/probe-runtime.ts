import { loadConfig } from "../src/config/load.ts";
import { assertStoreBoundary } from "../src/runtime/create.ts";

const storeArg = process.argv.indexOf("--store");
const store = storeArg >= 0 ? process.argv[storeArg + 1] ?? ":memory:" : ":memory:";
const loaded = loadConfig();
assertStoreBoundary(loaded.config, store);
console.log(`runtime-probe: accepted ${store}`);
