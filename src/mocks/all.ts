import { aiHandlers } from "./ai";
import { handlers } from "./handlers";
import { f3Handlers } from "./f3";
import { f4Handlers } from "./f4";
import { f5Handlers } from "./f5";
import { f6Handlers } from "./f6";
import { f7Handlers } from "./f7";
import { qa4Handlers } from "./qa4";

/**
 * Every MSW handler. Specific routes first so /admin/users/:id/usage wins over broader patterns and
 * /applications/stats over /applications/:id; F6's top-up and F7's story-draft tasks before the generic /tasks/:id.
 */
export const allHandlers = [
  ...aiHandlers,
  ...f7Handlers,
  ...qa4Handlers,
  ...f6Handlers,
  ...f5Handlers,
  ...f4Handlers,
  ...f3Handlers,
  ...handlers,
];
