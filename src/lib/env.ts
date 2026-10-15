const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Backend origin ("" = same origin as the app, i.e. the Vite dev proxy). */
export const API_ORIGIN = rawBase;

/** Every backend route lives under /api/v1. */
export const API_PREFIX = `${rawBase}/api/v1`;

/** Google OAuth web client id (public). Empty = hide "Continue with Google". */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
