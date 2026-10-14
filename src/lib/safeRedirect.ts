/**
 * Only allow redirects to a path inside this app. Rejects absolute URLs,
 * protocol-relative "//host" and backslash tricks ("/\\host") — the open-redirect
 * pattern behind GHSA-wrjc-x8rr-h8h6 in react-router 6.
 */
export function safeRedirectPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string" || !target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.includes("\\")) return fallback;
  // Control characters (tab, newline) can be stripped by URL parsers and turn "/\t/host" into "//host".
  for (const ch of target) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  if (target.startsWith("/login")) return fallback;
  return target;
}
