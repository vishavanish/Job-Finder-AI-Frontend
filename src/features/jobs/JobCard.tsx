/**
 * One job (spec §6.3): score ring + the AI's one-sentence reason, match
 * breakdown, freshness and applicant count, every source it was found on,
 * Save / Hide, and the two apply buttons side by side. Auto apply only opens
 * and prefills (LinkedIn) — it says "Prefilled", never "Applied" (audit B6).
 * Job text is rendered as plain text.
 */
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ScoreRing } from "../../components/ScoreRing";
import { errorMessage } from "../../lib/api/errors";
import type { StreamedJob } from "../../lib/api/types";
import { getTask } from "./jobsApi";

export type JobUiState = "seen" | "saved" | "hidden" | "applied";

export interface AutoApplyGate {
  allowed: boolean;
  reason: string;
}

function ago(hours: number | null | undefined, fallback: string): string {
  if (hours === null || hours === undefined) return fallback || "Posting date unknown";
  if (hours < 1) return "Posted less than an hour ago";
  if (hours < 24) return `Posted ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Posted ${days} day${days === 1 ? "" : "s"} ago`;
}

const SENIORITY: Record<string, string> = {
  match: "Seniority fits",
  stretch: "A step up for you",
  overqualified: "Below your level",
};

function Breakdown({ job }: { job: StreamedJob }) {
  const m = job.match;
  if (!m) return null;
  return (
    <div className="match">
      {m.skills_total > 0 && (
        <p>
          <strong className="num">
            {m.skills_matched.length} of {m.skills_total}
          </strong>{" "}
          of your skills mentioned
          {m.skills_matched.length > 0 && (
            <span className="match-list"> · {m.skills_matched.join(", ")}</span>
          )}
        </p>
      )}
      <ul className="match-facts">
        {m.title_fit !== null && m.title_fit !== undefined && (
          <li>
            Title fit <span className="num">{m.title_fit}%</span>
          </li>
        )}
        {m.seniority && <li>{SENIORITY[m.seniority] ?? m.seniority}</li>}
        {m.missing_required && m.missing_required.length > 0 && (
          <li className="match-missing">Asks for: {m.missing_required.join(", ")}</li>
        )}
      </ul>
    </div>
  );
}

function ApplyStatus({ taskId }: { taskId: string }) {
  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
    refetchInterval: (q) =>
      q.state.data && ["completed", "failed"].includes(q.state.data.status) ? false : 2500,
  });
  const status = task.data?.status;
  if (status === "completed")
    return (
      <span className="badge tone-progress" role="status">
        Prefilled — finish in the browser
      </span>
    );
  if (status === "failed") {
    return (
      <span className="badge tone-negative" role="status">
        Couldn't open the job: {task.data?.error ?? "try again"}
      </span>
    );
  }
  return (
    <span className="badge tone-active" role="status">
      Opening and prefilling…
    </span>
  );
}

export function JobCard({
  job,
  state,
  sources,
  autoApply,
  onSave,
  onHide,
  onUnsave,
  onAutoApply,
  onMarkApplied,
}: {
  job: StreamedJob;
  state: JobUiState;
  sources?: string[];
  autoApply: AutoApplyGate;
  onSave: () => Promise<unknown>;
  onHide: () => Promise<unknown>;
  onUnsave: () => Promise<unknown>;
  onAutoApply: () => Promise<string>;
  onMarkApplied: () => Promise<unknown>;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [applyTask, setApplyTask] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const allSources = sources?.length ? sources : [job.source];
  const applied = state === "applied";

  return (
    <li className={`job-card${state === "hidden" ? " is-hidden" : ""}`} aria-labelledby={`${id}-t`}>
      <ScoreRing score={job.llm_score} />
      <div className="job-body">
        <div className="job-head">
          <h3 id={`${id}-t`} className="job-title">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              {job.title}
            </a>
          </h3>
          <div className="job-badges">
            {job.early && <span className="badge tone-positive">Early</span>}
            {job.new_since_last_search && <span className="badge tone-active">New</span>}
            {state === "saved" && <span className="badge tone-neutral">Saved</span>}
            {applied && <span className="badge tone-progress">Applied</span>}
          </div>
        </div>
        <p className="job-meta">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        <p className="job-meta">
          {ago(job.posted_hours_ago, job.posted)}
          {job.applicants ? (
            <>
              {" "}
              · <span className="num">{job.applicants}</span> applicants
            </>
          ) : null}
          {" · "}
          <span className="sources">
            {allSources.map((s) => (
              <span key={s} className="source-badge">
                {s}
              </span>
            ))}
          </span>
        </p>
        {job.llm_reason && <p className="job-reason">{job.llm_reason}</p>}
        <Breakdown job={job} />

        <div className="job-actions">
          <span className="apply-pair">
            <button
              type="button"
              className="btn-apply"
              disabled={!autoApply.allowed || busy || applied || Boolean(applyTask)}
              aria-describedby={!autoApply.allowed ? `${id}-why` : undefined}
              onClick={() =>
                void act(
                  async () => setApplyTask(await onAutoApply()),
                  "Couldn't start auto apply.",
                )
              }
            >
              Auto apply
            </button>
            <a
              className="btn-secondary"
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
            >
              Apply manually
            </a>
          </span>
          {(opened || state === "saved") && !applied && (
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => void act(onMarkApplied, "Couldn't mark it as applied.")}
            >
              Mark as applied
            </button>
          )}
          {state === "saved" ? (
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => void act(onUnsave, "Couldn't update.")}
            >
              Unsave
            </button>
          ) : !applied && state !== "hidden" ? (
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => void act(onSave, "Couldn't save.")}
            >
              Save
            </button>
          ) : null}
          {state === "hidden" ? (
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => void act(onUnsave, "Couldn't update.")}
            >
              Show again
            </button>
          ) : !applied ? (
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => void act(onHide, "Couldn't hide.")}
            >
              Hide
            </button>
          ) : null}
        </div>
        {!autoApply.allowed && !applied && (
          <p className="field-hint" id={`${id}-why`}>
            {autoApply.reason}
          </p>
        )}
        {applyTask && <ApplyStatus taskId={applyTask} />}
        {opened && !applied && (
          <p className="field-hint">
            Opened the job page in a new tab. Come back and mark it once you've applied.
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
