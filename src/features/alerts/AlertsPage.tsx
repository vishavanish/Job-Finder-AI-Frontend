/**
 * Job alerts (backend P3.2): a search profile that runs once a day at the
 * user's local hour and emails new matches above a minimum score, to the
 * sign-in email or a connected Gmail account. Shows the
 * next run, run history and each run's new jobs; "Run now" counts against
 * the daily job_alerts quota.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ScoreRing } from "../../components/ScoreRing";
import { errorMessage } from "../../lib/api/errors";
import { useEntitlement } from "../../lib/auth/access";
import type { AlertIn, AlertOut, AlertRunOut } from "../../lib/api/types";
import { listSearchProfiles, searchProfileKeys } from "../search-profile/searchProfileApi";
import {
  alertKeys,
  createAlert,
  deleteAlert,
  getAlertRunJobs,
  listAlertRuns,
  listAlerts,
  runAlertNow,
  updateAlert,
} from "./alertsApi";
import "../profile/profile.css";
import "../jobs/jobs.css";

const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
})();

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function AlertForm({
  initial,
  profiles,
  emailOptions,
  onDone,
}: {
  initial: AlertOut | null;
  profiles: { id: string; name: string }[];
  /** Sign-in email first, then connected Gmail accounts. */
  emailOptions: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [a, setA] = useState<AlertIn>(
    initial
      ? {
          name: initial.name,
          search_profile_id: initial.search_profile_id,
          hour_local: initial.hour_local,
          timezone: initial.timezone,
          min_score: initial.min_score,
          email_digest: initial.email_digest,
          email_to: initial.email_to ?? null,
          enabled: initial.enabled,
        }
      : {
          name: "Daily matches",
          search_profile_id: profiles[0]?.id ?? "",
          hour_local: 9,
          timezone: BROWSER_TZ,
          min_score: 75,
          email_digest: true,
          email_to: null,
          enabled: true,
        },
  );
  const login = emailOptions[0] ?? "";
  // A Gmail that was disconnected since shows as the sign-in email, which is where it goes now.
  const sendTo = a.email_to && emailOptions.includes(a.email_to) ? a.email_to : login;
  const save = useMutation({
    mutationFn: () => (initial ? updateAlert(initial.id, a) : createAlert(a)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: alertKeys.all });
      onDone();
    },
  });
  const set = (patch: Partial<AlertIn>) => setA((prev) => ({ ...prev, ...patch }));
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h3>{initial ? `Edit "${initial.name}"` : "New alert"}</h3>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input
            required
            maxLength={100}
            value={a.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Search profile</span>
          <select
            value={a.search_profile_id}
            onChange={(e) => set({ search_profile_id: e.target.value })}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Run every day at</span>
          <select
            value={a.hour_local}
            onChange={(e) => set({ hour_local: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Time zone</span>
          <input
            value={a.timezone}
            maxLength={64}
            onChange={(e) => set({ timezone: e.target.value })}
          />
        </label>
        <label className="field">
          <span>
            Only jobs scoring at least <span className="num">{a.min_score}</span>
          </span>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={a.min_score}
            onChange={(e) => set({ min_score: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="check-inline">
        <input
          type="checkbox"
          checked={a.email_digest}
          onChange={(e) => set({ email_digest: e.target.checked })}
        />
        Email me the new matches
      </label>
      {a.email_digest && login && (
        <div className="form-grid">
          <label className="field">
            <span>Send to</span>
            <select
              value={sendTo}
              onChange={(e) => set({ email_to: e.target.value === login ? null : e.target.value })}
            >
              {emailOptions.map((address, i) => (
                <option key={address} value={address}>
                  {i === 0 ? `${address} (sign-in)` : address}
                </option>
              ))}
            </select>
            {emailOptions.length === 1 && (
              <span className="field-hint">
                To use another Gmail address, <Link to="/tracker">connect it in Tracker</Link>.
              </span>
            )}
          </label>
        </div>
      )}
      <label className="check-inline">
        <input
          type="checkbox"
          checked={a.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Alert is on
      </label>
      {save.isError && (
        <p className="login-error" role="alert">
          {errorMessage(save.error, "Couldn't save the alert.")}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : initial ? "Save changes" : "Create alert"}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RunJobs({ run }: { run: AlertRunOut }) {
  const jobs = useQuery({
    queryKey: alertKeys.runJobs(run.id),
    queryFn: () => getAlertRunJobs(run.id),
  });
  if (jobs.isLoading)
    return (
      <p className="field-hint" role="status">
        Loading…
      </p>
    );
  if (jobs.isError)
    return (
      <p className="login-error" role="alert">
        {errorMessage(jobs.error, "Couldn't load these jobs.")}
      </p>
    );
  return (
    <ul className="mini-jobs">
      {jobs.data?.jobs.map((j) => (
        <li key={j.id}>
          <ScoreRing score={j.llm_score} size={32} />
          <a href={j.url} target="_blank" rel="noopener noreferrer">
            {j.title}
          </a>
          <span className="job-meta">
            {" "}
            · {j.company}
            {j.applicants ? ` · ${j.applicants} applicants` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const RUN_LABEL: Record<string, string> = {
  running: "Running",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

function Runs({ alert }: { alert: AlertOut }) {
  const runs = useQuery({
    queryKey: alertKeys.runs(alert.id),
    queryFn: () => listAlertRuns(alert.id),
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "running") ? 4000 : false),
  });
  const [open, setOpen] = useState<string | null>(null);
  if (runs.isLoading)
    return (
      <p className="field-hint" role="status">
        Loading runs…
      </p>
    );
  if (runs.isError)
    return (
      <p className="login-error" role="alert">
        {errorMessage(runs.error, "Couldn't load runs.")}
      </p>
    );
  if (!runs.data?.runs.length) return <p className="field-hint">No runs yet.</p>;
  return (
    <ul className="run-list">
      {runs.data.runs.map((r) => (
        <li key={r.id}>
          <span
            className={`badge tone-${r.status === "done" ? "progress" : r.status === "failed" ? "negative" : r.status === "running" ? "active" : "neutral"}`}
          >
            {RUN_LABEL[r.status] ?? r.status}
          </span>{" "}
          {when(r.started_at)} · {r.trigger === "manual" ? "Run now" : "Scheduled"} ·{" "}
          <span className="num">{r.new_jobs}</span> new job{r.new_jobs === 1 ? "" : "s"}
          {r.emailed_at ? " · emailed" : ""}
          {r.error && <span className="field-hint"> · {r.error}</span>}
          {r.new_jobs > 0 && (
            <button
              type="button"
              className="link-button run-jobs-toggle"
              aria-expanded={open === r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              {open === r.id ? "Hide jobs" : "Show jobs"}
            </button>
          )}
          {open === r.id && <RunJobs run={r} />}
        </li>
      ))}
    </ul>
  );
}

function AlertRow({
  alert,
  profileName,
  onEdit,
}: {
  alert: AlertOut;
  profileName: string;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const runNow = useMutation({
    mutationFn: () => runAlertNow(alert.id),
    // The run's progress shows in this alert's history (it refreshes while a run is going).
    onSuccess: () => {
      setShowRuns(true);
      void qc.invalidateQueries({ queryKey: alertKeys.runs(alert.id) });
    },
  });
  return (
    <li className="alert-row">
      <div className="alert-main">
        <span className="source-name">{alert.name}</span>
        {!alert.enabled && <span className="badge tone-muted">Off</span>}
        <p className="source-desc">
          {profileName} · every day at {hourLabel(alert.hour_local)} ({alert.timezone}) · score{" "}
          {alert.min_score}+{alert.email_digest ? ` · emailed to ${alert.sends_to}` : ""}
        </p>
        <p className="source-desc">
          {alert.enabled ? `Next run ${when(alert.next_run_at)}` : "Won't run while it's off"}
          {alert.last_run_at ? ` · last run ${when(alert.last_run_at)}` : ""}
        </p>
        {runNow.isSuccess && (
          <p className="flash-ok" role="status">
            Started. New matches appear below when it finishes.
          </p>
        )}
        {runNow.isError && (
          <p className="login-error" role="alert">
            {errorMessage(runNow.error, "Couldn't start the alert.")}
          </p>
        )}
        <button
          type="button"
          className="link-button"
          aria-expanded={showRuns}
          onClick={() => setShowRuns(!showRuns)}
        >
          {showRuns ? "Hide history" : "Show history"}
        </button>
        {showRuns && <Runs alert={alert} />}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn-small"
          disabled={runNow.isPending}
          onClick={() => runNow.mutate()}
        >
          {runNow.isPending ? "Starting…" : "Run now"}
        </button>
        <button type="button" className="btn-small" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn-danger-small" onClick={() => setConfirm(true)}>
          Delete
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title={`Delete "${alert.name}"?`}
          confirmLabel="Delete alert"
          danger
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await deleteAlert(alert.id);
            await qc.invalidateQueries({ queryKey: alertKeys.all });
          }}
        >
          It stops running and its history is removed. Jobs it found stay in your lists.
        </ConfirmDialog>
      )}
    </li>
  );
}

export default function AlertsPage() {
  const id = useId();
  const ent = useEntitlement("job_alerts");
  const alerts = useQuery({ queryKey: alertKeys.all, queryFn: listAlerts });
  const profiles = useQuery({ queryKey: searchProfileKeys.all, queryFn: listSearchProfiles });
  const [editing, setEditing] = useState<AlertOut | "new" | null>(null);
  const list = alerts.data?.alerts ?? [];
  const max = alerts.data?.max_alerts ?? 3;
  const profileList = profiles.data?.profiles ?? [];
  const names = Object.fromEntries(profileList.map((p) => [p.id, p.name]));

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h2>Job alerts</h2>
          <p>
            Each alert runs one search profile once a day and sends you only jobs you haven't seen,
            above your minimum score.
          </p>
        </div>
      </div>
      {!ent.allowed && (
        <p className="login-error" role="alert">
          {ent.reason}
        </p>
      )}
      {(alerts.isLoading || profiles.isLoading) && (
        <p className="empty-state" role="status">
          Loading your alerts…
        </p>
      )}
      {alerts.isError && (
        <p className="login-error" role="alert">
          {errorMessage(alerts.error, "Couldn't load your alerts.")}{" "}
          <button type="button" className="link-button" onClick={() => void alerts.refetch()}>
            Try again
          </button>
        </p>
      )}

      {editing && (
        <AlertForm
          initial={editing === "new" ? null : editing}
          profiles={profileList}
          emailOptions={alerts.data?.email_options ?? []}
          onDone={() => setEditing(null)}
        />
      )}

      {alerts.isSuccess && profiles.isSuccess && (
        <section className="card" aria-labelledby={`${id}-h`}>
          <h3 id={`${id}-h`}>
            Your alerts{" "}
            <span className="count-note">
              {list.length} of {max}
            </span>
          </h3>
          {profileList.length === 0 ? (
            <p className="empty-state">
              Alerts run a search profile. <Link to="/search-profile">Create one first</Link>.
            </p>
          ) : list.length === 0 ? (
            <p className="empty-state">
              No alerts yet. Create one to get new matches every morning.
            </p>
          ) : (
            <ul className="source-list">
              {list.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  profileName={names[a.search_profile_id] ?? "Deleted profile"}
                  onEdit={() => setEditing(a)}
                />
              ))}
            </ul>
          )}
          {profileList.length > 0 && !editing && (
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={!ent.allowed || list.length >= max}
                title={list.length >= max ? `You can keep up to ${max} alerts` : undefined}
                onClick={() => setEditing("new")}
              >
                New alert
              </button>
            </div>
          )}
          {list.length >= max && (
            <p className="field-hint">You've reached {max} alerts. Delete one to add another.</p>
          )}
        </section>
      )}
    </div>
  );
}
