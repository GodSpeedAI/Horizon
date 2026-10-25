/**
 * Settle a bound operation whose closure SEA-Forge may not have recorded yet.
 *
 * SEA-Forge answers with error class `cep_settlement_pending` until the closure (C) is recorded.
 * That is a pending outcome, not a refusal: the caller retries with bounded backoff until the deadline
 * (window close + the spec's close grace). Any other refusal is returned at once. Past the deadline the
 * pending result is returned, and the operation stays pending for a later settle call.
 */
export interface SettleAwaitingClosureOptions {
  /** Epoch milliseconds after which no further retries are made. */
  readonly deadlineAt: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

/** The class alone decides; message text is for people, never matched. */
export const CLOSURE_PENDING_ERROR_CLASS = "cep_settlement_pending";

export function isClosurePending(result: { readonly ok: boolean; readonly errorClass?: string }): boolean {
  return result.ok === false && result.errorClass === CLOSURE_PENDING_ERROR_CLASS;
}

export async function settleAwaitingClosure<T extends { readonly ok: boolean; readonly errorClass?: string; readonly error?: string }>(
  attempt: () => Promise<T>,
  options: SettleAwaitingClosureOptions,
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const maxDelayMs = options.maxDelayMs ?? 1_000;
  let delayMs = options.initialDelayMs ?? 50;
  for (;;) {
    const result = await attempt();
    if (!isClosurePending(result)) return result;
    const remaining = options.deadlineAt - now();
    if (remaining <= 0) return result;
    await sleep(Math.min(delayMs, remaining));
    delayMs = Math.min(delayMs * 2, maxDelayMs);
  }
}
