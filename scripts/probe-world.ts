import { loadWorld } from "../src/adapters/semantic.ts";

const refArg = process.argv.indexOf("--world-ref");
const pinned = refArg >= 0 ? process.argv[refArg + 1] ?? "" : "world:horizon@sha256:0000000000000000000000000000000000000000000000000000000000000000";
const world = loadWorld(pinned);
console.log(`world-probe: accepted ${world.worldRef}`);
