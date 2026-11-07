/**
 * One place that masks credentials in text built from a subprocess's output, before it becomes an error or a status.
 * Masks `Authorization:` header values, `Bearer` tokens, workshop keys (`wbs1.`), GitHub tokens (`ghp_`, `gho_`, `ghu_`,
 * `ghs_`, `ghr_`, `github_pat_`) and the values of `token=`, `password=`, `secret=`, `api_key=` pairs.
 */
const RULES: readonly [RegExp, string][] = [
  [/(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+|token\s+)?[^\s"',;]+/gi, "$1[removed]"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [removed]"],
  [/\bwbs1\.[A-Za-z0-9._~+/=-]+/g, "[workshop key removed]"],
  [/\bgithub_pat_[A-Za-z0-9_]{10,}/g, "[token removed]"],
  [/\bgh[pousr]_[A-Za-z0-9_]{10,}/g, "[token removed]"],
  [/\b((?:access_?|auth_?|api_?)?(?:token|password|passwd|secret|api_?key)\s*[=:]\s*)[^\s"',;&]+/gi, "$1[removed]"],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}
