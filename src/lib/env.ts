const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Backend origin ("" = same origin as the app, i.e. the Vite dev proxy). */
export const API_ORIGIN = rawBase;

/** Every backend route lives under /api/v1. */
export const API_PREFIX = `${rawBase}/api/v1`;
