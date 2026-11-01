/**
 * In-memory state for the browser extension mocks (backend P8a E1): connected browsers and saved-job counts.
 * Apart from the handlers so the apply mocks (Fast apply needs to know whether an extension is connected) can
 * read it without importing the handler module. Reset between tests.
 */
import type { ExtensionConnection } from "../features/extension/extensionApi";

export const extensionDb = {
  connections: {} as Record<string, ExtensionConnection[]>,
  saved: {} as Record<string, { total: number; today: number }>,
};

export function resetExtensionMock(): void {
  extensionDb.connections = {};
  extensionDb.saved = {};
}
