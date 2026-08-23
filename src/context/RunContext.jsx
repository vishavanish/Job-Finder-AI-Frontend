// src/context/RunContext.jsx
import { createContext, useContext, useRef, useState, useCallback } from "react";
import { runPipeline, pollTask, closeApplyBrowser } from "../api/client.js";

const RunContext = createContext(null);

export function RunProvider({ children }) {
  const [status, setStatus] = useState("idle"); // idle | running | completed | failed
  const [progressLog, setProgressLog] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [applyTaskId, setApplyTaskId] = useState(null);
  const [applyStatus, setApplyStatus] = useState("idle"); // idle | running | completed | failed
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
      setApplyTaskId(null);
      setApplyStatus("idle");
      setApplyError("");
      lastProgress.current = "";

      const localTaskId = Symbol("run"); // guards against a stale/older run overwriting a newer one
      activeTaskId.current = localTaskId;

      try {
        const { data } = await runPipeline(payload);
        const taskId = data.task_id;
        logProgress("Pipeline started — searching, then scoring...");

        const finalTask = await pollTask(taskId, {
          intervalMs: 2500,
          maxAttempts: 600,
          onUpdate: (t) => {
            if (activeTaskId.current === localTaskId) logProgress(t.progress);
          },
        });

        // a newer run() call superseded this one while we were polling
        if (activeTaskId.current !== localTaskId) return;

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
              if (finalApply.status === "failed") {
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
              setApplyError(err.authError || err.rateLimitError || err.message);
            });
        }
      } catch (err) {
        if (activeTaskId.current !== localTaskId) return;
        setStatus("failed");
        setError(
          err.authError ||
            err.rateLimitError ||
            err?.response?.data?.detail ||
            err.message
        );
      }
    },
    [logProgress]
  );

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
        err.authError || err.rateLimitError || err?.response?.data?.detail || err.message
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
        reset,
        applyTaskId,
        applyStatus,
        applyError,
        closeBrowser,
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