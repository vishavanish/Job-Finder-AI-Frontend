/**
 * ATS Targets (spec §6.6, F6 plan §1): one job-title input, results from the
 * shared career-page registry grouped by company, filters in the URL, an
 * honest scope line, live top-up when few companies match, and "Add a company".
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { AtsCompanyGroup, AtsJob, AtsRegistryStats } from "../../lib/api/types";
import { getPreferences, profileKeys } from "../profile/profileApi";
import { listSearchProfiles, searchProfileKeys } from "../search-profile/searchProfileApi";
import { AddCompanyDialog, LegacyTargetsCard } from "./AddCompanyDialog";
import { atsKeys, getAtsStats, searchAts, type AtsFilters } from "./atsApi";
import { CompanyCard } from "./CompanyCard";
import { JobDetailsDialog } from "./JobDetailsDialog";
import { readLegacyTargets, type LegacyTarget } from "./legacyTargets";
import { PLATFORMS, POSTED_OPTIONS, ago, formatCount, platformName } from "./platforms";
import { useTopUp } from "./useTopUp";
import "./ats.css";

const FILTER_KEYS = ["platform", "location", "remote", "posted", "applied"] as const;
const SEARCH_CACHE_MS = 10 * 60_000;

function ScopeLine({ registry }: { registry: AtsRegistryStats | undefined }) {
  if (!registry) return null;
  const refreshed = ago(registry.last_refresh_at);
  const platforms = Object.keys(registry.by_platform ?? {}).length || PLATFORMS.length;
  return (
    <p className="ats-scope">
      Searching <strong>{formatCount(registry.companies)} companies</strong> ·{" "}
      <strong>{formatCount(registry.jobs)} open jobs</strong> on {platforms} career-page platforms
      {refreshed && <> · refreshed {refreshed}</>}
    </p>
  );
}

function Coverage({ registry }: { registry: AtsRegistryStats | undefined }) {
  const rows = Object.entries(registry?.by_platform ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <details className="ats-coverage">
      <summary>What's covered</summary>
      <p>
        This is every company in our registry, not every company on the internet. It grows from
        companies people search, apply links found in job searches, and companies you add.
      </p>
      {rows.length > 0 && (
        <ul className="ats-coverage-list">
          {rows.map(([key, n]) => (
            <li key={key}>
              {platformName(key)} <span className="num">{formatCount(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function SkeletonCards() {
  return (
    <ul className="ats-results" role="status" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card ats-skeleton" aria-hidden="true" />
      ))}
    </ul>
  );
}

export default function AtsTargetsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [draft, setDraft] = useState(q);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<{ job: AtsJob; company: string } | null>(null);
  const [legacy, setLegacy] = useState<LegacyTarget[]>(() => readLegacyTargets());
  // Filters start folded on a phone so the results are visible first.
  const [filtersOpen] = useState(() => !window.matchMedia?.("(max-width: 640px)").matches);

  useEffect(() => setDraft(q), [q]);

  // QA2 §4: with no location chosen, search the places from Profile (+ Remote);
  // "any" in the URL means every location.
  const prefs = useQuery({ queryKey: profileKeys.preferences, queryFn: getPreferences });
  const myPlaces = useMemo(() => {
    const places = (prefs.data?.locations ?? []).map((p) => p.trim()).filter(Boolean);
    return places.length ? [...new Set([...places, "Remote"])].join(", ") : "";
  }, [prefs.data]);
  const locationParam = params.get("location");
  const usingMyPlaces = locationParam === null && Boolean(myPlaces);

  const filters: AtsFilters = useMemo(
    () => ({
      platform: params.getAll("platform"),
      location: locationParam === null ? myPlaces : locationParam === "any" ? "" : locationParam,
      remote: params.get("remote") === "1",
      posted: params.get("posted") ?? "",
      hideApplied: params.get("applied") !== "show",
    }),
    [params, locationParam, myPlaces],
  );

  const update = (fn: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        fn(next);
        return next;
      },
      { replace: true },
    );

  const run = (title: string) => {
    const t = title.trim();
    if (t.length < 2) return;
    setDraft(t);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("q", t);
      return next;
    });
  };

  const stats = useQuery({ queryKey: atsKeys.stats, queryFn: getAtsStats, retry: false });
  const profiles = useQuery({ queryKey: searchProfileKeys.all, queryFn: listSearchProfiles });
  const picks = useMemo(() => {
    const titles = (profiles.data?.profiles ?? []).flatMap((p) => p.titles ?? []);
    return [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  }, [profiles.data]);

  const search = useInfiniteQuery({
    queryKey: atsKeys.search(q, filters),
    queryFn: ({ pageParam }) => searchAts(q, filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total_companies ? last.page + 1 : undefined,
    // Wait for Profile's places so the first search already uses them.
    enabled: q.length >= 2 && !prefs.isLoading,
    staleTime: SEARCH_CACHE_MS,
  });

  const first = search.data?.pages[0];
  const groups: AtsCompanyGroup[] = useMemo(
    () => search.data?.pages.flatMap((p) => p.groups) ?? [],
    [search.data],
  );
  // Keep the top-up once started: the search it refreshes no longer carries its id.
  const [topUpId, setTopUpId] = useState<string | null>(null);
  const startedTopUp = first?.topup_task_id;
  useEffect(() => setTopUpId(null), [q]);
  useEffect(() => {
    if (startedTopUp) setTopUpId(startedTopUp);
  }, [startedTopUp]);
  const topUp = useTopUp(topUpId, q);
  const registry = first?.registry ?? stats.data;
  const filtered =
    filters.platform.length > 0 ||
    Boolean(filters.location) ||
    filters.remote ||
    Boolean(filters.posted) ||
    !filters.hideApplied;

  const clearFilters = () =>
    update((next) => {
      for (const k of FILTER_KEYS) next.delete(k);
      next.set("location", "any"); // cleared means every location, not Profile's places
    });

  const togglePlatform = (key: string) =>
    update((next) => {
      const current = next.getAll("platform");
      next.delete("platform");
      const set = current.includes(key) ? current.filter((p) => p !== key) : [...current, key];
      for (const p of set) next.append("platform", p);
    });

  const searchError = (err: unknown) =>
    err instanceof ApiError && err.status === 429
      ? "You've searched a lot this minute — try again in a moment."
      : errorMessage(err, "Couldn't search the registry.");

  return (
    <div className="ats-page">
      <div className="page-header">
        <div>
          <h2>ATS targets</h2>
          <p>
            Type a job title to see which companies are hiring for it on their own career pages —
            Greenhouse, Lever, Workday and more.
          </p>
          <p className="field-hint">
            Job search already includes these jobs — use this page only to browse by company.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
          Add a company
        </button>
      </div>

      {legacy.length > 0 && <LegacyTargetsCard targets={legacy} onDone={() => setLegacy([])} />}

      <form
        className="ats-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(draft);
        }}
      >
        <label className="sr-only" htmlFor="ats-q">
          Job title
        </label>
        <input
          id="ats-q"
          type="search"
          value={draft}
          minLength={2}
          maxLength={120}
          placeholder="Job title, e.g. Data Engineer"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn-run" disabled={draft.trim().length < 2}>
          Search
        </button>
      </form>
      {picks.length > 0 && (
        <div className="ats-picks" role="group" aria-label="Your search titles">
          {picks.map((t) => (
            <button
              key={t}
              type="button"
              className="chip ats-pick"
              aria-pressed={t.toLowerCase() === q.toLowerCase()}
              onClick={() => run(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <ScopeLine registry={registry} />
      <Coverage registry={registry} />

      {q && (
        <details className="ats-filters-box" open={filtersOpen}>
          <summary>Filters{filtered && " (on)"}</summary>
          <div className="ats-filters">
            <fieldset className="ats-platforms">
              <legend>Platform</legend>
              {PLATFORMS.filter((p) => !registry?.by_platform || p.key in registry.by_platform).map(
                (p) => (
                  <label key={p.key} className="check-inline">
                    <input
                      type="checkbox"
                      checked={filters.platform.includes(p.key)}
                      onChange={() => togglePlatform(p.key)}
                    />
                    {p.name}
                  </label>
                ),
              )}
            </fieldset>
            <label className="field">
              <span>Location</span>
              <input
                key={filters.location}
                defaultValue={filters.location}
                placeholder="Any location — e.g. Bengaluru, Remote"
                aria-describedby="ats-location-hint"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value === filters.location) return;
                  update((n) => n.set("location", value || "any"));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="field-hint" id="ats-location-hint">
                {usingMyPlaces ? (
                  <>
                    Your places from Profile.{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => update((n) => n.set("location", "any"))}
                    >
                      Any location
                    </button>
                  </>
                ) : (
                  "Separate places with commas."
                )}
              </span>
            </label>
            <label className="field">
              <span>Posted</span>
              <select
                value={filters.posted}
                onChange={(e) =>
                  update((n) =>
                    e.target.value ? n.set("posted", e.target.value) : n.delete("posted"),
                  )
                }
              >
                {POSTED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ats-checks">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={filters.remote}
                  onChange={(e) =>
                    update((n) => (e.target.checked ? n.set("remote", "1") : n.delete("remote")))
                  }
                />
                Remote only
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={filters.hideApplied}
                  onChange={(e) =>
                    update((n) =>
                      e.target.checked ? n.delete("applied") : n.set("applied", "show"),
                    )
                  }
                />
                Hide jobs I applied to
              </label>
            </div>
            {filtered && (
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </details>
      )}

      <div aria-live="polite" className="ats-topup">
        {topUp.phase === "running" && (
          <p className="field-hint">
            <span className="spinner" aria-hidden="true" /> Few companies matched, so we're checking
            up to 40 more career pages live — new results appear as they come in.
          </p>
        )}
        {topUp.phase === "done" && (
          <p className="flash-ok">
            {topUp.added
              ? `Checked more career pages live and found ${topUp.added} more jobs.`
              : "Checked more career pages live — nothing new."}
          </p>
        )}
      </div>

      {!q ? (
        <p className="empty-state">
          Search a job title to see the companies hiring for it. Their jobs also show up in your
          normal searches in <Link to="/jobs">Jobs</Link>.
        </p>
      ) : search.isLoading ? (
        <SkeletonCards />
      ) : search.isError ? (
        <p className="login-error" role="alert">
          {searchError(search.error)}{" "}
          <button type="button" className="link-button" onClick={() => void search.refetch()}>
            Try again
          </button>
        </p>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>
            No companies in the registry are hiring for “{q}” right now
            {filtered ? " with these filters" : ""}.
          </p>
          <p>
            {filtered && (
              <>
                <button type="button" className="link-button" onClick={clearFilters}>
                  Clear filters
                </button>{" "}
                ·{" "}
              </>
            )}
            <button type="button" className="link-button" onClick={() => setAdding(true)}>
              Add a company
            </button>{" "}
            whose careers page you know.
          </p>
        </div>
      ) : (
        <>
          <p className="ats-summary" aria-live="polite">
            <strong>{first?.total_companies}</strong>{" "}
            {first?.total_companies === 1 ? "company" : "companies"} ·{" "}
            <strong>{first?.total_jobs}</strong> {first?.total_jobs === 1 ? "job" : "jobs"} match “
            {q}”
            {first?.expansions && first.expansions.length > 0 && (
              <span className="field-hint"> (also searched: {first.expansions.join(", ")})</span>
            )}
          </p>
          <ul className="ats-results">
            {groups.map((g) => (
              <CompanyCard
                key={g.company_id}
                group={g}
                query={q}
                onDetails={(job, company) => setOpen({ job, company: company.name })}
              />
            ))}
          </ul>
          {search.hasNextPage && (
            <div className="ats-load-more">
              <button
                type="button"
                className="btn-secondary"
                disabled={search.isFetchingNextPage}
                onClick={() => void search.fetchNextPage()}
              >
                {search.isFetchingNextPage
                  ? "Loading…"
                  : `Load more (${groups.length} of ${first?.total_companies})`}
              </button>
            </div>
          )}
        </>
      )}

      {adding && <AddCompanyDialog onClose={() => setAdding(false)} />}
      {open && (
        <JobDetailsDialog job={open.job} company={open.company} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
