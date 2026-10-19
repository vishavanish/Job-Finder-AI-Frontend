import { aiHandlers } from "./ai";
import { handlers } from "./handlers";
import { f3Handlers } from "./f3";
import { f4Handlers } from "./f4";

/** Every MSW handler. Specific P2 routes first so /admin/users/:id/usage wins over broader patterns. */
export const allHandlers = [...aiHandlers, ...f4Handlers, ...f3Handlers, ...handlers];
