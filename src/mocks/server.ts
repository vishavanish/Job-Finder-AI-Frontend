import { setupServer } from "msw/node";
import { allHandlers as handlers } from "./all";

/** MSW for Vitest (node). Started in src/test/setup.ts. */
export const server = setupServer(...handlers);
