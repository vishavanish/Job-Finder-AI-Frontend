/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://jobfinderai.duckdns.org. Empty = same origin (dev proxy). */
  readonly VITE_API_BASE_URL?: string;
  /** "true" serves API calls from MSW handlers in src/mocks. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
