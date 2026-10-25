/**
 * Remote settings come from the environment only (`HORIZON_REMOTE_PORT`, `HORIZON_REMOTE_PUBLIC_URL`),
 * never from `config/horizon.toml`, so the cockpit's configuration semantics are untouched.
 */
export interface RemoteSettings {
  /** The loopback port the phone listener binds. 0 asks the OS for one (tests). */
  readonly port: number;
  /** The public HTTPS origin a tunnel or proxy serves, or null for this machine only. */
  readonly publicUrl: string | null;
}

export const REMOTE_DEFAULT_PORT = 4320;

export function remoteSettings(env: Record<string, string | undefined> = process.env): RemoteSettings {
  const rawPort = env.HORIZON_REMOTE_PORT?.trim();
  const port = rawPort === undefined || rawPort === "" ? REMOTE_DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("REMOTE: HORIZON_REMOTE_PORT must be an integer port");
  const rawUrl = env.HORIZON_REMOTE_PUBLIC_URL?.trim();
  if (rawUrl === undefined || rawUrl === "") return { port, publicUrl: null };
  return { port, publicUrl: publicOriginOf(rawUrl) };
}

/** An origin only: HTTPS, or plain HTTP on localhost for testing. No path, query or credentials. */
export function publicOriginOf(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("REMOTE: the public URL is not a URL");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("REMOTE: the public URL must be https://");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("REMOTE: the public URL must be an origin with no path, query or credentials");
  }
  return url.origin;
}
