/**
 * J02 IS6/IS7: a committed navigation intent's evidence and SEA-Forge's settlement reference.
 *
 * Execution is not settlement (IS7 `execution_success_is_not_settlement_success`). The governed
 * commit's `run.invocation` event becomes a CEP execution_trace, delivered to RealityTrace through
 * Cognate's committed outbox (the observation commits atomically with the event). RealityTrace then
 * derives its own evidence from that observation; Horizon packages exactly what RealityTrace
 * recorded and asks SEA-Forge, the settlement owner, to settle the operation. With only a completion
 * trace the evidence is `unknown` and SEA-Forge answers `unsettled`: that answer is the settlement
 * reference, never upgraded here. What cannot be obtained is marked unavailable, never invented
 * (IS6 `unavailable_is_marked_not_invented`).
 */
import { join } from "node:path";
import type { OutboxIntent } from "@godspeedai/cognate-events";
import {
  createSxrCliPort,
  evidencePacketEnvelope,
  governedTraceFor,
  ObservationDelivery,
  observationIntent,
  type SxrWorkflow,
} from "@godspeedai/cognate-realitytrace";
import type { PendingEvent, SeaForgeAuthority } from "@godspeedai/cognate-runtime-bun";

export const ENV_REALITYTRACE_BIN = "COGNATE_REALITYTRACE_BIN";
export const ENV_REALITYTRACE_DATA_HOME = "COGNATE_REALITYTRACE_DATA_HOME";
export const ENV_REALITYTRACE_STATE_HOME = "COGNATE_REALITYTRACE_STATE_HOME";

export interface RealityTraceConfig {
  /** The pinned `realitytrace` binary. */
  readonly bin: string;
  readonly dataHome: string;
  readonly stateHome: string;
  /** The repository RealityTrace enrolls for Horizon's observations (created if absent). */
  readonly repoDir: string;
}

/**
 * `COGNATE_REALITYTRACE_BIN`, `_DATA_HOME` and `_STATE_HOME` (the names Cognate-Workbench uses). All
 * unset: no RealityTrace (settlement references say so). Some set: a startup error, never a guess.
 */
export function realityTraceFromEnv(env: Readonly<Record<string, string | undefined>>, repoDir: string): RealityTraceConfig | undefined {
  const bin = env[ENV_REALITYTRACE_BIN]?.trim();
  const dataHome = env[ENV_REALITYTRACE_DATA_HOME]?.trim();
  const stateHome = env[ENV_REALITYTRACE_STATE_HOME]?.trim();
  if (!bin && !dataHome && !stateHome) return undefined;
  if (!bin || !dataHome || !stateHome) {
    throw new Error(`${ENV_REALITYTRACE_BIN}, ${ENV_REALITYTRACE_DATA_HOME} and ${ENV_REALITYTRACE_STATE_HOME} are set together or not at all`);
  }
  return { bin, dataHome, stateHome, repoDir };
}

/** Where Horizon's RealityTrace repository lives by default: beside the runtime store. */
export function defaultRealityTraceRepo(storePath: string): string {
  return join(storePath, "..", "realitytrace-repo");
}

/**
 * The outbox intents for one run event: a RealityTrace observation for each governed invocation of
 * `capability` (one SEA-Forge decision recorded on it). Anything else asks for nothing.
 */
export function observationOutbox(capability: string): (event: PendingEvent) => readonly OutboxIntent[] {
  return (event) => {
    if (event.eventType !== "run.invocation" || event.metadata?.capability !== capability) return [];
    const trace = governedTraceFor(event as never);
    if (!trace) return [];
    return [observationIntent(event as never, { classification: "durable_fact", capabilityId: capability, trace: trace as never })];
  };
}

/** One committed governed invocation, as the run recorded it. */
export interface GovernedInvocation {
  readonly eventId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly metadata: { readonly [key: string]: unknown };
}

export interface ObservationEvidence {
  /** RealityTrace's ledger position of the recorded execution_trace (`<ledger_id>:<ordinal>`). */
  readonly targetRef: string;
  readonly sxrObservationId: string;
  readonly evidenceId: string;
}

/** RealityTrace side of IS6: deliver the trace, derive RealityTrace's own evidence, read it back. */
export class RealityTraceEvidence {
  private readonly port: ReturnType<typeof createSxrCliPort>;
  private readonly delivery: ObservationDelivery;
  private workflow: Promise<SxrWorkflow> | undefined;

  constructor(
    store: ConstructorParameters<typeof ObservationDelivery>[0],
    private readonly config: RealityTraceConfig,
  ) {
    this.port = createSxrCliPort({ bin: config.bin, repoDir: config.repoDir, env: this.env() });
    this.delivery = new ObservationDelivery(store, { port: this.port, backoff: { baseMs: 50, maxMs: 1_000, maxAttempts: 5 } });
  }

  private env(): Record<string, string> {
    return { XDG_DATA_HOME: this.config.dataHome, XDG_STATE_HOME: this.config.stateHome };
  }

  /** RealityTrace's enrollment, question, threshold and run, once per process. */
  private prepared(): Promise<SxrWorkflow> {
    this.workflow ??= this.port.prepare({ title: "does a committed Horizon navigation intent reach its declared state" }).catch((error: unknown) => {
      this.workflow = undefined;
      throw error;
    });
    return this.workflow;
  }

  /** Deliver the invocation's observation (bounded) and return where RealityTrace recorded it. */
  async observe(invocation: GovernedInvocation, timeoutMs = 20_000): Promise<string> {
    await this.prepared();
    const end = Date.now() + timeoutMs;
    for (;;) {
      if (await this.delivery.isRecorded(invocation.eventId)) break;
      await this.delivery.drain();
      if (await this.delivery.isRecorded(invocation.eventId)) break;
      const status = await this.delivery.status(invocation.eventId);
      if (status?.state === "failed") throw new Error(`RealityTrace refused the observation: ${status.lastError ?? "unknown"}`);
      if (Date.now() > end) throw new Error(`RealityTrace did not record the observation (${status?.state ?? "not queued"})`);
      await Bun.sleep(50);
    }
    const status = await this.delivery.status(invocation.eventId);
    if (!status?.targetRef) throw new Error("RealityTrace recorded the observation without a ledger position");
    return status.targetRef;
  }

  /** RealityTrace's own evidence for the recorded observation (its derivation; may be `unknown`). */
  async evidenceFor(targetRef: string): Promise<ObservationEvidence> {
    const workflow = await this.prepared();
    const sxrObservationId = await this.observationAt(workflow, targetRef);
    const derived = await this.port.deriveEvidence(sxrObservationId, "execution_trace");
    return { targetRef, sxrObservationId, evidenceId: derived.evidenceId };
  }

  /** The evidence_packet carrying exactly what RealityTrace recorded for this observation. */
  async packet(worldRef: string, authority: { readonly operationId: string; readonly decisionEnvelopeId: string }, evidence: ObservationEvidence): Promise<Record<string, unknown>> {
    const { question, rows } = await this.port.readEvidence();
    const mine = rows.filter((row) => String(row.evidence.evidence_id) === evidence.evidenceId);
    if (mine.length === 0) throw new Error(`RealityTrace's ledger does not hold evidence ${evidence.evidenceId}`);
    return evidencePacketEnvelope({ worldRef, authority, question, rows: mine }) as Record<string, unknown>;
  }

  /** RealityTrace's observation id for the record at `targetRef` (its own id, not Cognate's). */
  private async observationAt(workflow: SxrWorkflow, targetRef: string): Promise<string> {
    const split = targetRef.lastIndexOf(":");
    const ledgerId = targetRef.slice(0, split);
    const ordinal = Number(targetRef.slice(split + 1));
    const proc = Bun.spawn([this.config.bin, "ledger", "export", "--repo", workflow.repoId], {
      cwd: this.config.repoDir,
      env: { ...process.env, ...this.env() },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) throw new Error(`realitytrace ledger export failed (exit ${code}): ${err || out}`);
    const rows = JSON.parse(out) as { ledger_id: string; append_ordinal: number; payload: { observations?: { observation_id?: string }[] } }[];
    const id = rows.find((r) => r.ledger_id === ledgerId && r.append_ordinal === ordinal)?.payload.observations?.[0]?.observation_id;
    if (typeof id !== "string") throw new Error(`RealityTrace's ledger has no observation at ${targetRef}`);
    return id;
  }
}

/** The SEA-Forge decision recorded on a governed invocation, or undefined. */
export function authorityOf(invocation: GovernedInvocation): { readonly operationId: string; readonly decisionEnvelopeId: string; readonly worldRef: string } | undefined {
  const authority = (invocation.metadata.decision as { authority?: { operationId?: unknown; decisionEnvelopeId?: unknown; worldRef?: unknown } } | null | undefined)?.authority;
  if (typeof authority?.operationId !== "string" || typeof authority.decisionEnvelopeId !== "string" || typeof authority.worldRef !== "string") return undefined;
  return { operationId: authority.operationId, decisionEnvelopeId: authority.decisionEnvelopeId, worldRef: authority.worldRef };
}

export type SettlementAuthority = Pick<SeaForgeAuthority, "submitEvidence" | "settle">;
