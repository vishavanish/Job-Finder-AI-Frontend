/**
 * Apply Center (spec §6.4, F4 plan §1.3, F4.1): runs that need you, runs in
 * progress, history, the answer bank and apply settings. A header with the
 * counts, a glass card with today's usage against the caps, pill tabs with
 * counts, and one card per run. The tab lives in the URL (?tab=) so other
 * screens can link straight to it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GlassHero, ProgressRing, StatePill } from "../../components/KitExtras";
import { EmptyState, PageHeader, StatChip } from "../../components/PageKit";
import { errorMessage } from "../../lib/api/errors";
import type { ApplyRun, ApplySettings } from "../../lib/api/types";
import { AiBusyBanner } from "../models/AiBusyBanner";
import { AnswerBankPanel } from "./AnswerBankPanel";
import { CompanyAvatar, SiteChip } from "./ApplyBits";
import { ApplySettingsPanel } from "./ApplySettingsPanel";
import {
  ACTIVE_STATES,
  HISTORY_STATES,
  WAITING_STATES,
  applyKeys,
  cancelApplyRun,
  getApplySettings,
  isRunMoving,
  listRuns,
  runSteps,
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

const ACTION: Record<string, string> = {
  awaiting_input: "Answer",
  awaiting_review: "Review",
  needs_user: "Finish",
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function MiniSteps({ run }: { run: ApplyRun }) {
  const pages = runSteps(run).length;
  if (pages < 2) return null;
  return (
    <span className="mini-steps" title={`${pages} form pages read`}>
      {Array.from({ length: pages }, (_, i) => (
        <span key={i} className="mini-step" aria-hidden="true" />
      ))}
      <span className="field-hint">{pages} pages</span>
    </span>
  );
}

function RunRow({ run, onCancel }: { run: ApplyRun; onCancel?: () => Promise<unknown> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needs = (WAITING_STATES as readonly string[]).includes(run.state);
  return (
    <li className={`run-card${needs ? " is-hot" : ""}`}>
      <CompanyAvatar company={run.company} />
      <div className="run-card-main">
        <div className="run-card-top">
          <Link to={`/apply/runs/${run.id}`} className="run-title">
            {run.title}
          </Link>
          <SiteChip adapter={run.adapter} mode={run.mode} />
        </div>
        <span className="job-meta">
          {run.company} · {run.mode === "fast" ? "Fast apply" : "Auto apply"}
        </span>
        <p className="run-row-status">
          <StatePill status={run.state} />{" "}
          <span className="field-hint">{NEXT_STEP[run.state] ?? run.message ?? ""}</span>
        </p>
        <MiniSteps run={run} />
      </div>
      <div className="run-card-side">
        <span className="field-hint">{when(run.updated_at)}</span>
        <div className="run-card-actions">
          <Link
            className={needs ? "btn-run" : "btn-small"}
            to={`/apply/runs/${run.id}`}
            aria-label={`${ACTION[run.state] ?? "Open"}: ${run.title}`}
          >
            {ACTION[run.state] ?? "Open"}
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
      <div className="run-skeletons" role="status" aria-label="Loading…">
        <span />
        <span />
        <span />
      </div>
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
      <EmptyState
        icon={tab === "needs" ? "check" : tab === "progress" ? "send" : "history"}
        title={
          tab === "needs"
            ? "Nothing needs you right now."
            : tab === "progress"
              ? "Nothing in progress."
              : "No finished applications yet."
        }
      >
        {tab === "progress" && (
          <p>
            Start one with <strong>Auto apply</strong> on a job in <Link to="/jobs">Jobs</Link>.
          </p>
        )}
        {tab === "needs" && <p>When a form needs an answer or your OK, it shows up here.</p>}
      </EmptyState>
    );
  return (
    <ul className="run-list run-cards kit-rise" aria-live="polite">
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

function UsageHero({ s }: { s: ApplySettings }) {
  const u = s.usage_today as {
    auto_submitted?: number;
    by_platform?: Record<string, number>;
    fast?: number;
  };
  const c = s.caps as { auto_per_day?: number; fast_per_day?: number; generic_per_day?: number };
  return (
    <GlassHero className="apply-hero">
      <div className="apply-hero-rings">
        <ProgressRing used={u.auto_submitted ?? 0} max={c.auto_per_day ?? 20} label="Auto apply" />
        <ProgressRing
          used={u.by_platform?.generic ?? 0}
          max={c.generic_per_day ?? 5}
          label="AI form reader"
        />
        <ProgressRing used={u.fast ?? 0} max={c.fast_per_day ?? 25} label="Fast apply" />
      </div>
      <p className="apply-hero-note">
        {s.paused ? (
          <strong>Auto apply is paused.</strong>
        ) : (
          <>
            Submits go out between {String(s.hours_start).padStart(2, "0")}:00 and{" "}
            {String(s.hours_end % 24).padStart(2, "0")}:00, 30–90 seconds apart.
          </>
        )}{" "}
        {s.allow_generic && !s.generic_submit_enabled && (
          <span className="apply-hero-test">
            AI form reader is in test mode — you press Submit.
          </span>
        )}
      </p>
    </GlassHero>
  );
}

export default function ApplyCenterPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "needs") as TabId;
  const select = (id: TabId) => setParams(id === "needs" ? {} : { tab: id }, { replace: true });

  const waiting = useQuery({
    queryKey: applyKeys.runs("waiting"),
    queryFn: () => listRuns("waiting"),
  });
  const recent = useQuery({
    queryKey: applyKeys.runs("recent"),
    queryFn: () => listRuns(undefined, undefined, 200),
  });
  const settings = useQuery({ queryKey: applyKeys.settings, queryFn: getApplySettings });

  const needs = waiting.data?.runs.length ?? 0;
  const moving = (recent.data?.runs ?? []).filter((r) => ACTIVE_STATES.includes(r.state)).length;
  const weekAgo = Date.now() - 7 * 86400_000;
  const sent = (recent.data?.runs ?? []).filter(
    (r) =>
      (r.state === "submitted" || r.state === "done") &&
      new Date(r.submitted_at ?? r.updated_at).getTime() >= weekAgo,
  ).length;
  const counts: Partial<Record<TabId, number>> = { needs, progress: moving };

  return (
    <div className="apply-page apply-center">
      <PageHeader
        eyebrow="Apply Center"
        title="Your applications, on autopilot"
        sub="Auto apply fills the form and waits for your OK. Anything it can't do safely comes back to you here."
      >
        <StatChip dot={needs > 0 ? "accent" : undefined} icon={needs > 0 ? undefined : "check"}>
          <strong className="num">{needs}</strong> need you
        </StatChip>
        <StatChip icon="spinner">
          <strong className="num">{moving}</strong> in progress
        </StatChip>
        <StatChip dot="positive">
          <strong className="num">{sent}</strong> sent this week
        </StatChip>
        <Link className="btn-run" to="/jobs">
          Find jobs
        </Link>
      </PageHeader>
      {settings.data && <UsageHero s={settings.data} />}
      <AiBusyBanner task="resume_tailor" what="tailored resumes and cover letters" />
      <div className="tabs jobs-tabs apply-tabs" role="tablist" aria-label="Apply Center">
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
            {counts[t.id] ? (
              <span className="num tab-count" aria-hidden="true">
                {counts[t.id]}
              </span>
            ) : null}
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
