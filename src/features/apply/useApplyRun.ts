/**
 * One apply run, polled every 3 s while the worker is moving it (queued,
 * preparing, submitting) and mirrored in the activity tray. TanStack Query
 * stops polling while the tab is hidden.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useActivity, type ActivityStatus } from "../../app/activity";
import type { ApplyRun } from "../../lib/api/types";
import { applyKeys, getRun, isRunMoving, listRuns, WAITING_STATES } from "./applyApi";

export const RUN_POLL_MS = 3000;

function trayStatus(run: ApplyRun): ActivityStatus {
  if (run.state === "queued") return "queued";
  if (run.state === "submitted" || run.state === "done") return "completed";
  if (run.state === "failed") return "failed";
  if (run.state === "cancelled") return "cancelled";
  return "running";
}

export function trayDetail(run: ApplyRun): string {
  if ((WAITING_STATES as readonly string[]).includes(run.state))
    return `Needs you — ${run.message ?? ""}`.trim();
  return run.message ?? "";
}

export function useApplyRun(runId: string | null | undefined, initial?: ApplyRun) {
  const { track } = useActivity();
  const qc = useQueryClient();
  const lastState = useRef<string | undefined>(undefined);
  const query = useQuery({
    queryKey: applyKeys.run(runId ?? ""),
    queryFn: () => getRun(runId!),
    enabled: Boolean(runId),
    initialData: initial,
    refetchInterval: (q) => (isRunMoving(q.state.data?.state) ? RUN_POLL_MS : false),
  });
  const run = query.data;

  useEffect(() => {
    if (!run) return;
    track({
      id: `apply-${run.id}`,
      kind: "apply",
      label: `${run.mode === "fast" ? "Fast apply" : "Auto apply"}: ${run.title}`,
      status: trayStatus(run),
      detail: trayDetail(run),
      href: `/apply/runs/${run.id}`,
    });
    // A run that changes state changes the lists and the "needs you" count.
    if (lastState.current !== undefined && lastState.current !== run.state) {
      void qc.invalidateQueries({ queryKey: ["apply", "runs"] });
    }
    lastState.current = run.state;
  }, [run, track, qc]); // query results keep their identity while unchanged (structural sharing)

  return query;
}

/** Recent runs, shared by every job card (one request for the whole feed). */
export function useRecentRuns() {
  return useQuery({
    queryKey: applyKeys.runs("recent"),
    queryFn: () => listRuns(undefined, undefined, 200),
  });
}
