/// <reference types="vitest/config" />
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** public/mockServiceWorker.js is only needed when mocks are on; keep it out of real builds. */
function stripMockWorker(useMocks: boolean): Plugin {
  return {
    name: "strip-mock-worker",
    apply: "build",
    async closeBundle() {
      if (!useMocks) await rm(resolve("dist/mockServiceWorker.js"), { force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  // DEV_API_PROXY_TARGET has no VITE_ prefix, so it never reaches the bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), stripMockWorker(env.VITE_USE_MOCKS === "true")],
    server: {
      port: 5173,
      // With VITE_API_BASE_URL empty (the development default) the app calls
      // /api/v1/* on its own origin and this proxy forwards it to the backend.
      // Same origin also means the refresh cookie works without cross-site rules.
      proxy: {
        "/api": {
          target: env.DEV_API_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      restoreMocks: true,
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
