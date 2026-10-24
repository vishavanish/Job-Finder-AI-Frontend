/**
 * Apply Center (spec §6.4, F4 plan §1.3): runs that need you, runs in
 * progress, history, the answer bank and apply settings. The tab lives in the
 * URL (?tab=) so other screens can link straight to it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { errorMessage } from "../../lib/api/errors";
import type { ApplyRun } from "../../lib/api/types";
import { AiBusyBanner } from "../models/AiBusyBanner";
import { AnswerBankPanel } from "./AnswerBankPanel";
import { ApplySettingsPanel } from "./ApplySettingsPanel";
import {
  ACTIVE_STATES,
  HISTORY_STATES,
  applyKeys,
  cancelApplyRun,
  isRunMoving,
  listRuns,
} from "./applyApi";
import { RUN_POLL_MS } from "./useApplyRun";
import "../jobs/jobs.css"; // shared tabs
import "./apply.css";

const TABS = [
  { id: "needs", label: "Needs you" },
  { id: "progress", label: "In progress" },
  { id: "history", label: "History" },
  { id: "answers", label: "Answer bank" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const NEXT_STEP: Record<string, string> = {
  awaiting_input: "Answer the questions it couldn't",
  awaiting_review: "Review the answers and submit",
  needs_user: "Finish this one on the job page",
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function RunRow({ run, onCancel }: { run: ApplyRun; onCancel?: () => Promise<unknown> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="run-row">
      <div className="run-row-main">
        <Link to={`/apply/runs/${run.id}`} className="run-title">
          {run.title}
        </Link>
        <span className="job-meta">
          {" "}
          · {run.company} · {run.mode === "fast" ? "Fast apply" : "Auto apply"}
        </span>
        <p className="run-row-status">
          <StatusBadge status={run.state} />{" "}
          <span className="field-hint">{NEXT_STEP[run.state] ?? run.message ?? ""}</span>
        </p>
      </div>
      <div className="run-row-side">
        <span className="field-hint">{when(run.updated_at)}</span>
        <Link className="btn-small" to={`/apply/runs/${run.id}`}>
          Open
        </Link>
        {onCancel && (
          <button
            type="button"
            className="btn-small"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              onCancel()
                .catch((err) => setError(errorMessage(err, "Couldn't cancel.")))
                .finally(() => setBusy(false));
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function RunsTab({ tab }: { tab: "needs" | "progress" | "history" }) {
  const qc = useQueryClient();
  const runs = useQuery({
    queryKey: tab === "needs" ? applyKeys.runs("waiting") : applyKeys.runs("recent"),
    queryFn: () => (tab === "needs" ? listRuns("waiting") : listRuns(undefined, undefined, 200)),
    refetchInterval: (q) =>
      tab === "progress" && q.state.data?.runs.some((r) => isRunMoving(r.state))
        ? RUN_POLL_MS
        : false,
  });
  const cancel = useMutation({
    mutationFn: cancelApplyRun,
    onSuccess: () => void qc.invalidateQueries({ queryKey: applyKeys.all }),
  });

  const all = runs.data?.runs ?? [];
  const list =
    tab === "needs"
      ? all
      : all.filter((r) => (tab === "progress" ? ACTIVE_STATES : HISTORY_STATES).includes(r.state));

  if (runs.isLoading)
    return (
      <p className="empty-state" role="status">
        Loading…
      </p>
    );
  if (runs.isError)
    return (
      <p className="login-error" role="alert">
        {errorMessage(runs.error, "Couldn't load apply runs.")}{" "}
        <button type="button" className="link-button" onClick={() => void runs.refetch()}>
          Try again
        </button>
      </p>
    );
  if (list.length === 0)
    return (
      <p className="empty-state">
        {tab === "needs" && "Nothing needs you right now."}
        {tab === "progress" && (
          <>
            Nothing in progress. Start one with <strong>Auto apply</strong> on a job in{" "}
            <Link to="/jobs">Jobs</Link>.
          </>
        )}
        {tab === "history" && "No finished applications yet."}
      </p>
    );
  return (
    <ul className="run-list" aria-live="polite">
      {list.map((r) => (
        <RunRow
          key={r.id}
          run={r}
          onCancel={
            [...ACTIVE_STATES, "awaiting_input", "awaiting_review"].includes(r.state)
              ? () => cancel.mutateAsync(r.id)
              : undefined
          }
        />
      ))}
    </ul>
  );
}

export default function ApplyCenterPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "needs") as TabId;
  const select = (id: TabId) => setParams(id === "needs" ? {} : { tab: id }, { replace: true });

  return (
    <div className="apply-page">
      <div className="page-header">
        <div>
          <h2>Apply Center</h2>
          <p>
            Auto apply fills Greenhouse and Lever forms and submits only after you approve each one.
            Anything it can't do safely comes back to you here.
          </p>
        </div>
      </div>
      <AiBusyBanner task="resume_tailor" what="tailored resumes and cover letters" />
      <div className="tabs" role="tablist" aria-label="Apply Center">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`apply-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="apply-panel"
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section id="apply-panel" role="tabpanel" aria-labelledby={`apply-tab-${tab}`}>
        {(tab === "needs" || tab === "progress" || tab === "history") && <RunsTab tab={tab} />}
        {tab === "answers" && <AnswerBankPanel />}
        {tab === "settings" && <ApplySettingsPanel />}
      </section>
    </div>
  );
}
