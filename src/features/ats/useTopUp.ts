/**
 * The live top-up a search starts when few companies match (F6 plan §1.5):
 * polls GET /tasks/{id} every 2 s for up to 30 s (paused while the tab is
 * hidden), shows it in the activity tray, and re-runs the search when done.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useActivity } from "../../app/activity";
import { atsKeys, getTopUp } from "./atsApi";

export const TOPUP_POLL_MS = 2_000;
const TOPUP_MAX_MS = 30_000;

export type TopUpState =
  | { phase: "idle" }
  | { phase: "running"; progress: string }
  | { phase: "done"; added: number }
  | { phase: "stopped" };

export function useTopUp(taskId: string | null | undefined, query: string): TopUpState {
  const qc = useQueryClient();
  const { track } = useActivity();
  const startedAt = useRef(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    startedAt.current = Date.now();
    setExpired(false);
    if (!taskId) return;
    const t = window.setTimeout(() => setExpired(true), TOPUP_MAX_MS);
    return () => window.clearTimeout(t);
  }, [taskId]);

  const task = useQuery({
    queryKey: ["ats", "topup", taskId],
    queryFn: () => getTopUp(taskId!),
    enabled: Boolean(taskId) && !expired,
    refetchInterval: (q) =>
      q.state.data?.status === "completed" || q.state.data?.status === "failed"
        ? false
        : TOPUP_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const status = task.data?.status;
  const result = task.data?.result as { added?: number } | null | undefined;
  const added = result?.added ?? 0;

  useEffect(() => {
    if (!taskId) return;
    const label = `Checking career pages for “${query}”`;
    if (status === "completed") {
      track({
        id: taskId,
        kind: "task",
        label,
        status: "completed",
        detail: added ? `Found ${added} more jobs` : "No new jobs found",
        href: `/ats-targets?q=${encodeURIComponent(query)}`,
      });
      void qc.invalidateQueries({ queryKey: ["ats", "search"] });
      void qc.invalidateQueries({ queryKey: atsKeys.stats });
    } else if (status === "failed" || expired || task.isError) {
      track({ id: taskId, kind: "task", label, status: "failed", detail: "Stopped checking" });
    } else {
      track({
        id: taskId,
        kind: "task",
        label,
        status: "running",
        detail: task.data?.progress ?? "Checking up to 40 more companies live",
        href: `/ats-targets?q=${encodeURIComponent(query)}`,
      });
    }
  }, [taskId, query, status, added, expired, task.isError, task.data?.progress, track, qc]);

  if (!taskId) return { phase: "idle" };
  if (status === "completed") return { phase: "done", added };
  if (status === "failed" || expired || task.isError) return { phase: "stopped" };
  return { phase: "running", progress: task.data?.progress ?? "" };
}
