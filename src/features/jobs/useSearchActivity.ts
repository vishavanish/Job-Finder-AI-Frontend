/**
 * Keeps searches in the Activity tray current on every page, not only on Jobs (where usePipelineRun follows
 * one search): every running search is asked for its status until it ends. A search the server no longer
 * holds (404: runs live 6 h) ends as expired; other errors are retried on the next check.
 */
import { useEffect, useMemo } from "react";
import { useActivity } from "../../app/activity";
import { ApiError } from "../../lib/api/errors";
import { getRun } from "./jobsApi";
import { runActivity } from "./usePipelineRun";

export const ACTIVITY_POLL_MS = 5000;

export function useSearchActivity(): void {
  const { items, track } = useActivity();
  const running = useMemo(
    () =>
      items
        .filter((a) => a.kind === "search" && a.status === "running")
        .map((a) => a.id)
        .join(" "),
    [items],
  );

  useEffect(() => {
    if (!running) return;
    const ids = running.split(" ");
    let stopped = false;
    const check = async () => {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const meta = await getRun(id);
            if (!stopped) track({ id, ...runActivity(meta) });
          } catch (err) {
            if (!stopped && err instanceof ApiError && err.status === 404) {
              track({ id, status: "failed", detail: "These results have expired" });
            }
          }
        }),
      );
    };
    const timer = setInterval(() => void check(), ACTIVITY_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, track]);
}
