/**
 * Target companies › My companies (QA4): follow by name, new roles at
 * followed companies, the followed list, and alert settings.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { FollowedCompany, FollowSettings } from "../../lib/api/types";
import { atsKeys } from "./atsApi";
import { ago, safeHttpUrl } from "./platforms";
import {
  followByName,
  getFollowing,
  getNewRoles,
  markSeen,
  removeFollow,
  saveFollowSettings,
  targetKeys,
} from "./targetsApi";

const MODES = [
  { value: "daily", label: "Daily email at 9 AM" },
  { value: "instant", label: "As they come (at most hourly)" },
  { value: "off", label: "Off — only on this page" },
];

function list(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

function FollowByName() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: () => followByName(name.trim()),
    onSuccess: (r) => {
      setNote(
        r.status === "following"
          ? `Following ${r.follow?.name ?? name.trim()}.`
          : `Looking for ${name.trim()}'s career page — it shows up below in a minute.`,
      );
      setName("");
      void qc.invalidateQueries({ queryKey: atsKeys.all });
    },
  });
  return (
    <form
      className="ats-search ats-follow-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length >= 2) add.mutate();
      }}
    >
      <label className="sr-only" htmlFor="follow-name">
        Company name
      </label>
      <input
        id="follow-name"
        value={name}
        maxLength={120}
        placeholder="Follow a company, e.g. Razorpay"
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="btn-run" disabled={name.trim().length < 2 || add.isPending}>
        {add.isPending ? "Adding…" : "Follow"}
      </button>
      <p className="field-hint ats-follow-note" aria-live="polite">
        {add.isError ? errorMessage(add.error, "Couldn't follow this company.") : note}
      </p>
    </form>
  );
}

function NewRoles({ companyId }: { companyId?: string }) {
  const qc = useQueryClient();
  const roles = useQuery({
    queryKey: targetKeys.newRoles(companyId ?? ""),
    queryFn: () => getNewRoles(companyId),
  });
  const seen = useMutation({
    mutationFn: () => markSeen(companyId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: targetKeys.all }),
  });
  const unseen = (roles.data?.roles ?? []).filter((r) => !r.seen);
  if (roles.isLoading) return <p className="field-hint">Loading…</p>;
  if (!roles.data?.roles.length) return null;
  return (
    <div className="ats-new-roles">
      <ul className="ats-jobs">
        {roles.data.roles.slice(0, companyId ? 20 : 8).map((r) => {
          const url = safeHttpUrl(r.url);
          return (
            <li key={r.id} className="ats-job">
              <div className="ats-job-main">
                <span className="ats-job-title">
                  {!companyId && <strong>{r.company}: </strong>}
                  {r.title}
                  {!r.seen && <span className="badge tone-active">New</span>}
                </span>
                <span className="ats-job-meta">
                  {r.location || (r.remote ? "Remote" : "Location not given")}
                  {r.posted_at && <> · {ago(r.posted_at)}</>}
                </span>
              </div>
              {url && (
                <a className="btn-small" href={url} target="_blank" rel="noopener noreferrer">
                  Open job page
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {unseen.length > 0 && (
        <button
          type="button"
          className="link-button"
          disabled={seen.isPending}
          onClick={() => seen.mutate()}
        >
          Mark {unseen.length === 1 ? "it" : `all ${unseen.length}`} as seen
        </button>
      )}
    </div>
  );
}

function FollowedCard({ c }: { c: FollowedCompany }) {
  const id = useId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => removeFollow(c.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: atsKeys.all }),
  });
  const careers = c.careers_url ? safeHttpUrl(c.careers_url) : null;
  const latest = ago(c.latest_posted_at);
  return (
    <li className="card ats-company" aria-labelledby={`${id}-n`}>
      <div className="ats-company-head">
        <div>
          <h3 id={`${id}-n`} className="ats-company-name">
            {c.name}
            {c.new_count > 0 && <span className="badge tone-active">{c.new_count} new</span>}
          </h3>
          <p className="ats-company-meta">
            {c.status === "searching" && <span>Looking for its career page…</span>}
            {c.status === "not_found" && (
              <span>
                Career page not found yet — we'll keep looking when its jobs show up in searches.
              </span>
            )}
            {c.status === "following" && (
              <>
                {c.platform_name && (
                  <span className="ats-platform" data-platform={c.platform ?? ""}>
                    {c.platform_name}
                  </span>
                )}
                <span>
                  <strong>{c.open_matching}</strong> matching · {c.open_jobs} open
                </span>
                {latest && <span>newest {latest}</span>}
              </>
            )}
          </p>
        </div>
        <div className="ats-company-actions">
          {careers && (
            <a className="btn-secondary" href={careers} target="_blank" rel="noopener noreferrer">
              Careers page
            </a>
          )}
          <button
            type="button"
            className="btn-small"
            disabled={remove.isPending}
            aria-label={`Unfollow ${c.name}`}
            onClick={() => remove.mutate()}
          >
            Unfollow
          </button>
        </div>
      </div>
      {c.status === "following" && c.new_count > 0 && (
        <div className="ats-more">
          <button
            type="button"
            className="link-button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open
              ? "Hide new roles"
              : `Show ${c.new_count} new role${c.new_count === 1 ? "" : "s"}`}
          </button>
          {open && c.company_id && <NewRoles companyId={c.company_id} />}
        </div>
      )}
    </li>
  );
}

function AlertSettings({ settings }: { settings: FollowSettings }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(settings.alert_mode);
  const [titles, setTitles] = useState(settings.titles.join(", "));
  const [places, setPlaces] = useState(settings.places.join(", "));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setMode(settings.alert_mode);
    setTitles(settings.titles.join(", "));
    setPlaces(settings.places.join(", "));
  }, [settings]);
  const save = useMutation({
    mutationFn: () =>
      saveFollowSettings({ alert_mode: mode, titles: list(titles), places: list(places) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: targetKeys.all });
    },
  });
  return (
    <details className="card ats-alerts">
      <summary>Alerts and what counts as a match</summary>
      <form
        className="ats-alerts-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="field">
          <span>Tell me about new roles</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Job titles</span>
          <input
            value={titles}
            placeholder={settings.default_titles.join(", ") || "e.g. Backend Engineer"}
            onChange={(e) => setTitles(e.target.value)}
          />
          <span className="field-hint">
            Empty = the titles in Keywords and skills
            {settings.default_titles.length ? ` (${settings.default_titles.join(", ")})` : ""}.
          </span>
        </label>
        <label className="field">
          <span>Places</span>
          <input
            value={places}
            placeholder={settings.default_places.join(", ") || "e.g. Bengaluru, Remote"}
            onChange={(e) => setPlaces(e.target.value)}
          />
          <span className="field-hint">Empty = your places from Profile, plus Remote.</span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn-secondary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
          {saved && <span className="flash-ok">Saved.</span>}
          {save.isError && (
            <span className="login-error" role="alert">
              {errorMessage(save.error, "Couldn't save.")}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}

export function MyCompanies({ onBrowse }: { onBrowse: () => void }) {
  const following = useQuery({
    queryKey: targetKeys.following,
    queryFn: getFollowing,
    // Follows still being looked up turn into companies within a minute.
    refetchInterval: (q) =>
      q.state.data?.companies.some((c) => c.status === "searching") ? 5000 : false,
  });
  const companies = following.data?.companies ?? [];
  const newTotal = companies.reduce((n, c) => n + c.new_count, 0);
  return (
    <section aria-labelledby="mine-h">
      <h3 id="mine-h" className="sr-only">
        My companies
      </h3>
      <FollowByName />
      {following.isLoading ? (
        <p className="field-hint" role="status">
          Loading…
        </p>
      ) : following.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(following.error, "Couldn't load the companies you follow.")}
        </p>
      ) : companies.length === 0 ? (
        <div className="empty-state">
          <p>
            Follow the companies you'd love to work for. We check their career pages every few hours
            and tell you first when they post a role that matches your titles.
          </p>
          <p>
            <button type="button" className="link-button" onClick={onBrowse}>
              Browse companies hiring for your titles
            </button>
          </p>
        </div>
      ) : (
        <>
          {newTotal > 0 && (
            <div className="card ats-new-box">
              <h3>New at your companies</h3>
              <NewRoles />
            </div>
          )}
          <p className="ats-summary">
            Following <strong>{companies.length}</strong> of {following.data?.limit} companies
          </p>
          <ul className="ats-results">
            {companies.map((c) => (
              <FollowedCard key={c.id} c={c} />
            ))}
          </ul>
        </>
      )}
      {following.data && <AlertSettings settings={following.data.settings} />}
    </section>
  );
}
