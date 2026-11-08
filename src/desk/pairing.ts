/**
 * Pairing for the desk. When Horizon starts it makes one pairing code and shows it on the terminal. A browser that
 * enters the code gets a session cookie; every later write from the desk must carry that cookie. Only a keyed hash of the
 * code is kept in memory, and the code is never written to a file. Anyone who can read that terminal can pair.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";

export const PAIRING_LIFETIME_MS = 10 * 60 * 1000;
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const WRONG_CODES_BEFORE_LOCK = 5;
export const LOCK_MS = 60 * 1000;
export const SESSION_COOKIE = "horizon_desk";

/** 31 characters with no 0, O, 1, I or L, so a code read off a terminal cannot be misread. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export const WRONG_CODE_WORDS = "That code does not match. Check the terminal and try again.";
export const LOCKED_WORDS = "Too many tries. Wait a minute and try again.";
export const SPENT_CODE_WORDS = "That pairing code has expired or was already used. Restart Horizon to get a new code from the terminal.";
export const PAIR_FIRST_WORDS = "Pair this browser first.";
export const NOT_PAIRED_WORDS = "This browser is not paired with the desk, so nothing was changed. Enter the pairing code from the terminal.";

export type PairOutcome =
  | { readonly ok: true; readonly cookie: string; readonly expires: number }
  | { readonly ok: false; readonly status: 403 | 429; readonly words: string };

export interface DeskPairing {
  /** Checks a typed code. A correct code is used up at once. */
  readonly pair: (typed: string) => PairOutcome;
  /** Whether the request's cookie header carries a live session. */
  readonly paired: (cookieHeader: string | null) => boolean;
  /** Ends the session the cookie header carries, if any. */
  readonly end: (cookieHeader: string | null) => void;
  /** How long ago the session the cookie header carries was paired, in milliseconds. Null when there is no live session. */
  readonly pairedAgeMs: (cookieHeader: string | null) => number | null;
}

/** The cookie that holds the session: HttpOnly, SameSite=Strict, for the desk's paths only. */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}

/** A new code of 8 characters. The terminal shows it as XXXX-XXXX (see printPairingCode). Bytes at or above 248 are redrawn, so every character is equally likely. */
function makeCode(): string {
  let raw = "";
  while (raw.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte < 248 && raw.length < CODE_LENGTH) raw += ALPHABET[byte % ALPHABET.length];
    }
  }
  return raw;
}

const normalize = (typed: string): string => typed.replace(/[\s-]/g, "").toUpperCase();

/**
 * Starts pairing for one run of Horizon. Returns the code (to print once) and the pairing that checks it. The code itself is
 * not kept: only an HMAC of it, under a key made for this run, is held in memory.
 */
export function createDeskPairing(now: () => Date): { readonly code: string; readonly pairing: DeskPairing } {
  const code = makeCode();
  const key = randomBytes(32);
  const keyed = (value: string): Buffer => createHmac("sha256", key).update(value).digest();
  const codeMac = keyed(normalize(code));
  const issuedAt = now().getTime();
  let spent = false;
  let wrong = 0;
  let lockedUntil = 0;
  /** Each live session: when it expires, and when it was paired (for the changes that need a recent pairing). */
  const sessions = new Map<string, { readonly expires: number; readonly pairedAt: number }>();
  const sessionKey = (token: string): string => createHash("sha256").update(token).digest("hex");

  const liveSession = (cookieHeader: string | null): string | null => {
    const match = /(?:^|;\s*)horizon_desk=([A-Za-z0-9_-]{20,})/.exec(cookieHeader ?? "");
    if (match === null) return null;
    const id = sessionKey(match[1]!);
    const session = sessions.get(id);
    if (session === undefined) return null;
    if (now().getTime() >= session.expires) {
      sessions.delete(id);
      return null;
    }
    return id;
  };

  return {
    code,
    pairing: {
      pair(typed) {
        const at = now().getTime();
        if (at < lockedUntil) return { ok: false, status: 429, words: LOCKED_WORDS };
        if (spent || at - issuedAt >= PAIRING_LIFETIME_MS) return { ok: false, status: 403, words: SPENT_CODE_WORDS };
        const given = keyed(normalize(typed));
        if (!timingSafeEqual(given, codeMac)) {
          wrong += 1;
          if (wrong >= WRONG_CODES_BEFORE_LOCK) {
            wrong = 0;
            lockedUntil = at + LOCK_MS;
          }
          return { ok: false, status: 403, words: WRONG_CODE_WORDS };
        }
        spent = true;
        wrong = 0;
        const token = randomBytes(32).toString("base64url");
        const expires = at + SESSION_LIFETIME_MS;
        sessions.set(sessionKey(token), { expires, pairedAt: at });
        return { ok: true, cookie: sessionCookie(token, SESSION_LIFETIME_MS / 1000), expires };
      },
      paired: (cookieHeader) => liveSession(cookieHeader) !== null,
      end(cookieHeader) {
        const id = liveSession(cookieHeader);
        if (id !== null) sessions.delete(id);
      },
      pairedAgeMs(cookieHeader) {
        const id = liveSession(cookieHeader);
        const session = id === null ? undefined : sessions.get(id);
        return session === undefined ? null : now().getTime() - session.pairedAt;
      },
    },
  };
}

/** Test-only: receives each code as it is printed, keyed by the server's origin. Production code never sets it. */
let codeSink: ((origin: string, code: string) => void) | null = null;
export function receivePairingCodesForTests(sink: ((origin: string, code: string) => void) | null): void {
  codeSink = sink;
}

/** The words for a start with no terminal to show the code on. Plain, and they never include the code. */
export const NO_TERMINAL_WORDS = "Horizon needs a terminal to show the pairing code, so the desk did not start. Run the desk from an interactive terminal.";

/** Raised when there is no controlling terminal (/dev/tty) for the pairing code. The code is then not shown anywhere. */
export class PairingNeedsTerminal extends Error {
  override readonly name = "PairingNeedsTerminal";
  constructor() {
    super(NO_TERMINAL_WORDS);
  }
}

/** Where the pairing line goes: the controlling terminal (/dev/tty) only. */
export interface PairingOutput {
  /** Writes the line to the terminal. False when there is no controlling terminal. */
  readonly terminal: (line: string) => boolean;
}

export const terminalOutput = (): PairingOutput => ({
  terminal: (line) => {
    try {
      const fd = openSync("/dev/tty", "w");
      try {
        writeSync(fd, `${line}\n`);
      } finally {
        closeSync(fd);
      }
      return true;
    } catch {
      return false;
    }
  },
});

/** The pairing line, in plain words, for the terminal. */
export function pairingLine(shown: string): string {
  return `To open the desk, enter this pairing code: ${shown}. It works once and expires in 10 minutes.`;
}

/**
 * Shows the pairing code once, on the terminal only. Without a terminal (a service, a pipe) the code is not written anywhere and the
 * pairing flow is refused. Under the test sink nothing is printed: the sink receives the code instead.
 */
export function printPairingCode(origin: string, code: string, output: PairingOutput = terminalOutput()): void {
  const shown = `${code.slice(0, 4)}-${code.slice(4)}`;
  if (codeSink !== null) {
    codeSink(origin, shown);
    return;
  }
  deliverPairingLine(shown, output);
}

/** Sends the pairing line to the terminal. Without one it writes nothing and throws PairingNeedsTerminal. */
export function deliverPairingLine(shown: string, output: PairingOutput): void {
  if (!output.terminal(pairingLine(shown))) throw new PairingNeedsTerminal();
}
