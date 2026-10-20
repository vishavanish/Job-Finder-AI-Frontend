/**
 * Dashboard (spec §6.2, F5 plan §1.5): the funnel (applied → acknowledged →
 * assessment → interview → offer, rejected separately), this week, what needs
 * the user (emails to review, apply runs waiting), recent changes and quick
 * actions. Every number links to the list behind it.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { errorMessage } from "../../lib/api/errors";
import { applyKeys, listRuns } from "../apply/applyApi";
import { formatDate, sourceLabel } from "../tracker/stages";
import { getStats, listApplications, listGmailAccounts, trackerKeys } from "../tracker/trackerApi";
import "../tracker/tracker.css";
import "./dashboard.css";

const FUNNEL = [
  { key: "applied", label: "Applied", to: "/tracker" },
  { key: "acknowledged", label: "Acknowledged", to: "/tracker?status=acknowledged" },
  { key: "assessment", label: "Assessment", to: "/tracker?status=assessment" },
  { key: "interview", label: "Interview", to: "/tracker?status=interview" },
  { key: "offer", label: "Offer", to: "/tracker?status=offer" },
] as const;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function DashboardPage() {
  const stats = useQuery({ queryKey: trackerKeys.stats, queryFn: getStats });
  const recent = useQuery({
    queryKey: trackerKeys.applications({}),
    queryFn: () => listApplications({}),
  });
  const waiting = useQuery({
    queryKey: applyKeys.waitingCount,
    queryFn: () => listRuns("waiting", undefined, 1),
    retry: false,
  });
  const accounts = useQuery({
    queryKey: trackerKeys.accounts,
    queryFn: listGmailAccounts,
    retry: false,
  });

  const s = stats.data;
  const applied = s?.funnel.applied ?? 0;
  const changes = [...(recent.data?.applications ?? [])]
    .sort((a, b) => (b.updated_at ?? b.date).localeCompare(a.updated_at ?? a.date))
    .slice(0, 5);
  const runsWaiting = waiting.data?.total ?? 0;
  const noGmail = accounts.data && accounts.data.configured && accounts.data.accounts.length === 0;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Where your applications stand and what needs you.</p>
        </div>
      </div>

      {stats.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(stats.error, "Couldn't load your numbers.")}{" "}
          <button type="button" className="link-button" onClick={() => void stats.refetch()}>
            Try again
          </button>
        </p>
      ) : stats.isLoading ? (
        <div className="tracker-skeleton" role="status" aria-label="Loading your numbers">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : applied === 0 ? (
        <div className="card dashboard-empty">
          <h3>No applications yet</h3>
          <p>
            Start with a search: <Link to="/jobs">find jobs</Link> that match your profile, then
            apply from the job card. Every application shows up here.
          </p>
        </div>
      ) : (
        <div className="dashboard-grid">
          <section className="card" aria-labelledby="funnel-h">
            <h3 id="funnel-h">Funnel</h3>
            <ol className="funnel">
              {FUNNEL.map((f) => {
                const n = s?.funnel[f.key] ?? 0;
                return (
                  <li key={f.key} className="funnel-row">
                    <Link to={f.to} className="funnel-label">
                      {f.label}
                    </Link>
                    <span className="funnel-bar" aria-hidden="true">
                      <span
                        style={{ width: `${applied && n ? Math.max(2, (n / applied) * 100) : 0}%` }}
                      />
                    </span>
                    <Link to={f.to} className="funnel-count num" aria-label={`${f.label}: ${n}`}>
                      {n}
                    </Link>
                  </li>
                );
              })}
            </ol>
            <p className="funnel-rejected">
              <Link to="/tracker?status=rejected">
                {plural(s?.rejected ?? 0, "rejection", "rejections")}
              </Link>
            </p>
            <p className="field-hint">
              Counts every application that got at least this far, so an interview also counts as
              acknowledged. The list behind a number shows those at that stage now.
            </p>
          </section>

          <section className="card" aria-labelledby="needs-h">
            <h3 id="needs-h">Needs you</h3>
            <ul className="dashboard-list">
              <li>
                <Link to="/tracker?tab=review">
                  {plural(s?.needs_review ?? 0, "email needs review", "emails need review")}
                </Link>
              </li>
              <li>
                <Link to="/apply">
                  {plural(runsWaiting, "application needs you", "applications need you")} in the
                  Apply Center
                </Link>
              </li>
            </ul>
            <h3>This week</h3>
            <p>
              <Link
                to={`/tracker?since=${new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)}`}
                className="dashboard-big num"
              >
                {s?.this_week ?? 0}
              </Link>{" "}
              applied in the last 7 days · <Link to="/tracker">{s?.total ?? 0} in total</Link>
            </p>
          </section>

          <section className="card dashboard-recent" aria-labelledby="recent-h">
            <h3 id="recent-h">Recent changes</h3>
            {recent.isError ? (
              <p className="login-error" role="alert">
                {errorMessage(recent.error, "Couldn't load recent changes.")}
              </p>
            ) : (
              <ul className="dashboard-list">
                {changes.map((r) => (
                  <li key={r.id} className="recent-row">
                    <Link to={`/tracker/${r.id}`}>
                      {r.company} — {r.title}
                    </Link>
                    <span className="recent-meta">
                      <StatusBadge status={r.status} />
                      <span className="field-hint">
                        {sourceLabel(r.status_source)} · {formatDate(r.updated_at ?? r.date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className="dashboard-actions" aria-label="Quick actions">
        <Link to="/jobs" className="btn-run">
          Find jobs
        </Link>
        <Link to="/apply" className="btn-secondary">
          Apply Center
        </Link>
        <Link to="/tracker" className="btn-secondary">
          Tracker
        </Link>
        {noGmail && (
          <Link to="/tracker?tab=gmail" className="btn-secondary">
            Connect Gmail
          </Link>
        )}
      </section>
    </div>
  );
}
