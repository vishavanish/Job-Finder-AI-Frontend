// src/context/RunContext.jsx
import { createContext, useContext, useRef, useState, useCallback } from "react";
import { runPipeline, pollTask, closeApplyBrowser, cancelTask, startPipelineStream, getPipelineRunJobs, } from "../api/client";
import { errorMessage } from "../lib/api/errors";
import { useActivity } from "../app/activity";

const RunContext = createContext(null);

export function RunProvider({ children }) {
  const { track } = useActivity();
  const [status, setStatus] = useState("idle"); // idle | running | completed | failed | cancelled
  const [progressLog, setProgressLog] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState(null);
  const [applyTaskId, setApplyTaskId] = useState(null);
  const [applyStatus, setApplyStatus] = useState("idle"); // idle | running | completed | failed | cancelled
  const [applyError, setApplyError] = useState("");

  const lastProgress = useRef("");
  const activeTaskId = useRef(null);
  const activeApplyTaskId = useRef(null);

  const logProgress = useCallback((msg) => {
    if (!msg || msg === lastProgress.current) return;
    lastProgress.current = msg;
    setProgressLog((prev) => [...prev.slice(-30), msg]);
  }, []);

  const run = useCallback(
    async (payload) => {
      setStatus("running");
      setError("");
      setJobs([]);
      setProgressLog([]);
      setTaskId(null);
      setApplyTaskId(null);
      setApplyStatus("idle");
      setApplyError("");
      lastProgress.current = "";

      const localTaskId = Symbol("run"); // guards against a stale/older run overwriting a newer one
      activeTaskId.current = localTaskId;

      try {
        const { data } = await runPipeline(payload);
        const pipelineTaskId = data.task_id;
        setTaskId(pipelineTaskId);
        logProgress("Pipeline started — searching, then scoring...");

        const finalTask = await pollTask(pipelineTaskId, {
          intervalMs: 2500,
          maxAttempts: 600,
          onUpdate: (t) => {
            if (activeTaskId.current === localTaskId) logProgress(t.progress);
          },
        });

        // a newer run() call superseded this one while we were polling
        if (activeTaskId.current !== localTaskId) return;

        if (finalTask.status === "revoked" || finalTask.status === "cancelled") {
          setStatus("cancelled");
          logProgress("Pipeline cancelled.");
          return;
        }

        if (finalTask.status === "failed") {
          setStatus("failed");
          setError(finalTask.error || "Pipeline failed.");
          return;
        }

        const rankedJobs = finalTask.result?.score_result?.ranked_jobs || [];
        setJobs(rankedJobs);
        setStatus("completed");
        logProgress(`Done — ${rankedJobs.length} matching job(s) found.`);

        // pipeline's apply config (if any) now runs as a SEPARATE Celery
        // task — result.apply_task_id, not an inline apply_result.
        const applyId = finalTask.result?.apply_task_id || null;
        if (applyId) {
          setApplyTaskId(applyId);
          setApplyStatus("running");
          activeApplyTaskId.current = applyId;
          logProgress("Apply task dispatched — opening browser for top matches...");

          pollTask(applyId, { intervalMs: 2000 })
            .then((finalApply) => {
              if (activeApplyTaskId.current !== applyId) return;
              if (finalApply.status === "revoked" || finalApply.status === "cancelled") {
                setApplyStatus("cancelled");
                logProgress("Apply task cancelled.");
              } else if (finalApply.status === "failed") {
                setApplyStatus("failed");
                setApplyError(finalApply.error || "Apply task failed.");
              } else {
                setApplyStatus("completed");
                logProgress("Apply task completed — browser left open for review if not headless.");
              }
            })
            .catch((err) => {
              if (activeApplyTaskId.current !== applyId) return;
              setApplyStatus("failed");
              setApplyError(errorMessage(err));
            });
        }
      } catch (err) {
        if (activeTaskId.current !== localTaskId) return;
        setStatus("failed");
        setError(
          errorMessage(err)
        );
      }
    },
    [logProgress]
  );

  // Streaming variant: dispatches a Celery group (one task per keyword,
  // run in parallel), then polls a Redis-backed endpoint that returns
  // whatever jobs have been scored SO FAR. Jobs appear in the `jobs`
  // array incrementally, while other keywords are still running —
  // unlike run() above, which only ever sets `jobs` once, at the very
  // end, from one big blocking task result.
  //
  // NOTE: taskId here is a Redis-keyed run_id, NOT a Celery task_id.
  // cancelRun() below calls cancelTask(taskId), which only understands
  // real Celery task ids — under streaming mode that call will silently
  // no-op against a run_id Celery doesn't recognize. A proper fix needs
  // a backend endpoint that revokes every task_id in the group by
  // run_id; until that exists, treat Cancel as non-functional while a
  // streaming run is in progress.
  const runStream = useCallback(
    async (payload) => {
      setStatus("running");
      setError("");
      setJobs([]);
      setProgressLog([]);
      setTaskId(null);
      setApplyTaskId(null);
      setApplyStatus("idle");
      setApplyError("");
      lastProgress.current = "";

      const localTaskId = Symbol("run-stream");
      let trackedRunId = null;
      activeTaskId.current = localTaskId;

      try {
        const { data } = await startPipelineStream(payload);
        const runId = data.run_id;
        setTaskId(runId); // reused as the "current run" id for UI purposes
        logProgress("Pipeline dispatched — jobs will appear as they're found and scored.");
        trackedRunId = runId;
        track({ id: runId, kind: "search", label: "Job search", status: "running", detail: "Searching and scoring…", href: "/" });

        let offset = 0;
        let done = false;

        while (!done) {
          if (activeTaskId.current !== localTaskId) return; // superseded by a newer run

          await new Promise((r) => setTimeout(r, 2000));
          if (activeTaskId.current !== localTaskId) return; // check again after the wait

          const { data: page } = await getPipelineRunJobs(runId, offset);

          if (page.jobs.length > 0) {
            setJobs((prev) => [...prev, ...page.jobs]);
            offset += page.jobs.length;
            logProgress(`+${page.jobs.length} job(s) found — ${offset} total so far`);
            track({ id: runId, detail: `${offset} matching job(s) so far` });
          }

          if (page.run_status === "completed" || page.run_status === "failed" || page.run_status === "cancelled") {
            done = true;
            if (page.run_status === "failed") {
              setStatus("failed");
              setError("One or more keyword searches failed — check server logs for details.");
              track({ id: runId, status: "failed", detail: `${offset} job(s) found before a keyword search failed` });
            } else if (page.run_status === "cancelled") {
              setStatus("cancelled");
              logProgress("Search cancelled.");
              track({ id: runId, status: "cancelled", detail: `${offset} job(s) found before it stopped` });
            } else {
              track({ id: runId, status: "completed", detail: `${offset} matching job(s)` });
              setStatus("completed");
              logProgress(`Done — ${offset} matching job(s) found.`);
            }
          }
        }
      } catch (err) {
        if (activeTaskId.current !== localTaskId) return;
        if (trackedRunId) track({ id: trackedRunId, status: "failed", detail: errorMessage(err) });
        setStatus("failed");
        setError(
          errorMessage(err)
        );
      }
    },
    [logProgress, track]
  );

  // Cancels the running pipeline/search task (safe — no browser involved
  // unless the pipeline's apply step has already started as its own task).
  const cancelRun = useCallback(async () => {
    if (!taskId) return;
    try {
      await cancelTask(taskId);
      logProgress("Cancel requested for pipeline task.");
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }, [taskId, logProgress]);

  // Cancels the apply task specifically. NOTE: this can terminate
  // Playwright mid-flight and leave a browser context open without
  // running close_browser() — prefer closeBrowser() when the apply task
  // has already completed and you just want to close review tabs.
  const cancelApply = useCallback(async () => {
    if (!applyTaskId) return;
    try {
      await cancelTask(applyTaskId);
      logProgress("Cancel requested for apply task.");
      return true;
    } catch (err) {
      setApplyError(errorMessage(err));
      return false;
    }
  }, [applyTaskId, logProgress]);

  const closeBrowser = useCallback(async () => {
    if (!applyTaskId) return;
    try {
      const { data } = await closeApplyBrowser(applyTaskId);
      logProgress(
        data.closed
          ? "Browser closed."
          : `Browser not closed: ${data.reason || "unknown reason"}`
      );
      return data;
    } catch (err) {
      setApplyError(
        errorMessage(err)
      );
    }
  }, [applyTaskId, logProgress]);

  const reset = useCallback(() => {
    activeTaskId.current = null;
    activeApplyTaskId.current = null;
    setStatus("idle");
    setProgressLog([]);
    setJobs([]);
    setError("");
    setTaskId(null);
    setApplyTaskId(null);
    setApplyStatus("idle");
    setApplyError("");
  }, []);

  return (
    <RunContext.Provider
      value={{
        status,
        progressLog,
        jobs,
        error,
        run,
        runStream,
        reset,
        taskId,
        cancelRun,
        applyTaskId,
        applyStatus,
        applyError,
        closeBrowser,
        cancelApply,
      }}
    >
      {children}
    </RunContext.Provider>
  );
}

export function useRun() {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within RunProvider");
  return ctx;
}