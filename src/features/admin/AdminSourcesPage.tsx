/**
 * Admin › Job sources: turn a source on/off for everyone, set its tier and
 * terms-of-service risk label, see health. New sources need code, so there
 * is no "add".
 */
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { AdminSource, AdminSourceUpdate } from "../../lib/api/types";
import { HealthBadge } from "../models/badges";
import { riskText } from "../models/format";
import { listAdminSources, updateAdminSource } from "./aiAdminApi";
import "./admin.css";
import "../models/models.css";

const TIERS = [
  ["free", "Free"],
  ["free_key", "Free key"],
  ["paid", "Paid"],
  ["byok", "Own key"],
] as const;
const RISKS = [
  ["none", "None"],
  ["low", "Low"],
  ["high", "High"],
] as const;

export default function AdminSourcesPage() {
  const [rows, setRows] = useState<AdminSource[] | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listAdminSources());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load job sources."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (row: AdminSource, body: AdminSourceUpdate, message: string) => {
    setBusy(row.key);
    try {
      const updated = await updateAdminSource(row.key, body);
      setRows((rs) => rs?.map((r) => (r.key === row.key ? updated : r)) ?? rs);
      setFlash(message);
    } catch (err) {
      setFlash(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>Job sources</h2>
          <p>
            Turning a source off removes it from everyone&apos;s searches. &quot;Paid&quot; and
            &quot;Own key&quot; sources are skipped for people with Free tools only on.
          </p>
        </div>
      </div>
      {flash && (
        <p className="admin-flash" role="status">
          {flash}
        </p>
      )}
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {!rows && !error && (
        <p className="empty-state" role="status">
          Loading job sources…
        </p>
      )}
      {rows && (
        <section className="card admin-table-card" aria-label="Job sources">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Tier</th>
                <th scope="col">ToS risk</th>
                <th scope="col">Health</th>
                <th scope="col">On for everyone</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    <span className="model-name">{r.name}</span>
                    {r.description && <span className="admin-user-email">{r.description}</span>}
                    {r.requires_key && (
                      <span className={r.key_configured ? "admin-user-email" : "admin-row-error"}>
                        {r.key_configured
                          ? `Uses the ${r.key_scope} key`
                          : `No ${r.key_scope} platform key`}
                      </span>
                    )}
                  </th>
                  <td>
                    <select
                      value={r.tier}
                      disabled={busy === r.key}
                      aria-label={`${r.name}: tier`}
                      onChange={(e) =>
                        void change(
                          r,
                          { tier: e.target.value as AdminSourceUpdate["tier"] },
                          `${r.name} tier saved.`,
                        )
                      }
                    >
                      {TIERS.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={r.tos_risk}
                      disabled={busy === r.key}
                      aria-label={`${r.name}: terms-of-service risk`}
                      title={riskText(r.tos_risk)}
                      onChange={(e) =>
                        void change(
                          r,
                          { tos_risk: e.target.value as AdminSourceUpdate["tos_risk"] },
                          `${r.name} risk label saved.`,
                        )
                      }
                    >
                      {RISKS.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <HealthBadge
                      lastSuccess={r.health.last_success_at}
                      lastError={r.health.last_error}
                      failures={r.health.consecutive_failures}
                    />
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={r.enabled_global}
                        disabled={busy === r.key}
                        aria-label={`${r.name}: ${r.enabled_global ? "on" : "off"} for everyone`}
                        onChange={() =>
                          void change(
                            r,
                            { enabled_global: !r.enabled_global },
                            r.enabled_global
                              ? `${r.name} is off for everyone.`
                              : `${r.name} is on for everyone.`,
                          )
                        }
                      />
                      <span className="slider" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
