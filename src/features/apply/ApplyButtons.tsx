/**
 * The four apply buttons on a job card (F4 plan §1.1), enabled or disabled
 * only by the backend's `apply_options` — the reason for a disabled button is
 * the server's. Auto / Fast apply start an apply run (levels, caps and the
 * risk notice are checked on click, by the backend); the card then shows the
 * run's live state with a link to the review screen. On a phone the disabled
 * buttons fold under "More ways to apply". Only an apply path that works gets
 * the primary style, and "Mark as applied" is on the card itself, so a job
 * opened from its title can still be recorded (QA1 §5). Jobs the AI form
 * reader handles carry a ✨ chip; if the reader is off, clicking Auto apply
 * offers to turn it on right there, notice first (F4.1). Fast apply with
 * the browser extension connected (backend P8b) opens the LinkedIn job in a
 * new tab, where the extension fills Easy Apply and the user submits; the
 * tab is opened on the click itself so pop-up blockers allow it, and the
 * one-time Fast apply notice is accepted right here.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SparkleChip } from "../../components/KitExtras";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { ApplyOption, ApplyRun, StreamedJob } from "../../lib/api/types";
import {
  applyKeys,
  getApplySettings,
  isGeneric,
  markApplied,
  putApplySettings,
  startApplyRun,
} from "./applyApi";
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

/** Opens a blank tab during the click (pop-up blockers allow that), pointed at the job once the run exists. */
function openBlankTab(): Window | null {
  const w = window.open("", "_blank");
  if (w) w.opener = null;
  return w;
}

/** The one-time Fast apply notice; accepting it opens the LinkedIn tab and starts the run. */
function FastNotice({
  notice,
  onCancel,
  onAccept,
  busy,
}: {
  notice: string;
  onCancel: () => void;
  onAccept: () => void;
  busy: boolean;
}) {
  const id = useId();
  const [checked, setChecked] = useState(false);
  return (
    <div className="generic-optin" role="group" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} className="generic-optin-title">
        Fast apply fills LinkedIn in your browser
      </p>
      <p className="field-hint">{notice}</p>
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I
        understand and accept this
      </label>
      <div className="apply-row">
        <button type="button" className="btn-run" disabled={!checked || busy} onClick={onAccept}>
          Accept and open LinkedIn
        </button>
        <button type="button" className="btn-small" onClick={onCancel}>
          Not now
        </button>
      </div>
    </div>
  );
}

/** "Turn on the AI form reader?" right under the buttons: the notice, a checkbox, then it starts the run. */
function GenericOptIn({
  notice,
  onCancel,
  onDone,
}: {
  notice: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const id = useId();
  const [checked, setChecked] = useState(false);
  const turnOn = useMutation({
    mutationFn: () => putApplySettings({ allow_generic: true }),
    onSuccess: (s) => {
      qc.setQueryData(applyKeys.settings, s);
      onDone();
    },
  });
  return (
    <div className="generic-optin" role="group" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} className="generic-optin-title">
        <SparkleChip /> Turn on the AI form reader?
      </p>
      <p className="field-hint">{notice}</p>
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I
        understand and accept this
      </label>
      <div className="apply-row">
        <button
          type="button"
          className="btn-run"
          disabled={!checked || turnOn.isPending}
          onClick={() => turnOn.mutate()}
        >
          Turn on and apply
        </button>
        <button type="button" className="btn-small" onClick={onCancel}>
          Not now
        </button>
      </div>
      {turnOn.isError && (
        <p className="login-error" role="alert">
          {errorMessage(turnOn.error, "Couldn't turn it on.")}
        </p>
      )}
    </div>
  );
}

function RunChip({ run }: { run: ApplyRun }) {
  const { data } = useApplyRun(run.id, run);
  const r = data ?? run;
  return (
    <p className="run-chip" role="status" aria-live="polite">
      <StatusBadge status={r.state} />{" "}
      {r.state === "in_browser" && (
        <>
          <a href={r.apply_url} target="_blank" rel="noopener noreferrer">
            Open the LinkedIn tab
          </a>
          {" · "}
        </>
      )}
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
  const [optIn, setOptIn] = useState(false);
  const [fastNotice, setFastNotice] = useState(false);
  const tab = useRef<Window | null>(null);
  const generic = isGeneric(job.apply_options?.adapter);
  const linkedin = job.apply_options?.adapter === "linkedin";
  const settings = useQuery({
    queryKey: applyKeys.settings,
    queryFn: getApplySettings,
    enabled: (generic || linkedin) && entitlement.allowed,
    staleTime: 60_000,
  });
  const viaExtension = Boolean(
    settings.data?.extension_connected && settings.data?.extension_assist,
  );
  const recent = useRecentRuns();
  const latest = recent.data?.runs.find((r) => r.job_id === job.id && r.state !== "cancelled");

  const start = useMutation({
    mutationFn: (mode: "auto" | "fast") => startApplyRun(job.id, mode),
    onSuccess: (run) => {
      qc.setQueryData(applyKeys.run(run.id), run);
      void qc.invalidateQueries({ queryKey: applyKeys.all });
      if (run.runner === "extension") {
        if (tab.current) tab.current.location.href = run.apply_url;
        else window.open(run.apply_url, "_blank", "noopener");
      } else tab.current?.close();
      tab.current = null;
    },
    onError: () => {
      tab.current?.close();
      tab.current = null;
    },
  });
  const acceptNotice = useMutation({
    mutationFn: () => putApplySettings({ accept_fast_notice: true }),
    onSuccess: (s) => {
      qc.setQueryData(applyKeys.settings, s);
      setFastNotice(false);
      start.reset();
      start.mutate("fast");
    },
    onError: () => {
      tab.current?.close();
      tab.current = null;
    },
  });
  const startFast = () => {
    if (viaExtension && !settings.data?.fast_notice_accepted_at) {
      setFastNotice(true);
      return;
    }
    if (viaExtension) tab.current = openBlankTab();
    start.mutate("fast");
  };
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
    else if (k === "auto" && generic && settings.data && !settings.data.allow_generic)
      setOptIn(true);
    else if (k === "fast") startFast();
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
  const offerOptIn =
    optIn || (start.error instanceof ApiError && start.error.code === "generic_off");
  const offerFastNotice =
    fastNotice || (start.error instanceof ApiError && start.error.code === "fast_notice_required");

  const err = start.error;
  return (
    <div className="apply-buttons">
      <div className="apply-row">
        {usable.map(button)}
        {generic && option("auto").available && <SparkleChip />}
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
      {offerOptIn && !applied && (
        <GenericOptIn
          notice={
            settings.data?.generic_notice ??
            "The AI form reader (beta) fills application forms on other career sites. Every application waits for your review."
          }
          onCancel={() => {
            setOptIn(false);
            start.reset();
          }}
          onDone={() => {
            setOptIn(false);
            start.reset();
            start.mutate("auto");
          }}
        />
      )}
      {offerFastNotice && !applied && (
        <FastNotice
          notice={
            settings.data?.fast_notice ??
            "Fast apply fills LinkedIn Easy Apply in your own browser. You check every page and click Submit yourself."
          }
          busy={acceptNotice.isPending || start.isPending}
          onCancel={() => {
            setFastNotice(false);
            start.reset();
          }}
          onAccept={() => {
            tab.current = openBlankTab();
            acceptNotice.mutate();
          }}
        />
      )}
      {err && !offerOptIn && !offerFastNotice && (
        <p className="login-error" role="alert">
          {errorMessage(err, "Couldn't start applying.")}{" "}
          {err instanceof ApiError && err.code && SETTINGS_CODES.has(err.code) && (
            <Link to="/apply?tab=settings">Open Apply settings</Link>
          )}
          {err instanceof ApiError && err.code === "extension_required" && (
            <Link to="/settings/extension">Connect the browser extension</Link>
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
