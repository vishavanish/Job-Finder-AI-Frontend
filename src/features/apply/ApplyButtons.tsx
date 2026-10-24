/**
 * The four apply buttons on a job card (F4 plan §1.1), enabled or disabled
 * only by the backend's `apply_options` — the reason for a disabled button is
 * the server's. Auto / Fast apply start an apply run (levels, caps and the
 * risk notice are checked on click, by the backend); the card then shows the
 * run's live state with a link to the review screen. On a phone the disabled
 * buttons fold under "More ways to apply". Only an apply path that works gets
 * the primary style, and "Mark as applied" is on the card itself, so a job
 * opened from its title can still be recorded (QA1 §5).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { ApplyOption, ApplyRun, StreamedJob } from "../../lib/api/types";
import { applyKeys, markApplied, startApplyRun } from "./applyApi";
import { PrepDialog } from "./PrepDialog";
import { useApplyRun, useRecentRuns } from "./useApplyRun";
import "./apply.css";

type Kind = "manual" | "fast" | "auto" | "email";
const LABELS: Record<Kind, string> = {
  manual: "Apply manually",
  fast: "Fast apply",
  auto: "Auto apply",
  email: "Email apply",
};
const MANUAL_ONLY: ApplyOption = { available: true, reason: null };
const UNKNOWN: ApplyOption = { available: false, reason: "Not available for this job." };
/** Error codes that are fixed in Apply settings. */
const SETTINGS_CODES = new Set([
  "risk_notice_required",
  "level_off",
  "apply_paused",
  "level_not_allowed",
]);

function RunChip({ run }: { run: ApplyRun }) {
  const { data } = useApplyRun(run.id, run);
  const r = data ?? run;
  return (
    <p className="run-chip" role="status" aria-live="polite">
      <StatusBadge status={r.state} />{" "}
      <Link to={`/apply/runs/${r.id}`}>
        {r.state === "awaiting_review"
          ? "Review and submit"
          : r.state === "awaiting_input" || r.state === "needs_user"
            ? "Open — it needs you"
            : "See progress"}
      </Link>
      {r.message && <span className="field-hint"> {r.message}</span>}
    </p>
  );
}

export function ApplyButtons({
  job,
  applied,
  entitlement,
  onApplied,
  onNotInterested,
}: {
  job: StreamedJob;
  applied: boolean;
  /** The auto_apply entitlement (Auto and Fast apply need it). */
  entitlement: { allowed: boolean; reason: string };
  onApplied: (status: "submitted" | "emailed") => void;
  onNotInterested: () => Promise<unknown>;
}) {
  const id = useId();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"manual" | "email" | null>(null);
  const recent = useRecentRuns();
  const latest = recent.data?.runs.find((r) => r.job_id === job.id && r.state !== "cancelled");

  const start = useMutation({
    mutationFn: (mode: "auto" | "fast") => startApplyRun(job.id, mode),
    onSuccess: (run) => {
      qc.setQueryData(applyKeys.run(run.id), run);
      void qc.invalidateQueries({ queryKey: applyKeys.all });
    },
  });
  const run = start.data ?? latest;
  const mark = useMutation({
    mutationFn: () => markApplied(job.id, "manual"),
    onSuccess: () => onApplied("submitted"),
  });

  const opts = job.apply_options;
  const option = (k: Kind): ApplyOption => {
    if (!opts) return k === "manual" ? MANUAL_ONLY : UNKNOWN;
    const o = opts[k];
    if ((k === "auto" || k === "fast") && o.available && !entitlement.allowed) {
      return { available: false, reason: entitlement.reason };
    }
    return o;
  };
  const busy = start.isPending || Boolean(run && run.state !== "failed");

  const click = (k: Kind) => {
    if (k === "manual" || k === "email") setDialog(k);
    else start.mutate(k);
  };

  const kinds: Kind[] = ["manual", "fast", "auto", "email"];
  const usable = kinds.filter((k) => option(k).available);
  const blocked = kinds.filter((k) => !option(k).available);

  const button = (k: Kind) => {
    const o = option(k);
    const disabled = !o.available || applied || ((k === "auto" || k === "fast") && busy);
    return (
      <button
        key={k}
        type="button"
        className={
          (k === "auto" && o.available) || (k === "manual" && !option("auto").available)
            ? "btn-apply"
            : "btn-secondary"
        }
        disabled={disabled}
        title={!o.available ? (o.reason ?? undefined) : undefined}
        aria-describedby={!o.available ? `${id}-${k}` : undefined}
        onClick={() => click(k)}
      >
        {LABELS[k]}
      </button>
    );
  };

  const err = start.error;
  return (
    <div className="apply-buttons">
      <div className="apply-row">
        {usable.map(button)}
        {!applied && (
          <button
            type="button"
            className="link-button mark-applied"
            disabled={mark.isPending}
            onClick={() => mark.mutate()}
          >
            Mark as applied
          </button>
        )}
      </div>
      {blocked.length > 0 && (
        <details className="apply-more">
          <summary>More ways to apply</summary>
          <div className="apply-row">{blocked.map(button)}</div>
          <ul className="apply-reasons">
            {blocked.map((k) => (
              <li key={k} id={`${id}-${k}`}>
                <strong>{LABELS[k]}:</strong> {option(k).reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {run && <RunChip run={run} />}
      {mark.isError && (
        <p className="login-error" role="alert">
          {errorMessage(mark.error, "Couldn't mark it as applied.")}
        </p>
      )}
      {err && (
        <p className="login-error" role="alert">
          {errorMessage(err, "Couldn't start applying.")}{" "}
          {err instanceof ApiError && err.code && SETTINGS_CODES.has(err.code) && (
            <Link to="/apply?tab=settings">Open Apply settings</Link>
          )}
        </p>
      )}
      {dialog && (
        <PrepDialog
          job={job}
          mode={dialog}
          onClose={() => setDialog(null)}
          onApplied={onApplied}
          onNotInterested={onNotInterested}
        />
      )}
    </div>
  );
}
