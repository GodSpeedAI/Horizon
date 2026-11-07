/**
 * Builds the desk bundle: `src/ui/desk/client/main.tsx` -> `dist/desk/app.js`, and the Astryx stylesheets plus the desk's own
 * -> `dist/desk/app.css`. The Cognate React and Astryx packages ship source, so they are bundled here, not reused prebuilt.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stylesheetPaths } from "@godspeedai/cognate-ui-astryx/styles";

const root = join(import.meta.dir, "..");

export async function buildDesk(outdir: string = join(root, "dist", "desk")): Promise<{ readonly js: string; readonly css: string }> {
  mkdirSync(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(root, "src/ui/desk/client/main.tsx")],
    outdir,
    naming: "app.js",
    target: "browser",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) throw new Error(`desk bundle failed: ${result.logs.map((l) => l.message).join("; ")}`);
  const css = [...stylesheetPaths(), join(root, "src/ui/desk/desk.css"), join(root, "src/ui/desk/blocks/blocks.css")].map((path) => readFileSync(path, "utf8")).join("\n");
  writeFileSync(join(outdir, "app.css"), css);
  return { js: join(outdir, "app.js"), css: join(outdir, "app.css") };
}

if (import.meta.main) {
  const built = await buildDesk();
  console.log(`built ${built.js} and ${built.css}`);
}
