/**
 * One job (spec §6.3): score ring + the AI's one-sentence reason, match
 * breakdown, freshness and applicant count, every source it was found on,
 * Save / Hide, and the four apply buttons (F4: Manual, Fast, Auto, Email),
 * which the backend's apply_options enable or explain. Statuses keep Opened,
 * Prefilled and Submitted apart (audit B6). Job text is rendered as plain text.
 */
import { useId, useState } from "react";
import { Icon } from "../../components/Icon";
import { ScoreRing } from "../../components/ScoreRing";
import { errorMessage } from "../../lib/api/errors";
import type { StreamedJob } from "../../lib/api/types";
import { ApplyButtons } from "../apply/ApplyButtons";

export type JobUiState = "seen" | "saved" | "hidden" | "applied";

export interface ApplyGate {
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
        <p className="match-skills">
          <strong className="num">
            {m.skills_matched.length} of {m.skills_total}
          </strong>{" "}
          of your skills mentioned
          {m.skills_matched.map((s) => (
            <span key={s} className="skill-chip">
              {s}
            </span>
          ))}
        </p>
      )}
      <ul className="match-facts">
        {m.title_fit !== null && m.title_fit !== undefined && (
          <li>
            Title fit <span className="num match-strong">{m.title_fit}%</span>
          </li>
        )}
        {m.seniority && <li>{SENIORITY[m.seniority] ?? m.seniority}</li>}
        {m.missing_required && m.missing_required.length > 0 && (
          <li className="match-missing">Asks for: {m.missing_required.join(", ")}</li>
        )}
        {m.skills_total > 0 &&
          m.skills_matched.length === m.skills_total &&
          !m.missing_required?.length && (
            <li className="match-complete">
              <Icon name="check" size={14} />
              No missing skills
            </li>
          )}
      </ul>
    </div>
  );
}

export function JobCard({
  job,
  state,
  sources,
  applyGate,
  onSave,
  onHide,
  onUnsave,
  onApplied,
}: {
  job: StreamedJob;
  state: JobUiState;
  sources?: string[];
  /** The auto_apply entitlement: Auto and Fast apply need it. */
  applyGate: ApplyGate;
  onSave: () => Promise<unknown>;
  onHide: () => Promise<unknown>;
  onUnsave: () => Promise<unknown>;
  onApplied: (status: "submitted" | "emailed") => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
  const top = (job.llm_score ?? 0) >= 90;

  return (
    <li
      className={`job-card${state === "hidden" ? " is-hidden" : ""}${top ? " is-top" : ""}`}
      aria-labelledby={`${id}-t`}
    >
      <div className="job-card-top">
        <ScoreRing score={job.llm_score} size={52} />
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
            <span className="job-company">
              <span className="job-logo" aria-hidden="true">
                {job.company.charAt(0).toUpperCase()}
              </span>
              {job.company}
            </span>
            {job.location && (
              <span className={"job-fact" + (/remote/i.test(job.location) ? " is-remote" : "")}>
                <Icon name={/remote/i.test(job.location) ? "globe" : "mapPin"} size={14} />
                {job.location}
              </span>
            )}
          </p>
          <p className="job-meta">
            <span className="job-fact">
              <Icon name="clock" size={14} />
              {ago(job.posted_hours_ago, job.posted)}
            </span>
            {job.applicants ? (
              <span className="job-fact">
                <span className="num">{job.applicants}</span> applicants
              </span>
            ) : null}
            <span className="sources">
              {allSources.map((s) => (
                <span key={s} className="source-badge">
                  {s}
                </span>
              ))}
            </span>
          </p>
        </div>
        <div className="job-corner">
          {state === "saved" ? (
            <button
              type="button"
              className="icon-btn is-on"
              disabled={busy}
              aria-label="Unsave"
              title="Unsave"
              onClick={() => void act(onUnsave, "Couldn't update.")}
            >
              <Icon name="bookmark" size={18} />
            </button>
          ) : !applied && state !== "hidden" ? (
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label="Save"
              title="Save"
              onClick={() => void act(onSave, "Couldn't save.")}
            >
              <Icon name="bookmark" size={18} />
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
              className="icon-btn"
              disabled={busy}
              aria-label="Hide"
              title="Hide"
              onClick={() => void act(onHide, "Couldn't hide.")}
            >
              <Icon name="eyeOff" size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {job.llm_reason && (
        <p className="job-reason">
          <Icon name="sparkle" size={16} />
          <span>
            <strong>AI fit:</strong> {job.llm_reason}
          </span>
        </p>
      )}
      <Breakdown job={job} />

      {!applied && state !== "hidden" && (
        <div className="job-apply">
          <ApplyButtons
            job={job}
            applied={applied}
            entitlement={applyGate}
            onApplied={onApplied}
            onNotInterested={onHide}
          />
        </div>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
