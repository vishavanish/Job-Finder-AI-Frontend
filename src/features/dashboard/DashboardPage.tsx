/**
 * Dashboard (spec §6.2, F5 plan §1.5): the funnel (applied → acknowledged →
 * assessment → interview → offer, rejected separately), this week, what needs
 * the user (emails to review, apply runs waiting), the active pipeline and
 * quick actions. Every number links to the list behind it.
 *
 * Layout follows the Stitch "Performance Optimized Dashboard" design: header
 * with stat chips, funnel card beside a "Needs you" + weekly velocity column,
 * and an active pipeline table underneath. Only real numbers are shown.
 */
import { useId, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { errorMessage } from "../../lib/api/errors";
import type { ApplicationLogEntry } from "../../lib/api/types";
import { applyKeys, listRuns } from "../apply/applyApi";
import { CLOSED_STATUSES, formatDate, sourceLabel } from "../tracker/stages";
import { getStats, listApplications, listGmailAccounts, trackerKeys } from "../tracker/trackerApi";
import "../tracker/tracker.css";
import "./dashboard.css";

const FUNNEL = [
  { key: "applied", label: "Applied", hint: "Top of funnel", to: "/tracker" },
  {
    key: "acknowledged",
    label: "Acknowledged",
    hint: "Heard back",
    to: "/tracker?status=acknowledged",
  },
  {
    key: "assessment",
    label: "Assessment",
    hint: "Tests and tasks",
    to: "/tracker?status=assessment",
  },
  { key: "interview", label: "Interview", hint: "Rounds booked", to: "/tracker?status=interview" },
  { key: "offer", label: "Offer", hint: "The goal", to: "/tracker?status=offer" },
] as const;

/** Statuses that no longer move: not part of the active pipeline. */
const INACTIVE = new Set([...CLOSED_STATUSES, "ghosted"]);
const PIPELINE_ROWS = 8;
const DAY_MS = 86_400_000;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function pct(n: number, of: number) {
  return of ? Math.round((n / of) * 100) : 0;
}

/** Local YYYY-MM-DD for a Date, so days line up with the user's calendar. */
function dayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Applications per day for the last 7 days, oldest first. */
function lastSevenDays(rows: ApplicationLogEntry[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(new Date(r.date));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY_MS);
    return {
      key: dayKey(d),
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      name: d.toLocaleDateString(undefined, { weekday: "long" }),
      n: counts.get(dayKey(d)) ?? 0,
    };
  });
}

function CardHead({
  icon,
  tone,
  id,
  title,
  sub,
  children,
}: {
  icon: IconName;
  tone: "accent" | "attention";
  id: string;
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="dash-card-head">
      <span className={`dash-icon dash-icon--${tone}`} aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <div className="dash-card-title">
        <h3 id={id}>{title}</h3>
        <p>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function ActionRow({ to, n, title, sub }: { to: string; n: number; title: string; sub: string }) {
  const subId = useId();
  return (
    <Link
      to={to}
      className={"dash-action" + (n > 0 ? " is-hot" : "")}
      aria-label={title}
      aria-describedby={subId}
    >
      <span className="dash-action-count num" aria-hidden="true">
        {n}
      </span>
      <span className="dash-action-text">
        <span className="dash-action-title">{title}</span>
        <span className="dash-action-sub" id={subId}>
          {sub}
        </span>
      </span>
      <Icon name="arrowRight" size={16} />
    </Link>
  );
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
  const rejected = s?.rejected ?? 0;
  const needsReview = s?.needs_review ?? 0;
  const rows = recent.data?.applications ?? [];
  const pipeline = rows
    .filter((r) => !INACTIVE.has(r.status))
    .sort((a, b) => (b.updated_at ?? b.date).localeCompare(a.updated_at ?? a.date));
  const runsWaiting = waiting.data?.total ?? 0;
  const noGmail = accounts.data && accounts.data.configured && accounts.data.accounts.length === 0;
  const week = lastSevenDays(rows);
  const weekMax = Math.max(1, ...week.map((d) => d.n));
  const heard = s?.funnel.acknowledged ?? 0;
  const since = new Date(Date.now() - 6 * DAY_MS).toISOString().slice(0, 10);

  return (
    <div className="dashboard-page">
      <div className="page-header dash-header">
        <div>
          <span className="dash-eyebrow">
            <span className="dash-dot" aria-hidden="true" />
            Your job search
          </span>
          <h2>Dashboard</h2>
          <p>Where your applications stand and what needs you.</p>
        </div>
        {s && applied > 0 && (
          <div className="dash-chips">
            <span className="dash-chip">
              <span className="dash-dot dash-dot--positive" aria-hidden="true" />
              <strong className="num">{pipeline.length}</strong> active
            </span>
            <span className="dash-chip">
              <strong className="num">{pct(heard, applied)}%</strong> response rate
            </span>
            <Link to="/jobs" className="btn-run dash-new">
              Find jobs
            </Link>
          </div>
        )}
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
        <div className="card dash-card dashboard-empty">
          <h3>No applications yet</h3>
          <p>
            Start with a search: <Link to="/jobs">find jobs</Link> that match your profile, then
            apply from the job card. Every application shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="dash-grid">
            <section className="card dash-card dash-funnel" aria-labelledby="funnel-h">
              <CardHead
                icon="layers"
                tone="accent"
                id="funnel-h"
                title="Application funnel"
                sub="How far your applications got"
              >
                <span className="dash-pill">{plural(pipeline.length, "active", "active")}</span>
              </CardHead>

              <ol className="funnel">
                {FUNNEL.map((f, i) => {
                  const n = s?.funnel[f.key] ?? 0;
                  return (
                    <li key={f.key} className={"funnel-row" + (n === 0 ? " is-empty" : "")}>
                      <div className="funnel-line">
                        <Link to={f.to} className="funnel-label">
                          {f.label}
                        </Link>
                        <span className="funnel-hint">{f.hint}</span>
                        <span className="funnel-pct">
                          {i === 0 ? "100%" : `${pct(n, applied)}% of applied`}
                        </span>
                        <Link
                          to={f.to}
                          className="funnel-count num"
                          aria-label={`${f.label}: ${n}`}
                        >
                          {n}
                        </Link>
                      </div>
                      <span className="funnel-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${applied && n ? Math.max(2, (n / applied) * 100) : 0}%`,
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="dash-card-foot">
                <span className="funnel-rejected">
                  <span className="dash-dot dash-dot--negative" aria-hidden="true" />
                  <Link to="/tracker?status=rejected">
                    {plural(rejected, "rejection", "rejections")}
                  </Link>
                </span>
                <p className="field-hint">
                  Counts every application that got at least this far, so an interview also counts
                  as acknowledged. The list behind a number shows those at that stage now.
                </p>
              </div>
            </section>

            <div className="dash-side">
              <section className="card dash-card" aria-labelledby="needs-h">
                <CardHead
                  icon="alert"
                  tone="attention"
                  id="needs-h"
                  title="Needs you"
                  sub={
                    needsReview + runsWaiting > 0
                      ? plural(needsReview + runsWaiting, "thing to do", "things to do")
                      : "You're all caught up"
                  }
                >
                  {needsReview + runsWaiting > 0 && (
                    <span className="dash-pulse" aria-hidden="true" />
                  )}
                </CardHead>
                <div className="dash-actions-list">
                  <ActionRow
                    to="/tracker?tab=review"
                    n={needsReview}
                    title={plural(needsReview, "email needs review", "emails need review")}
                    sub="Tracker wasn't sure what these mean"
                  />
                  <ActionRow
                    to="/apply"
                    n={runsWaiting}
                    title={plural(runsWaiting, "application needs you", "applications need you")}
                    sub="Waiting in the Apply Center"
                  />
                </div>
              </section>

              <section className="card dash-card" aria-labelledby="week-h">
                <CardHead
                  icon="activity"
                  tone="accent"
                  id="week-h"
                  title="This week"
                  sub="Applications in the last 7 days"
                />
                <div className="dash-week">
                  <p className="dash-week-total">
                    <Link to={`/tracker?since=${since}`} className="dashboard-big num">
                      {s?.this_week ?? 0}
                    </Link>{" "}
                    <span>
                      applied in the last 7 days
                      <br />
                      <Link to="/tracker">{s?.total ?? 0} in total</Link>
                    </span>
                  </p>
                  <ol className="dash-spark" aria-label="Applications per day">
                    {week.map((d) => (
                      <li key={d.key} title={`${d.name}: ${d.n}`}>
                        <span className="sr-only">
                          {d.name}: {d.n}
                        </span>
                        <span className="dash-spark-bar" aria-hidden="true">
                          <span
                            style={{ height: `${d.n ? Math.max(8, (d.n / weekMax) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="dash-spark-day" aria-hidden="true">
                          {d.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </div>
          </div>

          <section className="card dash-card dash-pipeline" aria-labelledby="pipeline-h">
            <CardHead
              icon="inbox"
              tone="accent"
              id="pipeline-h"
              title="Active pipeline"
              sub="Applications still in play, latest change first"
            >
              <Link to="/tracker" className="btn-secondary dash-head-link">
                Open tracker
              </Link>
            </CardHead>
            {recent.isError ? (
              <p className="login-error" role="alert">
                {errorMessage(recent.error, "Couldn't load your applications.")}
              </p>
            ) : pipeline.length === 0 ? (
              <p className="field-hint">Nothing in play right now. Every application has closed.</p>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th scope="col">Company and role</th>
                      <th scope="col">Stage</th>
                      <th scope="col">Applied</th>
                      <th scope="col">Last change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.slice(0, PIPELINE_ROWS).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="dash-company">
                            <span className="dash-logo" aria-hidden="true">
                              {r.company.charAt(0).toUpperCase()}
                            </span>
                            <span>
                              <Link to={`/tracker/${r.id}`} className="dash-company-name">
                                {r.company}
                              </Link>
                              <span className="dash-role">{r.title}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="num">{formatDate(r.date)}</td>
                        <td className="field-hint">
                          {sourceLabel(r.status_source)} · {formatDate(r.updated_at ?? r.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pipeline.length > PIPELINE_ROWS && (
                  <p className="dash-more">
                    <Link to="/tracker">See all {pipeline.length} in the tracker</Link>
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <section className="dashboard-actions" aria-label="Quick actions">
        {applied === 0 && (
          <Link to="/jobs" className="btn-run">
            Find jobs
          </Link>
        )}
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
