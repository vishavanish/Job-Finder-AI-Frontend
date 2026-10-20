/**
 * The one HTTP client for the backend (spec §5.1).
 *
 * - Base URL from VITE_API_BASE_URL; every path is relative to /api/v1.
 * - Sends `Authorization: Bearer <access token>` from memory (lib/auth/session).
 * - Sends cookies (`credentials: "include"`) so the httpOnly refresh cookie
 *   reaches /auth/refresh and /auth/logout.
 * - On 401 runs ONE refresh (shared by every request that hit 401 at the same
 *   time) and retries once. If refresh fails, the session ends.
 * - On 403 `account_disabled` the session ends with a clear message.
 * - Errors are thrown as ApiError with a readable message.
 */
import { API_PREFIX } from "../env";
import {
  ACCOUNT_DISABLED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  endSession,
  getAccessToken,
  setAccessToken,
} from "../auth/session";
import { ApiError, parseErrorBody } from "./errors";
import type { TokenResponse } from "./types";

/** An array is sent as a repeated key (`?platform=a&platform=b`), as FastAPI's list parameters expect. */
export type QueryValue = string | number | boolean | null | undefined | readonly string[];

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, QueryValue>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Return the response body as a Blob (files, screenshots) instead of JSON/text. */
  asBlob?: boolean;
}

/** Sign-in endpoints answer 401 for wrong credentials; refreshing there makes no sense. */
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/otp/request",
  "/auth/otp/verify",
  "/auth/google",
  "/auth/refresh",
  "/auth/logout",
]);

export function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const base =
    typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost";
  const url = new URL(`${API_PREFIX}${path}`, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
      else url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(buildUrl(path, opts.params), {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, parseErrorBody(0, null));
  }
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  if ((res.headers.get("content-type") ?? "").includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

async function toError(res: Response): Promise<ApiError> {
  const body = parseErrorBody(res.status, await readBody(res));
  return new ApiError(res.status, body, retryAfter(res));
}

function isAccountDisabled(err: ApiError): boolean {
  return err.status === 403 && err.code === "account_disabled";
}

let refreshInFlight: Promise<TokenResponse | null> | null = null;

/**
 * Other tabs share the same refresh cookie. Holding a Web Lock across the request
 * means a second tab waits, then sends the cookie the first tab just received,
 * instead of replaying the old one (which the backend treats as token theft).
 */
function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? (locks.request("jf-auth-refresh", fn) as Promise<T>) : fn();
}

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share
 * one request, and tabs take turns (withCrossTabLock): the backend rotates the
 * refresh token and treats a reused one as theft, revoking every session.
 */
export function refreshAccessToken(): Promise<TokenResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      let res: Response;
      try {
        res = await withCrossTabLock(() => send("/auth/refresh", { method: "POST" }));
      } catch {
        return null;
      }
      if (!res.ok) {
        const err = await toError(res);
        if (isAccountDisabled(err)) {
          endSession({ reason: "disabled", message: err.message || ACCOUNT_DISABLED_MESSAGE });
        }
        setAccessToken(null);
        return null;
      }
      const data = (await readBody(res)) as TokenResponse;
      setAccessToken(data.access_token);
      return data;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts);

  if (res.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await send(path, opts);
    if (res.status === 401) {
      const err = await toError(res);
      endSession({ reason: "expired", message: SESSION_EXPIRED_MESSAGE });
      throw err;
    }
  }

  if (!res.ok) {
    const err = await toError(res);
    if (isAccountDisabled(err)) {
      endSession({ reason: "disabled", message: err.message || ACCOUNT_DISABLED_MESSAGE });
    }
    throw err;
  }
  return (opts.asBlob ? await res.blob() : await readBody(res)) as T;
}

type BodyOpts = Omit<RequestOptions, "method" | "body">;

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: BodyOpts) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: BodyOpts) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: BodyOpts) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: BodyOpts) => apiRequest<T>(path, { ...opts, method: "DELETE" }),
  /** An authenticated file download (with the same refresh-on-401 as JSON calls). */
  blob: (path: string, opts?: BodyOpts) =>
    apiRequest<Blob>(path, { ...opts, method: "GET", asBlob: true, headers: { Accept: "*/*" } }),
};
