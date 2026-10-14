/**
 * The access token lives only in this module's memory: never in localStorage,
 * sessionStorage or cookies readable by JS. A page reload drops it, and the app
 * gets a new one from POST /auth/refresh using the httpOnly `jf_refresh` cookie.
 */

export type SessionEndReason = "expired" | "disabled" | "signed_out";

export interface SessionEnd {
  reason: SessionEndReason;
  /** Shown to the user on the sign-in screen. Empty for a normal sign-out. */
  message: string;
}

let accessToken: string | null = null;
const listeners = new Set<(end: SessionEnd) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Drop the token and tell the app (AuthContext) to show the signed-out state. */
export function endSession(end: SessionEnd): void {
  accessToken = null;
  for (const listener of listeners) listener(end);
}

export function onSessionEnd(listener: (end: SessionEnd) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const SESSION_EXPIRED_MESSAGE = "Your session has ended. Sign in again to continue.";
export const ACCOUNT_DISABLED_MESSAGE =
  "This account has been disabled. Contact your admin if you think this is a mistake.";
