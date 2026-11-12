/**
 * A stand-in for the desk's controlling terminal, for tests that enrol a phone.
 *
 * The desk writes lines to the operator (the one-time code and what it authorizes) and reads
 * lines the operator types. A test types the code the desk showed for one pending enrolment,
 * which is what a person does at the terminal. The channel is structural: it does not import
 * the desk's own types, so a test states the contract it relies on.
 */
export class TestOperatorChannel {
  readonly shown: string[] = [];
  private handler: ((line: string) => Promise<void> | void) | null = null;

  /** The desk shows a line to the operator. Always succeeds: a test channel is a terminal. */
  show(line: string): boolean {
    this.shown.push(line);
    return true;
  }

  /** The desk starts reading what the operator types; the returned function stops reading. */
  read(handler: (line: string) => Promise<void> | void): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = null;
    };
  }

  /** The operator types a line. With no reader attached the line is lost, as on a terminal nobody reads. */
  async type(line: string): Promise<void> {
    if (this.handler === null) return;
    await this.handler(line);
  }

  /** The one-time code the desk showed for one pending enrolment. */
  codeFor(pendingId: string): string {
    for (const line of [...this.shown].reverse()) {
      if (!line.includes(pendingId)) continue;
      const match = /Code: (\d{6})\./.exec(line);
      if (match !== null) return match[1] ?? "";
    }
    throw new Error(`no code was shown for ${pendingId}`);
  }
}

/**
 * A present operator: types the code of each new pending enrolment the desk shows, as soon as it is shown.
 * Used by the browser test, where the phone's page waits on the desk and a person would be at the terminal.
 * Returns the function that stops the operator.
 */
export function presentOperator(channel: TestOperatorChannel, intervalMs = 100): () => void {
  const typed = new Set<string>();
  const timer = setInterval(() => {
    for (const line of [...channel.shown]) {
      const match = /Pending (pending_[0-9a-f-]+)\. Code: (\d{6})\./.exec(line);
      if (match === null || typed.has(match[1] ?? "")) continue;
      typed.add(match[1] ?? "");
      void channel.type(match[2] ?? "");
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
