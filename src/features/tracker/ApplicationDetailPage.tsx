/**
 * Application detail (F5 plan §1.2): a vertical timeline of every status
 * change with its source (apply engine / you / an email), its note (formal
 * rejection notes included) and the email that caused it; a manual status
 * change with the full status list; and a link to the apply run, if any.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { statusLabel } from "../../components/status";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { ApplicationLogEntry, ApplicationStatus, TimelineEvent } from "../../lib/api/types";
import { applyKeys, listRuns } from "../apply/applyApi";
import {
  CLOSED_STATUSES,
  MANUAL_STATUSES,
  categoryLabel,
  formatDate,
  safeGmailUrl,
  sourceLabel,
} from "./stages";
import { getApplication, getTimeline, setApplicationStatus, trackerKeys } from "./trackerApi";
import "./tracker.css";

function TimelineStep({ event }: { event: TimelineEvent }) {
  const email = event.email;
  const gmailUrl = safeGmailUrl(email?.gmail_url);
  return (
    <li className="timeline-step" data-source={event.status_source}>
      <span className="timeline-dot" aria-hidden="true" />
      <div className="timeline-body">
        <p className="timeline-head">
          <StatusBadge status={event.status} />
          <span className="timeline-source">{sourceLabel(event.status_source)}</span>
          <time className="field-hint" dateTime={event.created_at}>
            {formatDate(event.created_at, true)}
          </time>
        </p>
        {event.note && <p className="timeline-note">{event.note}</p>}
        {email && (
          <div className="timeline-email">
            <p className="timeline-email-label">Email that caused this</p>
            <p className="timeline-email-subject">{email.subject || "(no subject)"}</p>
            <p className="field-hint">
              {email.sender} · {formatDate(email.received_at, true)}
              {email.category && ` · ${categoryLabel(email.category)}`}
            </p>
            {email.snippet && <p className="review-snippet">{email.snippet}</p>}
            {gmailUrl && (
              <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="btn-small">
                Open in Gmail
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function StatusChange({ app }: { app: ApplicationLogEntry }) {
  const qc = useQueryClient();
  const id = useId();
  const [value, setValue] = useState<ApplicationStatus | "">("");
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState("");
  const change = useMutation({
    mutationFn: (status: ApplicationStatus) => setApplicationStatus(app.id, status),
    onSuccess: (row) => {
      setSaved(`Status changed to ${statusLabel(row.status)}.`);
      setValue("");
      void qc.invalidateQueries({ queryKey: trackerKeys.all });
    },
  });
  const submit = () => {
    if (!value) return;
    setSaved("");
    if (CLOSED_STATUSES.includes(value)) setConfirming(true);
    else change.mutate(value);
  };

  return (
    <div className="card status-change">
      <h3 id={`${id}-h`}>Change status</h3>
      <p className="field-hint">
        Fix a wrong automatic change, or record something that happened outside the app.
      </p>
      <form
        className="status-change-row"
        aria-labelledby={`${id}-h`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>New status</span>
          <select
            value={value}
            onChange={(e) => setValue(e.target.value as ApplicationStatus | "")}
          >
            <option value="">Choose…</option>
            {MANUAL_STATUSES.map((s) => (
              <option key={s} value={s} disabled={s === app.status}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-run" disabled={!value || change.isPending}>
          {change.isPending ? "Saving…" : "Save status"}
        </button>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {saved}
      </p>
      {saved && (
        <p className="flash-ok" aria-hidden="true">
          {saved}
        </p>
      )}
      {change.isError && !confirming && (
        <p className="login-error" role="alert">
          {errorMessage(change.error, "Couldn't change the status.")}
        </p>
      )}
      {confirming && value && (
        <ConfirmDialog
          title={`Mark as ${statusLabel(value)}?`}
          confirmLabel={`Mark as ${statusLabel(value)}`}
          danger={value === "rejected" || value === "withdrawn"}
          onClose={() => setConfirming(false)}
          onConfirm={() => change.mutateAsync(value)}
        >
          <p>
            {app.company} — {app.title} will be closed. Email tracking never changes a closed
            application afterwards, so later replies are only noted on the timeline.
          </p>
          <p>You can still change it here by hand.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id = "" } = useParams();
  const app = useQuery({
    queryKey: trackerKeys.application(id),
    queryFn: () => getApplication(id),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  const timeline = useQuery({
    queryKey: trackerKeys.timeline(id),
    queryFn: () => getTimeline(id),
    enabled: app.isSuccess,
  });
  const runs = useQuery({
    queryKey: applyKeys.runs("recent"),
    queryFn: () => listRuns(undefined, undefined, 200),
    enabled: app.isSuccess,
    retry: false,
  });
  const run = runs.data?.runs.find((r) => r.application_id === id);

  const back = (
    <p>
      <Link to="/tracker">← All applications</Link>
    </p>
  );

  if (app.isLoading)
    return (
      <div className="tracker-page">
        {back}
        <p className="empty-state" role="status">
          Loading…
        </p>
      </div>
    );
  if (app.isError) {
    const missing = app.error instanceof ApiError && app.error.status === 404;
    return (
      <div className="tracker-page">
        {back}
        <p className={missing ? "empty-state" : "login-error"} role="alert">
          {missing
            ? "This application doesn't exist or isn't yours."
            : errorMessage(app.error, "Couldn't load this application.")}{" "}
          {!missing && (
            <button type="button" className="link-button" onClick={() => void app.refetch()}>
              Try again
            </button>
          )}
        </p>
      </div>
    );
  }
  const a = app.data!;
  const events = timeline.data?.events ?? [];

  return (
    <div className="tracker-page">
      {back}
      <div className="page-header">
        <div>
          <h2>{a.title || "Untitled role"}</h2>
          <p>
            {a.company} · <span className="source-badge">{a.source || "Unknown"}</span> · applied{" "}
            {formatDate(a.date)}
          </p>
        </div>
        <div className="detail-head-side">
          <StatusBadge status={a.status} />
          {a.url && (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              Open job page
            </a>
          )}
        </div>
      </div>

      {run && (
        <p className="field-hint">
          Applied with {run.mode === "fast" ? "Fast apply" : "Auto apply"} —{" "}
          <Link to={`/apply/runs/${run.id}`}>see its answers and screenshots</Link>.
        </p>
      )}

      <div className="detail-grid">
        <div className="card">
          <h3>Timeline</h3>
          {timeline.isLoading ? (
            <p className="empty-state" role="status">
              Loading…
            </p>
          ) : timeline.isError ? (
            <p className="login-error" role="alert">
              {errorMessage(timeline.error, "Couldn't load the timeline.")}{" "}
              <button type="button" className="link-button" onClick={() => void timeline.refetch()}>
                Try again
              </button>
            </p>
          ) : events.length === 0 ? (
            <p className="empty-state">No status changes recorded yet.</p>
          ) : (
            <ol className="timeline" aria-label="Status history, oldest first">
              {events.map((e, i) => (
                <TimelineStep key={`${e.created_at}-${i}`} event={e} />
              ))}
            </ol>
          )}
        </div>
        <StatusChange app={a} />
      </div>
    </div>
  );
}
