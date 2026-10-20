/**
 * Admin › ATS registry (F6 plan §1.11): index size against its cap, platform
 * health with on/off, failing companies, and the company list with on/off and
 * "Check now" (crawl).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { AtsCompany } from "../../lib/api/types";
import {
  atsKeys,
  crawlAtsCompany,
  getAtsHealth,
  listAtsCompanies,
  updateAtsCompany,
  updateAtsPlatform,
} from "../ats/atsApi";
import { PLATFORMS, ago, formatCount, safeHttpUrl } from "../ats/platforms";
import "./admin.css";
import "../ats/ats.css";
import "../tracker/tracker.css";

function CompanyRow({ c, onFlash }: { c: AtsCompany; onFlash: (text: string) => void }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => updateAtsCompany(c.id, { active: !c.active }),
    onSuccess: (row) => {
      onFlash(`${row.name} is ${row.active ? "on" : "off"}.`);
      void qc.invalidateQueries({ queryKey: ["ats", "admin"] });
    },
    onError: (err) => onFlash(errorMessage(err)),
  });
  const crawl = useMutation({
    mutationFn: () => crawlAtsCompany(c.id),
    onSuccess: () => onFlash(`Checking ${c.name} now — new jobs appear in a minute or two.`),
    onError: (err) => onFlash(errorMessage(err)),
  });
  const careers = safeHttpUrl(c.careers_url);
  return (
    <tr>
      <td>
        {careers ? (
          <a href={careers} target="_blank" rel="noopener noreferrer">
            {c.name}
          </a>
        ) : (
          c.name
        )}
        <div className="field-hint">
          {c.slug} · added by {c.origin}
        </div>
      </td>
      <td>{c.platform_name}</td>
      <td className="num">{formatCount(c.job_count)}</td>
      <td>
        {c.last_ok_at ? ago(c.last_ok_at) : "never"}
        {c.last_error && <div className="gmail-error">{c.last_error}</div>}
      </td>
      <td>{c.active ? "On" : "Off"}</td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className="btn-small"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
            aria-label={`${c.active ? "Turn off" : "Turn on"} ${c.name}`}
          >
            {c.active ? "Turn off" : "Turn on"}
          </button>
          <button
            type="button"
            className="btn-small"
            disabled={!c.active || crawl.isPending}
            onClick={() => crawl.mutate()}
            aria-label={`Check now: ${c.name}`}
          >
            Check now
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminAtsPage() {
  const qc = useQueryClient();
  const [flash, setFlash] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const [active, setActive] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const health = useQuery({ queryKey: atsKeys.adminHealth, queryFn: getAtsHealth });
  const companies = useQuery({
    queryKey: atsKeys.adminCompanies(query, platform, active),
    queryFn: () => listAtsCompanies(query, platform, active),
  });
  const platformSwitch = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      updateAtsPlatform(key, enabled),
    onSuccess: (row) => {
      setFlash(`${row.name} is ${row.enabled ? "on" : "off"} for everyone.`);
      void qc.invalidateQueries({ queryKey: atsKeys.adminHealth });
    },
    onError: (err) => setFlash(errorMessage(err)),
  });

  const h = health.data;
  const used = h ? Math.round((h.registry.jobs / Math.max(1, h.index_limit)) * 100) : 0;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>ATS registry</h2>
          <p>
            The shared list of company career pages behind ATS targets and the “Company career
            pages” job source. Companies are checked every 6–24 hours.
          </p>
        </div>
      </div>
      <p className="flash-ok" role="status" aria-live="polite">
        {flash}
      </p>

      {health.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(health.error, "Couldn't load registry health.")}
        </p>
      ) : !h ? (
        <p className="empty-state" role="status">
          Loading…
        </p>
      ) : (
        <>
          <ul className="summary-cards ats-admin-cards">
            <li className="summary-card">
              <span className="summary-value">{formatCount(h.registry.companies)}</span>
              <span className="summary-label">Companies on</span>
            </li>
            <li className="summary-card">
              <span className="summary-value">{formatCount(h.registry.jobs)}</span>
              <span className="summary-label">
                Indexed jobs ({used}% of {formatCount(h.index_limit)})
              </span>
            </li>
            <li className="summary-card">
              <span className="summary-value">{h.switched_off}</span>
              <span className="summary-label">Switched off</span>
            </li>
            <li className="summary-card">
              <span className="summary-value">{h.failing_companies.length}</span>
              <span className="summary-label">With crawl errors</span>
            </li>
          </ul>
          {used >= 80 && (
            <p className="login-error" role="alert">
              The index is {used}% full. New jobs stop being added at the cap — check database
              storage.
            </p>
          )}

          <div className="card admin-table-card">
            <h3>Platforms</h3>
            <div className="tracker-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Platform</th>
                    <th scope="col">Companies</th>
                    <th scope="col">Health</th>
                    <th scope="col">On</th>
                  </tr>
                </thead>
                <tbody>
                  {h.platforms.map((p) => (
                    <tr key={p.platform}>
                      <td>{p.name}</td>
                      <td className="num">{formatCount(p.companies)}</td>
                      <td>
                        {p.last_error ? (
                          <span className="gmail-error">
                            {p.consecutive_failures} failures · {p.last_error}
                          </span>
                        ) : (
                          <span className="field-hint">
                            OK{p.last_success_at ? ` · ${ago(p.last_success_at)}` : ""}
                          </span>
                        )}
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            disabled={platformSwitch.isPending}
                            aria-label={`${p.name} on for everyone`}
                            onChange={(e) =>
                              platformSwitch.mutate({ key: p.platform, enabled: e.target.checked })
                            }
                          />
                          <span className="slider" aria-hidden="true" />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card admin-table-card">
        <h3>Companies</h3>
        <div className="ats-admin-filters">
          <label className="field">
            <span>Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="field">
            <span>Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">All</option>
              {PLATFORMS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>State</span>
            <select value={active} onChange={(e) => setActive(e.target.value)}>
              <option value="">On and off</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>
        {companies.isLoading ? (
          <p className="empty-state" role="status">
            Loading…
          </p>
        ) : companies.isError ? (
          <p className="login-error" role="alert">
            {errorMessage(companies.error, "Couldn't load companies.")}
          </p>
        ) : (companies.data ?? []).length === 0 ? (
          <p className="empty-state">No companies match.</p>
        ) : (
          <div className="tracker-table-wrap">
            <table className="data-table">
              <caption className="sr-only">Registry companies</caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Jobs</th>
                  <th scope="col">Last good check</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.data!.map((c) => (
                  <CompanyRow key={c.id} c={c} onFlash={setFlash} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
