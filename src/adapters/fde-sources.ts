/** Where the FDE sources live and how they are read (Node only: touches the filesystem, read-only). */
import { readCaseRecords, readRealityTrace, readWorldPin } from "./fde-read.ts";
import type { SourceRead } from "./fde-types.ts";
import type { FdeSources } from "./fde-view.ts";

/** Where each source lives. An unset path is a source that is not connected. */
export interface FdeSourcePaths {
  readonly caseDir?: string;
  readonly comparePath?: string;
  readonly derivePath?: string;
  readonly pinPath?: string;
}

export function fdePathsFromEnv(env: Readonly<Record<string, string | undefined>>): FdeSourcePaths {
  const pick = (name: string): string | undefined => (env[name] !== undefined && env[name] !== "" ? env[name] : undefined);
  const paths = { caseDir: pick("HORIZON_FDE_CASE_DIR"), comparePath: pick("HORIZON_FDE_COMPARE"), derivePath: pick("HORIZON_FDE_DERIVE"), pinPath: pick("HORIZON_FDE_PIN") };
  return Object.fromEntries(Object.entries(paths).filter(([, v]) => v !== undefined)) as FdeSourcePaths;
}

export function readFdeSources(paths: FdeSourcePaths): FdeSources {
  const absent = <T,>(what: string): SourceRead<T> => ({ state: "not_connected", detail: `${what} is not configured` });
  return {
    case: paths.caseDir === undefined ? absent("the case directory") : readCaseRecords(paths.caseDir),
    realitytrace: paths.comparePath === undefined ? absent("the compare result") : readRealityTrace(paths.comparePath, paths.derivePath),
    pin: paths.pinPath === undefined ? absent("the world pin") : readWorldPin(paths.pinPath),
  };
}
