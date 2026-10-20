/** Gmail connect helpers: where the connect URL may lead, and what Google's redirect back means. */

const GOOGLE_AUTH = "https://accounts.google.com/";

export const GMAIL_RETURN: Record<string, { ok: boolean; text: string }> = {
  connected: {
    ok: true,
    text: "Gmail connected. The first check looks at the last 30 days and takes a minute or two.",
  },
  expired: { ok: false, text: "The connection took too long — try again." },
  denied: { ok: false, text: "You cancelled on Google's screen. Nothing was connected." },
  scope: {
    ok: false,
    text: "Google didn't grant read access to your mailbox. Try again and tick the Gmail box.",
  },
  failed: { ok: false, text: "Couldn't connect Gmail. Try again in a minute." },
};

/** Where the connect URL may send the browser: Google's consent screen, or an in-app path (dev mocks). */
export function connectTarget(url: string): { external: string } | { internal: string } | null {
  if (url.startsWith(GOOGLE_AUTH)) return { external: url };
  if (url.startsWith("/") && !url.startsWith("//")) return { internal: url };
  return null;
}
