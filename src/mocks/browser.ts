import { setupWorker } from "msw/browser";
import { allHandlers as handlers } from "./all";

export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({
    // Fonts, Vite modules and anything not under /api/v1 go to the network.
    onUnhandledRequest: "bypass",
    quiet: false,
  });
  console.info(
    "[mocks] API calls are served by MSW. Sign in as demo@jobfinder.test with code 123456 or password password123.",
  );
}
