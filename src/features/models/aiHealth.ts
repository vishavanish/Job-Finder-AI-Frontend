/**
 * Whether the AI can run a task right now, from GET /models (QA1 §3). The backend
 * pauses a model after a rate limit, a broken setup or repeated failures; when every
 * model for a task is paused, the screens that need it say so before the user tries.
 */
import type { ModelCatalog } from "../../lib/api/types";
import { servesTask } from "./tasks";

/** "busy" = paused for a passing reason (back soon); "broken" = an admin must fix the setup. */
export type AiTaskHealth = "ok" | "busy" | "broken";

export function aiTaskHealth(catalog: ModelCatalog | undefined, task: string): AiTaskHealth {
  if (!catalog) return "ok";
  const usable = catalog.models.filter(
    (m) => m.available && servesTask(m.tasks ?? [], task, m.provider),
  );
  // No usable model at all is shown by each screen's own "no model" message.
  if (usable.length === 0 || usable.some((m) => !m.paused)) return "ok";
  return usable.every((m) => m.pause_reason === "broken") ? "broken" : "busy";
}
