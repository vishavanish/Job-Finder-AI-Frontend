/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://jobfinderai.duckdns.org. Empty = same origin (dev proxy). */
  readonly VITE_API_BASE_URL?: string;
  /** "true" serves API calls from MSW handlers in src/mocks. */
  readonly VITE_USE_MOCKS?: string;
  /** Google OAuth web client id (public, not a secret). Empty hides Google sign-in. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
