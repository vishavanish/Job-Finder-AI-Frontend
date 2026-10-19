/**
 * Jobs (spec §6.3): run a search from a saved search profile and watch
 * scored jobs stream in (no duplicates — entries are upserted by id), then
 * filter, sort, save, hide and apply. Saved / Applied / Hidden lists come
 * from GET /jobs. Cancel stops the run (POST /pipeline/{id}/cancel).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../lib/api/errors";
import { useEntitlement } from "../../lib/auth/access";
import type { StreamedJob } from "../../lib/api/types";
import { getProviders } from "../models/modelsApi";
import { listSearchProfiles, searchProfileKeys } from "../search-profile/searchProfileApi";
import { JobCard, type JobUiState } from "./JobCard";
import {
  cancelRun,
  jobKeys,
  listJobs,
  setJobState,
  startRun,
  userJobToCard,
  type JobListState,
  type RunStarted,
} from "./jobsApi";
import { usePipelineRun } from "./usePipelineRun";
import "./jobs.css";

type Tab = "live" | JobListState;
const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Search results" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "hidden", label: "Hidden" },
];
const POSTED_FILTERS = [
  [0, "Any time"],
  [24, "Last 24 hours"],
  [72, "Last 3 days"],
  [168, "Last week"],
] as const;

function isRemote(job: StreamedJob): boolean {
  return /remote/i.test(job.location);
}

export default function JobsPage() {
  const qc = useQueryClient();
  const id = useId();
  const search = useEntitlement("job_search");
  const scoring = useEntitlement("scoring");
  const profiles = useQuery({ queryKey: searchProfileKeys.all, queryFn: listSearchProfiles });
  const providers = useQuery({ queryKey: ["providers"], queryFn: getProviders });
  const applyGate = useEntitlement("auto_apply");

  const [tab, setTab] = useState<Tab>("live");
  const [profileId, setProfileId] = useState("");
  const [minScore, setMinScore] = useState(70);
  const [includeSeen, setIncludeSeen] = useState(false);
  const [started, setStarted] = useState<RunStarted | null>(null);
  const [states, setStates] = useState<Record<string, JobUiState>>({});
  const [filters, setFilters] = useState({
    score: 0,
    posted: 0,
    source: "",
    remote: false,
    sort: "score" as "score" | "newest",
  });

  const run = usePipelineRun(started?.run_id ?? null);
  const running = run.status === "running";
  const chosenProfile =
    profileId ||
    profiles.data?.profiles.find((p) => p.is_default)?.id ||
    profiles.data?.profiles[0]?.id ||
    "";

  const start = useMutation({
    mutationFn: () =>
      startRun({
        search_profile_id: chosenProfile,
        include_seen: includeSeen,
        thresholds: { llm_min_score_to_keep: minScore },
      }),
    onSuccess: (r) => {
      setStates({});
      setStarted(r);
      setTab("live");
    },
  });
  const cancel = useMutation({ mutationFn: () => cancelRun(started!.run_id) });

  const listQuery = useQuery({
    queryKey: jobKeys.list(tab === "live" ? "saved" : tab),
    queryFn: () => listJobs(tab === "live" ? "saved" : tab),
    enabled: tab !== "live",
  });

  const setState = (jobId: string, s: JobUiState) => setStates((prev) => ({ ...prev, [jobId]: s }));
  const refreshLists = () => void qc.invalidateQueries({ queryKey: ["jobs"] });
  const handlers = (job: StreamedJob) => ({
    onSave: async () => {
      await setJobState(job.id, "save");
      setState(job.id, "saved");
      refreshLists();
    },
    onHide: async () => {
      await setJobState(job.id, "hide");
      setState(job.id, "hidden");
      refreshLists();
    },
    onUnsave: async () => {
      await setJobState(job.id, "seen");
      setState(job.id, "seen");
      refreshLists();
    },
    onApplied: () => {
      setState(job.id, "applied");
      refreshLists();
    },
  });

  const sourcesInFeed = useMemo(
    () => [...new Set(run.jobs.map((j) => j.source))].sort(),
    [run.jobs],
  );
  const visible = useMemo(() => {
    const list = run.jobs.filter((j) => {
      if (states[j.id] === "hidden") return false;
      if ((j.llm_score ?? 0) < filters.score) return false;
      if (
        filters.posted &&
        (j.posted_hours_ago === null ||
          j.posted_hours_ago === undefined ||
          j.posted_hours_ago > filters.posted)
      )
        return false;
      if (filters.source && j.source !== filters.source) return false;
      if (filters.remote && !isRemote(j)) return false;
      return true;
    });
    return list.sort((a, b) =>
      filters.sort === "score"
        ? (b.llm_score ?? 0) - (a.llm_score ?? 0)
        : (a.posted_hours_ago ?? 1e9) - (b.posted_hours_ago ?? 1e9),
    );
  }, [run.jobs, states, filters]);

  const runnable = providers.data?.sources.filter((s) => s.available).length;
  const noProfiles = profiles.isSuccess && profiles.data.profiles.length === 0;
  const blocked = !search.allowed ? search.reason : !scoring.allowed ? scoring.reason : "";

  return (
    <div className="jobs-page">
      <div className="page-header">
        <div>
          <h2>Jobs</h2>
          <p>
            Run a search from one of your search profiles. Jobs appear as they're scored; each job
            shows once.
          </p>
        </div>
      </div>

      <section className="card run-panel" aria-labelledby={`${id}-run`}>
        <h3 id={`${id}-run`} className="sr-only">
          Run a search
        </h3>
        {noProfiles ? (
          <p className="empty-state">
            You don't have a search profile yet.{" "}
            <Link to="/search-profile">Create one in Keywords and skills</Link>.
          </p>
        ) : (
          <form
            className="run-form"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <label className="field">
              <span>Search profile</span>
              <select
                value={chosenProfile}
                onChange={(e) => setProfileId(e.target.value)}
                disabled={running}
              >
                {profiles.data?.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                Keep jobs scoring at least <span className="num">{minScore}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                disabled={running}
                onChange={(e) => setMinScore(Number(e.target.value))}
              />
            </label>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={includeSeen}
                disabled={running}
                onChange={(e) => setIncludeSeen(e.target.checked)}
              />
              Show jobs I've already seen again
            </label>
            <div className="form-actions">
              {running ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {cancel.isPending ? "Stopping…" : "Stop search"}
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn-run"
                  disabled={Boolean(blocked) || !chosenProfile || start.isPending}
                  aria-describedby={blocked ? `${id}-blocked` : undefined}
                >
                  {start.isPending ? "Starting…" : "Run search"}
                </button>
              )}
              <span className="field-hint">
                {runnable === undefined ? "" : `${runnable} job sources will run. `}
                {providers.data?.free_only ? "Free tools only is on. " : ""}
                <Link to="/providers">Job sources</Link>
              </span>
            </div>
            {blocked && (
              <p className="field-hint" id={`${id}-blocked`}>
                {blocked}
              </p>
            )}
          </form>
        )}
        {start.isError && (
          <p className="login-error" role="alert">
            {errorMessage(start.error, "Couldn't start the search.")}
          </p>
        )}
        {cancel.isError && (
          <p className="login-error" role="alert">
            {errorMessage(cancel.error, "Couldn't stop the search.")}
          </p>
        )}
        {started?.skipped_sources && started.skipped_sources.length > 0 && (
          <details className="skipped">
            <summary>
              {started.skipped_sources.length} source
              {started.skipped_sources.length === 1 ? "" : "s"} skipped
            </summary>
            <ul>
              {started.skipped_sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
        {run.meta && (
          <p className="run-progress" role="status">
            {run.status === "running" &&
              `Searching… ${run.meta.keywords_completed} of ${run.meta.total_keywords} titles done.`}
            {run.status === "completed" &&
              `Search finished: ${run.jobs.length} new matching job${run.jobs.length === 1 ? "" : "s"}.`}
            {run.status === "cancelled" &&
              `Search stopped. ${run.jobs.length} job${run.jobs.length === 1 ? "" : "s"} found before it stopped.`}
            {run.status === "failed" && `Search failed: ${run.meta.error || "try again"}.`}
          </p>
        )}
        {run.error && (
          <p className="login-error" role="alert">
            {run.error}
          </p>
        )}
      </section>

      <div className="tabs" role="tablist" aria-label="Job lists">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab is-active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "live" && run.jobs.length > 0 && (
              <span className="num"> {run.jobs.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <>
          {run.jobs.length > 0 && (
            <div className="filters" role="group" aria-label="Filter results">
              <label className="field narrow">
                <span>Min score</span>
                <select
                  value={filters.score}
                  onChange={(e) => setFilters({ ...filters, score: Number(e.target.value) })}
                >
                  {[0, 60, 70, 80, 90].map((v) => (
                    <option key={v} value={v}>
                      {v ? `${v}+` : "Any"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field narrow">
                <span>Posted</span>
                <select
                  value={filters.posted}
                  onChange={(e) => setFilters({ ...filters, posted: Number(e.target.value) })}
                >
                  {POSTED_FILTERS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field narrow">
                <span>Source</span>
                <select
                  value={filters.source}
                  onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                >
                  <option value="">All</option>
                  {sourcesInFeed.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={filters.remote}
                  onChange={(e) => setFilters({ ...filters, remote: e.target.checked })}
                />
                Remote only
              </label>
              <label className="field narrow">
                <span>Sort by</span>
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    setFilters({ ...filters, sort: e.target.value as "score" | "newest" })
                  }
                >
                  <option value="score">Best match</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {run.jobs.length ? `${run.jobs.length} jobs so far` : ""}
          </p>
          {run.status === "idle" && (
            <p className="empty-state">Run a search to see matching jobs here.</p>
          )}
          {run.status !== "idle" && run.jobs.length === 0 && !running && (
            <p className="empty-state">
              No new jobs matched. Lower the minimum score, add titles to your profile, or turn on
              more job sources.
            </p>
          )}
          {running && run.jobs.length === 0 && (
            <p className="empty-state" role="status">
              Looking for jobs… the first ones usually appear within a minute.
            </p>
          )}
          {visible.length === 0 && run.jobs.length > 0 && (
            <p className="empty-state">No jobs match these filters.</p>
          )}
          <ul className="job-list">
            {visible.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                state={states[job.id] ?? "seen"}
                applyGate={applyGate}
                {...handlers(job)}
              />
            ))}
          </ul>
        </>
      )}

      {tab !== "live" && (
        <>
          {listQuery.isLoading && (
            <p className="empty-state" role="status">
              Loading…
            </p>
          )}
          {listQuery.isError && (
            <p className="login-error" role="alert">
              {errorMessage(listQuery.error, "Couldn't load this list.")}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => void listQuery.refetch()}
              >
                Try again
              </button>
            </p>
          )}
          {listQuery.isSuccess && listQuery.data.jobs.length === 0 && (
            <p className="empty-state">
              {tab === "saved" &&
                "Nothing saved yet. Save jobs from your search results to come back to them."}
              {tab === "applied" &&
                "No applications yet. Use Apply manually, then Mark as applied."}
              {tab === "hidden" && "No hidden jobs."}
            </p>
          )}
          <ul className="job-list">
            {listQuery.data?.jobs.map((j) => {
              const job = userJobToCard(j);
              return (
                <JobCard
                  key={j.id}
                  job={job}
                  sources={j.sources}
                  state={(states[j.id] ?? j.state) as JobUiState}
                  applyGate={applyGate}
                  {...handlers(job)}
                />
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
