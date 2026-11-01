/**
 * Follows one streaming search run (spec §5.3): polls run meta and
 * `jobs?offset=` about every 2 s, upserts entries by `id` (a `replaces`
 * entry is a better copy of a job already shown — never a second card),
 * stops on completed/failed/cancelled. A hidden tab keeps following the run,
 * only slower, and catches up the moment it is visible again: a search runs
 * until it finishes or the user presses Stop, whatever tab they are on.
 * Progress goes to the activity tray. A run the server no longer holds (404: runs live
 * 6 h) ends as "expired" instead of retrying forever.
 */
import { useEffect, useRef, useState } from "react";
import { useActivity } from "../../app/activity";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { PipelineRunMeta, RunStatus, StreamedJob } from "../../lib/api/types";
import { getRun, getRunJobs } from "./jobsApi";

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);
export const POLL_MS = 2000;
export const HIDDEN_POLL_MS = 5000;

export interface PipelineRunState {
  jobs: StreamedJob[];
  status: RunStatus | "idle" | "expired";
  meta: PipelineRunMeta | null;
  error: string;
}

export function upsertJobs(current: StreamedJob[], incoming: StreamedJob[]): StreamedJob[] {
  if (!incoming.length) return current;
  let next = [...current];
  const index = new Map(next.map((j, i) => [j.id, i]));
  const removed = new Set<string>();
  for (const job of incoming) {
    if (job.removed) {
      removed.add(job.id);
      continue;
    }
    removed.delete(job.id);
    const at = index.get(job.id);
    if (at === undefined) {
      index.set(job.id, next.length);
      next.push(job);
    } else {
      next[at] = { ...next[at], ...job };
    }
  }
  if (removed.size) next = next.filter((j) => !removed.has(j.id));
  return next;
}

/** "LinkedIn + Indeed 38 s · Scoring 12 s" — where a search spent its time (QA2 §1.4). */
export function timingSummary(timings: Record<string, number> | undefined): string {
  const parts = Object.entries(timings ?? {})
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([label, s]) => `${label} ${Math.round(s)} s`);
  return parts.join(" · ");
}

/** What the Activity tray says about a run, the same from Jobs and from any other page. */
export function runActivity(meta: PipelineRunMeta): {
  status: "running" | "completed" | "failed" | "cancelled";
  detail: string;
} {
  if (meta.status === "completed")
    return {
      status: "completed",
      detail: ["Search finished", timingSummary(meta.timings)].filter(Boolean).join(" · "),
    };
  if (meta.status === "cancelled")
    return { status: "cancelled", detail: meta.error || meta.status };
  if (meta.status === "failed") return { status: "failed", detail: meta.error || meta.status };
  return {
    status: "running",
    detail: `${meta.keywords_completed}/${meta.total_keywords} searches done`,
  };
}

export function usePipelineRun(runId: string | null): PipelineRunState {
  const { track } = useActivity();
  const [state, setState] = useState<PipelineRunState>({
    jobs: [],
    status: "idle",
    meta: null,
    error: "",
  });
  const offset = useRef(0);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    offset.current = 0;
    setState({ jobs: [], status: "running", meta: null, error: "" });
    track({
      id: runId,
      kind: "search",
      label: "Job search",
      status: "running",
      href: `/jobs?run=${encodeURIComponent(runId)}`,
    });

    const tick = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const page = await getRunJobs(runId, offset.current);
        offset.current = page.next_offset ?? offset.current + page.jobs.length;
        const meta = await getRun(runId);
        if (stopped) return;
        setState((prev) => ({
          ...prev,
          jobs: upsertJobs(prev.jobs, page.jobs),
          meta,
          status: meta.status,
          error: "",
        }));
        track({ id: runId, ...runActivity(meta) });
        if (TERMINAL.has(meta.status)) {
          stopped = true;
          return;
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 404) {
          setState((prev) => ({ ...prev, status: "expired", error: "" }));
          stopped = true;
          return;
        }
        setState((prev) => ({
          ...prev,
          error: errorMessage(err, "Lost contact with the search. Retrying…"),
        }));
      } finally {
        polling = false;
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? HIDDEN_POLL_MS : POLL_MS);
    };
    const catchUp = () => {
      if (document.hidden || stopped || polling) return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", catchUp);
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, [runId, track]);

  return state;
}
