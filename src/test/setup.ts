import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";
import { resetMockDb } from "../mocks/data";
import { resetMockSession } from "../mocks/handlers";
import { resetAiMock } from "../mocks/aiState";
import { resetF3Mock } from "../mocks/f3State";
import { resetF4Mock } from "../mocks/f4State";
import { setAccessToken } from "../lib/auth/session";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  resetMockSession();
  resetAiMock();
  resetF3Mock();
  resetF4Mock();
  setAccessToken(null);
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterAll(() => server.close());

// jsdom has no matchMedia; theme code reads it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
