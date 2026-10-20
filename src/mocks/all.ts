import { aiHandlers } from "./ai";
import { handlers } from "./handlers";
import { f3Handlers } from "./f3";
import { f4Handlers } from "./f4";
import { f5Handlers } from "./f5";

/**
 * Every MSW handler. Specific routes first so /admin/users/:id/usage wins over broader patterns and
 * /applications/stats over /applications/:id.
 */
export const allHandlers = [
  ...aiHandlers,
  ...f5Handlers,
  ...f4Handlers,
  ...f3Handlers,
  ...handlers,
];
