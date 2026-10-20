import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApplication } from "../src/app.ts";
import { bindingContextOf, projectFrame } from "../src/ui/surface.ts";
import { RESEARCH_COMMAND, horizonDocument, writeConfig } from "./support/config.ts";

/*
 * AC-CASE-002-01 and AC-NAV-005-01 have no witness here (candidate revision 3, verdict r2 F3).
 * Revision 2 bound them to two helpers no application code called: one picked the first
 * *available* choice and labelled it a response to any deviation, the other resolved
 * references in a frame without observing a controller decide whether to ask. Neither
 * observed its requirement. Both contracts stay faithful and their proof stays open until
 * T07 implements the navigation controller; an open binding is preferable to a false one.
 */

/**
 * AC-CONFIG-004-01 (candidate contract T04-CR-001), PARTIAL witness. The contract restates
 * REQ-CONFIG-004: "Configured provider endpoints, credentials, timeouts and scope MUST remain
 * below stable behavior contracts."
 *
 * What this witness observes: the one configured provider Horizon has today is the research
 * subsystem, reached through `research_command`. Two applications are built from two
 * `horizon.toml` files whose research provider endpoint differs (relative versus absolute
 * project path), both read back from the configuration the application loaded; the typed
 * choices, committed intent operations and surface blocks are identical.
 *
 * What it does not observe (DEBT D-019): provider credentials, timeouts and scope. No
 * provider in `HorizonConfig` declares any of them, so there is nothing to vary. Horizon's
 * own listening address and launch-secret path are not provider configuration and are not
 * claimed as such.
 */
describe("AC-CONFIG-004-01 a configured provider endpoint stays below stable behavior contracts (partial)", () => {
  async function observe(researchCommand: readonly string[]) {
    const root = mkdtempSync(join(tmpdir(), "horizon-acceptance-"));
    const document = horizonDocument({
      storePath: join(root, "app.sqlite"),
      secretPath: join(root, "launch.secret"),
      researchCommand,
    });
    const configPath = await writeConfig(join(root, "horizon.toml"), document);
    const app = await createApplication({ configPath });
    try {
      const commit = await app.commitNavigationIntent({ operationRef: "horizon.health" });
      const current = app.frames.current()!;
      return {
        choices: current.choices,
        committed: { operation_ref: commit.intent.operation_ref, frame_revision: commit.intent.frame_revision },
        // The projected view is compared, not the raw composition: the view is what every
        // transport presents, so it is the stable contract an endpoint change must not reach.
        surface: projectFrame(current, bindingContextOf({ root: process.cwd() })),
        world_ref: current.world_ref,
        research: app.research.status,
        // Read back from the configuration the application actually loaded.
        loadedProvider: app.loaded.config.research_command,
      };
    } finally {
      await app.close();
    }
  }

  test("typed choices, committed intent and surface blocks are unchanged when the research provider endpoint differs", async () => {
    const relative = [...RESEARCH_COMMAND];
    const absolute = RESEARCH_COMMAND.map((part) => (part === "research" ? resolve("research") : part));
    const first = await observe(relative);
    const second = await observe(absolute);

    // The two provider configurations differ, on the field the research adapter executes,
    // and both reach a healthy provider (otherwise the comparison would be between failures).
    expect(second.loadedProvider).not.toEqual(first.loadedProvider);
    expect(first.research).toBe("ok");
    expect(second.research).toBe("ok");

    // The stable behavior contracts do not depend on the difference.
    expect(second.world_ref).toBe(first.world_ref);
    expect(second.choices).toEqual(first.choices);
    expect(second.committed).toEqual(first.committed);
    expect(second.surface).toEqual(first.surface);
  }, 60_000);
});
