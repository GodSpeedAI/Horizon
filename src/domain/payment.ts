/**
 * Payment entries and the capacity ledger (HORIZON-001 1.1.0, REQ-NAV-008, REQ-NAV-009).
 *
 * Payment is a vector of non-fungible currencies (manifesto v17 §8). Nothing here sums, weighs or
 * converts across currencies or units, and a `predicted` estimate is advisory: only a binding's
 * `declared_bound` entries reach the gate.
 *
 * Pure: time arrives as a parameter and the ledger is a value. The store makes a reservation atomic
 * with the intent record; this module only decides what the reservation is and whether it fits.
 */
import type { GateAssessment } from "./navigation.ts";

/** Horizon's currency set (a design choice adopting v17 §8's minimum list). Extending it is a spec version. */
export const CURRENCIES = [
  "steering_attention",
  "orchestration",
  "compute",
  "verification",
  "recovery",
  "structural_maintenance",
  "representational_formation",
  "risk_irreversibility",
  "opportunity",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export type PaymentBasis = "declared_bound" | "predicted";

export interface PaymentEntry {
  readonly currency: Currency;
  readonly unit: string;
  /** Non-negative, or `unknown`. */
  readonly amount: number | "unknown";
  readonly basis: PaymentBasis;
  readonly source_ref: string;
}

export class PaymentError extends Error {
  override readonly name = "PaymentError";
  constructor(message: string) {
    super(`PAYMENT: ${message}`);
  }
}

const reject = (message: string): never => {
  throw new PaymentError(message);
};

const isCurrency = (value: unknown): value is Currency => typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);

/** Validate one entry's shape. Shape errors are refused; coverage is judged by {@link validateBinding}. */
export function assertPaymentEntry(value: unknown): PaymentEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject("a payment entry must be an object");
  const entry = value as Record<string, unknown>;
  const extra = Object.keys(entry).filter((key) => !["currency", "unit", "amount", "basis", "source_ref"].includes(key));
  if (extra.length > 0) reject(`a payment entry carries undeclared fields: ${extra.join(", ")}`);
  if (!isCurrency(entry["currency"])) reject(`unknown currency ${String(entry["currency"])}`);
  if (typeof entry["unit"] !== "string" || entry["unit"].trim() === "") reject("a payment entry needs a unit");
  const amount = entry["amount"];
  if (amount !== "unknown" && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
    reject(`amount must be a non-negative number or unknown, not ${String(amount)}`);
  }
  if (entry["basis"] !== "declared_bound" && entry["basis"] !== "predicted") reject(`basis must be declared_bound or predicted`);
  if (typeof entry["source_ref"] !== "string" || entry["source_ref"].trim() === "") reject("a payment entry needs a source_ref");
  return Object.freeze({
    currency: entry["currency"] as Currency,
    unit: entry["unit"] as string,
    amount: amount as number | "unknown",
    basis: entry["basis"] as PaymentBasis,
    source_ref: entry["source_ref"] as string,
  });
}

export const capacityKey = (currency: Currency, unit: string): string => `${currency}/${unit}`;

export type BindingValidation =
  | { readonly valid: true; readonly bounds: readonly PaymentEntry[] }
  | { readonly valid: false; readonly reason: string };

/**
 * A binding is valid only if it declares a `declared_bound` entry for every currency, exactly one per
 * (currency, unit). `predicted` entries are kept for display and never count toward coverage.
 */
export function validateBinding(entries: readonly PaymentEntry[]): BindingValidation {
  const bounds = entries.filter((entry) => entry.basis === "declared_bound");
  const seen = new Set<string>();
  for (const bound of bounds) {
    const key = capacityKey(bound.currency, bound.unit);
    if (seen.has(key)) return { valid: false, reason: `duplicate declared bound for ${key}` };
    seen.add(key);
  }
  const missing = CURRENCIES.filter((currency) => !bounds.some((bound) => bound.currency === currency));
  if (missing.length > 0) return { valid: false, reason: `no declared bound for ${missing.join(", ")}` };
  return { valid: true, bounds: Object.freeze([...bounds]) };
}

/* --------------------------------------------------------------------------------------------
 * Capacity ledger
 * ------------------------------------------------------------------------------------------ */

export interface CapacityAllowance {
  readonly currency: Currency;
  readonly unit: string;
  readonly allowance: number | "unbounded";
  /** `day` resets consumption at each UTC midnight. */
  readonly period: "none" | "day";
}

export interface Reservation {
  readonly intent_id: string;
  readonly bounds: readonly PaymentEntry[];
  readonly at: string;
}

export interface Consumption extends Reservation {
  /** When the intent became terminal; this decides the period it counts against. */
  readonly terminal_at: string;
}

export interface CapacityLedger {
  readonly allowances: readonly CapacityAllowance[];
  readonly reservations: readonly Reservation[];
  readonly consumptions: readonly Consumption[];
}

export const emptyLedger = (allowances: readonly CapacityAllowance[]): CapacityLedger =>
  Object.freeze({ allowances: Object.freeze([...allowances]), reservations: Object.freeze([]), consumptions: Object.freeze([]) });

export function assertAllowance(value: unknown): CapacityAllowance {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject("an allowance must be an object");
  const raw = value as Record<string, unknown>;
  if (!isCurrency(raw["currency"])) reject(`unknown currency ${String(raw["currency"])}`);
  if (typeof raw["unit"] !== "string" || raw["unit"].trim() === "") reject("an allowance needs a unit");
  const allowance = raw["allowance"];
  if (allowance !== "unbounded" && (typeof allowance !== "number" || !Number.isFinite(allowance) || allowance < 0)) {
    reject("allowance must be a non-negative number or unbounded");
  }
  const period = raw["period"] ?? "none";
  if (period !== "none" && period !== "day") reject("period must be none or day");
  return Object.freeze({ currency: raw["currency"] as Currency, unit: raw["unit"] as string, allowance: allowance as number | "unbounded", period: period as "none" | "day" });
}

const utcDay = (iso: string): string => iso.slice(0, 10);

function amountFor(entries: readonly PaymentEntry[], key: string): number {
  // Reservations only ever hold numeric bounds: an unknown bound never passes the gate (see below).
  return entries.filter((entry) => capacityKey(entry.currency, entry.unit) === key).reduce((sum, entry) => sum + (entry.amount as number), 0);
}

/** Available capacity for one (currency, unit) at `now`, or null when no allowance is configured. */
export function available(ledger: CapacityLedger, currency: Currency, unit: string, now: Date): number | "unbounded" | null {
  const key = capacityKey(currency, unit);
  const allowance = ledger.allowances.find((entry) => capacityKey(entry.currency, entry.unit) === key);
  if (allowance === undefined) return null;
  if (allowance.allowance === "unbounded") return "unbounded";
  const reserved = ledger.reservations.reduce((sum, reservation) => sum + amountFor(reservation.bounds, key), 0);
  const today = utcDay(now.toISOString());
  const consumed = ledger.consumptions
    .filter((consumption) => allowance.period === "none" || utcDay(consumption.terminal_at) === today)
    .reduce((sum, consumption) => sum + amountFor(consumption.bounds, key), 0);
  return allowance.allowance - reserved - consumed;
}

export type EntryResult =
  | { readonly key: string; readonly result: "passes" }
  | { readonly key: string; readonly result: "unknown" | "blocked"; readonly reason: string };

/** The REQ-NAV-009 table for one declared bound. */
export function judgeEntry(bound: PaymentEntry, ledger: CapacityLedger, now: Date): EntryResult {
  const key = capacityKey(bound.currency, bound.unit);
  if (bound.amount === 0) return { key, result: "passes" };
  const free = available(ledger, bound.currency, bound.unit, now);
  if (free === null) return { key, result: "unknown", reason: `no capacity for ${key}` };
  if (free === "unbounded") return { key, result: "passes" };
  if (bound.amount === "unknown") return { key, result: "unknown", reason: `${key}: the declared bound is unknown` };
  if (bound.amount <= free) return { key, result: "passes" };
  return { key, result: "blocked", reason: `${bound.currency}: declares ${bound.amount} ${bound.unit}, ${free} available` };
}

/**
 * The payment gate. Its only inputs are the binding's declared bounds and available capacity; it is
 * never weighed against expected value. An invalid binding is `unknown`; any blocked entry fails.
 */
export function paymentGate(entries: readonly PaymentEntry[], ledger: CapacityLedger, now: Date, basisRef = "horizon:capacity-ledger"): GateAssessment {
  const binding = validateBinding(entries);
  if (!binding.valid) return { verdict: "unknown", reason: `invalid payment binding: ${binding.reason}`, basis_ref: basisRef };
  const results = binding.bounds.map((bound) => judgeEntry(bound, ledger, now));
  const blocked = results.filter((entry) => entry.result === "blocked");
  const unknown = results.filter((entry) => entry.result === "unknown");
  const reasons = (list: readonly EntryResult[]) => list.map((entry) => ("reason" in entry ? entry.reason : entry.key)).join("; ");
  if (blocked.length > 0) return { verdict: "fail", reason: reasons(blocked), basis_ref: basisRef, prerequisite_ref: "capacity:allowance" };
  if (unknown.length > 0) return { verdict: "unknown", reason: reasons(unknown), basis_ref: basisRef, prerequisite_ref: "capacity:allowance" };
  return { verdict: "pass", basis_ref: basisRef };
}

/**
 * Reserve an intent's declared bounds. Refuses unless the gate passes against this exact ledger value;
 * the store writes the result with an expected version, so a concurrent commit re-evaluates instead of
 * overspending.
 */
export function reserve(ledger: CapacityLedger, intentId: string, entries: readonly PaymentEntry[], now: Date): CapacityLedger {
  if (ledger.reservations.some((reservation) => reservation.intent_id === intentId) || ledger.consumptions.some((entry) => entry.intent_id === intentId)) {
    reject(`intent ${intentId} already holds a reservation`);
  }
  const gate = paymentGate(entries, ledger, now);
  if (gate.verdict !== "pass") reject(`payment gate is ${gate.verdict}: ${gate.reason ?? ""}`);
  const binding = validateBinding(entries) as { valid: true; bounds: readonly PaymentEntry[] };
  const reservation: Reservation = Object.freeze({ intent_id: intentId, bounds: binding.bounds, at: now.toISOString() });
  return Object.freeze({ ...ledger, reservations: Object.freeze([...ledger.reservations, reservation]) });
}

/** A terminal intent's reservation becomes consumption, counted in the period it became terminal. */
export function consume(ledger: CapacityLedger, intentId: string, terminalAt: Date): CapacityLedger {
  const reservation = ledger.reservations.find((entry) => entry.intent_id === intentId);
  if (reservation === undefined) {
    if (ledger.consumptions.some((entry) => entry.intent_id === intentId)) return ledger;
    return reject(`intent ${intentId} holds no reservation`);
  }
  const consumption: Consumption = Object.freeze({ ...reservation, terminal_at: terminalAt.toISOString() });
  return Object.freeze({
    ...ledger,
    reservations: Object.freeze(ledger.reservations.filter((entry) => entry.intent_id !== intentId)),
    consumptions: Object.freeze([...ledger.consumptions, consumption]),
  });
}

export const holdsReservation = (ledger: CapacityLedger, intentId: string): boolean => ledger.reservations.some((entry) => entry.intent_id === intentId);

/* --------------------------------------------------------------------------------------------
 * Presentation (REQ-NAV-008, REQ-NAV-010)
 * ------------------------------------------------------------------------------------------ */

/** A spend an owner recorded, e.g. steering_attention / decisions read from SEA-Forge's approvals. */
export interface ObservedPayment {
  readonly currency: Currency;
  readonly unit: string;
  readonly amount: number;
  readonly source_ref: string;
}

/** What a move costs: its entries (declared bounds, and advisory predictions) and, once committed, what was observed. */
export interface PaymentView {
  readonly entries: readonly PaymentEntry[];
  readonly observed?: readonly ObservedPayment[];
}

const amountText = (entry: { readonly amount: number | "unknown"; readonly unit: string }) => (entry.amount === "unknown" ? `unknown ${entry.unit}` : `${entry.amount} ${entry.unit}`);

/**
 * One line every renderer uses, so a payment is never shown without its basis and an observed spend is never
 * shown without the bound it was declared against. Nothing is summed or converted across currencies.
 */
export function formatPayment(view: PaymentView | null): string {
  if (view === null) return "No payment is declared.";
  const bounds = view.entries.filter((entry) => entry.basis === "declared_bound");
  const predicted = view.entries.filter((entry) => entry.basis === "predicted");
  const observed = view.observed ?? [];
  const parts: string[] = [];
  const shown = bounds.filter((entry) => entry.amount !== 0 || observed.some((o) => o.currency === entry.currency && o.unit === entry.unit));
  if (bounds.length === 0) parts.push("no declared bound");
  else if (shown.length === 0) parts.push("declared bound: 0 in every currency");
  else {
    const rest = bounds.length - shown.length;
    const items = shown.map((entry) => {
      const seen = observed.find((o) => o.currency === entry.currency && o.unit === entry.unit);
      return seen ? `${entry.currency} declared ${amountText(entry)}, observed ${seen.amount} ${seen.unit} (${seen.source_ref})` : `${entry.currency} ${amountText(entry)}`;
    });
    parts.push(`declared bound: ${items.join("; ")}${rest > 0 ? `; 0 in the ${rest} other` : ""}`);
  }
  for (const seen of observed) {
    if (!bounds.some((entry) => entry.currency === seen.currency && entry.unit === seen.unit)) parts.push(`observed ${seen.currency} ${seen.amount} ${seen.unit} (${seen.source_ref}) with no declared bound`);
  }
  if (predicted.length > 0) parts.push(`predicted (advisory): ${predicted.map((entry) => `${entry.currency} ${amountText(entry)} (${entry.source_ref})`).join("; ")}`);
  return parts.join(" · ");
}
