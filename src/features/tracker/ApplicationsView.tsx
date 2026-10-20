/**
 * The tracker's application list (F5 plan §1.1): server-side filters kept in
 * the URL (status, company, source, applied since), a client-side search over
 * role and company, and a table or kanban view remembered on this device.
 */
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { statusLabel } from "../../components/status";
import { errorMessage } from "../../lib/api/errors";
import type { ApplicationLogEntry } from "../../lib/api/types";
import { readPref, writePref } from "../../lib/storage";
import { STAGES, formatDate, sourceLabel, stageOf, type StageId } from "./stages";
import { TRACKER_LIMIT, getStats, listApplications, trackerKeys } from "./trackerApi";

type View = "table" | "kanban";
const VIEW_PREF = "jf_tracker_view";
const FILTER_KEYS = ["status", "company", "source", "since"] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return out;
}

const TableView = memo(function TableView({ rows }: { rows: ApplicationLogEntry[] }) {
  return (
    <div className="tracker-table-wrap">
      <table className="data-table tracker-table">
        <caption className="sr-only">Applications</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Source</th>
            <th scope="col">Applied</th>
            <th scope="col">Status</th>
            <th scope="col">Last change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Role">
                <Link to={`/tracker/${r.id}`} className="job-title-cell">
                  {r.title || "Untitled role"}
                </Link>
                <div className="job-company-cell">{r.company}</div>
              </td>
              <td data-label="Source">
                <span className="source-badge">{r.source || "Unknown"}</span>
              </td>
              <td data-label="Applied">{formatDate(r.date)}</td>
              <td data-label="Status">
                <StatusBadge status={r.status} />
              </td>
              <td data-label="Last change">
                <span className="field-hint">
                  {sourceLabel(r.status_source)}
                  {r.updated_at ? ` · ${formatDate(r.updated_at)}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const KanbanView = memo(function KanbanView({ rows }: { rows: ApplicationLogEntry[] }) {
  const baseId = useId();
  const columns = useMemo(() => {
    const by = new Map<StageId, ApplicationLogEntry[]>(STAGES.map((s) => [s.id, []]));
    for (const r of rows) by.get(stageOf(r.status))!.push(r);
    return by;
  }, [rows]);
  return (
    <div className="kanban" role="region" aria-label="Applications by stage">
      {STAGES.map((s) => {
        const items = columns.get(s.id) ?? [];
        const headId = `${baseId}-${s.id}`;
        return (
          <section key={s.id} className="kanban-col" aria-labelledby={headId}>
            <h3 id={headId} className="kanban-head">
              {s.label} <span className="kanban-count">{items.length}</span>
            </h3>
            {items.length === 0 ? (
              <p className="kanban-empty">None</p>
            ) : (
              <ul className="kanban-list">
                {items.map((r) => (
                  <li key={r.id} className="kanban-card">
                    <Link to={`/tracker/${r.id}`} className="kanban-title">
                      {r.title || "Untitled role"}
                    </Link>
                    <span className="job-company-cell">{r.company}</span>
                    <span className="kanban-meta">
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="field-hint">
                      {sourceLabel(r.status_source)} · {formatDate(r.updated_at ?? r.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
});

export function ApplicationsView() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() =>
    readPref(VIEW_PREF) === "kanban" ? "kanban" : "table",
  );
  const [search, setSearch] = useState("");
  const [companyDraft, setCompanyDraft] = useState(params.get("company") ?? "");
  const company = useDebounced(companyDraft, 400);
  const ids = useId();

  const filters = useMemo(
    () => ({
      status: params.get("status") ?? "",
      company: params.get("company") ?? "",
      source: params.get("source") ?? "",
      since: params.get("since") ?? "",
    }),
    [params],
  );

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    if (company !== filters.company) setFilter("company", company.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the debounced value drives this
  }, [company]);

  const apps = useQuery({
    queryKey: trackerKeys.applications(filters),
    queryFn: () => listApplications(filters),
  });
  const stats = useQuery({ queryKey: trackerKeys.stats, queryFn: getStats });

  const statusOptions = Object.keys(stats.data?.by_status ?? {}).sort();
  if (filters.status && !statusOptions.includes(filters.status)) statusOptions.push(filters.status);
  const sourceOptions = Object.keys(stats.data?.by_source ?? {}).sort();
  if (filters.source && !sourceOptions.includes(filters.source)) sourceOptions.push(filters.source);

  const rows = useMemo(() => {
    const all = apps.data?.applications ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((r) => `${r.title} ${r.company}`.toLowerCase().includes(q)) : all;
  }, [apps.data, search]);

  const filtered = FILTER_KEYS.some((k) => filters[k]) || search.trim() !== "";
  const clear = () => {
    setSearch("");
    setCompanyDraft("");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of FILTER_KEYS) next.delete(k);
        return next;
      },
      { replace: true },
    );
  };
  const chooseView = (v: View) => {
    setView(v);
    writePref(VIEW_PREF, v);
  };

  return (
    <div className="tracker-apps">
      <div className="tracker-filters" role="search" aria-label="Filter applications">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            value={search}
            placeholder="Role or company"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Any status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Company</span>
          <input value={companyDraft} onChange={(e) => setCompanyDraft(e.target.value)} />
        </label>
        <label className="field">
          <span>Source</span>
          <select value={filters.source} onChange={(e) => setFilter("source", e.target.value)}>
            <option value="">Any source</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Applied since</span>
          <input
            type="date"
            value={filters.since}
            onChange={(e) => setFilter("since", e.target.value)}
          />
        </label>
        <div className="tracker-view-switch" role="group" aria-label="View">
          {(["table", "kanban"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? "btn-small is-active" : "btn-small"}
              aria-pressed={view === v}
              onClick={() => chooseView(v)}
            >
              {v === "table" ? "Table" : "Kanban"}
            </button>
          ))}
        </div>
      </div>

      {apps.isLoading ? (
        <div className="tracker-skeleton" role="status" aria-label="Loading applications">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      ) : apps.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(apps.error, "Couldn't load your applications.")}{" "}
          <button type="button" className="link-button" onClick={() => void apps.refetch()}>
            Try again
          </button>
        </p>
      ) : rows.length === 0 ? (
        filtered ? (
          <p className="empty-state">
            No applications match these filters.{" "}
            <button type="button" className="link-button" onClick={clear}>
              Clear filters
            </button>
          </p>
        ) : (
          <p className="empty-state">
            No applications yet. Find a job in <Link to="/jobs">Jobs</Link> and apply — it shows up
            here with every step.
          </p>
        )
      ) : (
        <>
          <p className="field-hint" id={`${ids}-count`} aria-live="polite">
            {rows.length === 1 ? "1 application" : `${rows.length} applications`}
            {(apps.data?.total ?? 0) > TRACKER_LIMIT &&
              ` · showing the latest ${TRACKER_LIMIT} of ${apps.data?.total}`}
            {filtered && (
              <>
                {" · "}
                <button type="button" className="link-button" onClick={clear}>
                  Clear filters
                </button>
              </>
            )}
          </p>
          {view === "table" ? <TableView rows={rows} /> : <KanbanView rows={rows} />}
        </>
      )}
    </div>
  );
}
