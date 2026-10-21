/**
 * The backend contract (PROJECT.md §9) promises one error body: {code, message, details}.
 * Today FastAPI still sends {detail: "..."}, {detail: {code, message}} (account_disabled)
 * or {detail: [...]} (422 validation). parseErrorBody accepts all of them.
 */
export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  /** Seconds from a Retry-After header (429), if the backend sent one. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, body: ErrorBody, retryAfterSeconds: number | null = null) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const CODE_BY_STATUS: Record<number, string> = {
  0: "network_error",
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation_error",
  429: "rate_limited",
  503: "unavailable",
};

export function codeForStatus(status: number): string {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? "server_error" : "http_error");
}

export function defaultMessage(status: number): string {
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  if (status === 401) return "Your session has ended. Sign in again to continue.";
  if (status === 403) return "Your account doesn't have access to this.";
  if (status === 404) return "That item no longer exists.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status === 503) return "This service is turned off right now. Try again later.";
  if (status >= 500) return "The server hit an error. Try again in a minute.";
  return `The request failed (HTTP ${status}).`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validationMessage(items: unknown[]): string {
  const first = items[0];
  if (!isRecord(first) || typeof first.msg !== "string") return defaultMessage(422);
  const loc = Array.isArray(first.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
  return loc ? `${loc}: ${first.msg}` : first.msg;
}

export function parseErrorBody(status: number, body: unknown): ErrorBody {
  const fallback = { code: codeForStatus(status), message: defaultMessage(status) };

  if (isRecord(body)) {
    // Target contract: {code, message, details}
    if (typeof body.code === "string" && typeof body.message === "string") {
      return { code: body.code, message: body.message, details: body.details };
    }
    const detail = body.detail;
    if (typeof detail === "string" && detail.trim()) {
      return { code: fallback.code, message: detail };
    }
    if (isRecord(detail)) {
      const { code, message, ...rest } = detail;
      return {
        code: typeof code === "string" ? code : fallback.code,
        message: typeof message === "string" ? message : fallback.message,
        details: Object.keys(rest).length ? rest : undefined,
      };
    }
    if (Array.isArray(detail)) {
      return { code: "validation_error", message: validationMessage(detail), details: detail };
    }
  }
  // A bare 5xx text body ("Internal Server Error") says less than our own message.
  if (typeof body === "string" && body.trim() && body.length < 300 && status < 500) {
    return { code: fallback.code, message: body.trim() };
  }
  return fallback;
}

/** Human-readable message for anything a catch block receives. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
