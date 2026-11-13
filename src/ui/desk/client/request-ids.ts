/**
 * Request ids for the desk's commands in the browser (finding R2-11). The server refuses a panel change with no request id, and treats
 * the same id with the same body as a retry of one command. So each command gets ONE id when it starts. The id is kept under the
 * command's key until the desk gives a definite reply (any status below 500), and a retry of the same command reuses it. A new
 * command, or the same command after a definite reply, gets a new id. A failure with no reply keeps the id, so the retry is the same command.
 */
const pending = new Map<string, string>();

/** The id of the command with this key: the one already kept for it, or a new one that is kept from now on. */
export function requestIdFor(commandKey: string): string {
  const known = pending.get(commandKey);
  if (known !== undefined) return known;
  const id = crypto.randomUUID();
  pending.set(commandKey, id);
  return id;
}

/** The desk replied definitely to this command. Its id is final: the next command with this key gets a new one. */
export function settleRequest(commandKey: string): void {
  pending.delete(commandKey);
}
