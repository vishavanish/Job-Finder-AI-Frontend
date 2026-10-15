import { aiHandlers } from "./ai";
import { handlers } from "./handlers";

/** Every MSW handler. Specific P2 routes first so /admin/users/:id/usage wins over broader patterns. */
export const allHandlers = [...aiHandlers, ...handlers];
