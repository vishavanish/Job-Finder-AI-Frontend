/**
 * Admin › Feature defaults: what every account gets unless an admin or manager
 * sets a custom value on the person's page. Read-only — defaults live in the
 * backend (app/services/entitlements.py FEATURES).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { capitalize, featureLabel } from "../../lib/auth/access";
import { errorMessage } from "../../lib/api/errors";
import type { EntitlementOut } from "../../lib/api/types";
import { listFeatureDefaults } from "./adminApi";
import "./admin.css";

export default function FeatureDefaultsPage() {
  const [rows, setRows] = useState<EntitlementOut[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    listFeatureDefaults()
      .then((r) => active && setRows(r))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load feature defaults.")));
    return () => {
      active = false;
    };
  }, [reload]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>Feature defaults</h2>
          <p>
            What every account can use unless you set something different for a person. To change
            one person&apos;s access, open them in <Link to="/admin/users">Users</Link>.
          </p>
        </div>
      </div>
      <div className="card admin-table-card">
        {error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <button type="button" className="btn-small" onClick={() => setReload((k) => k + 1)}>
              Try again
            </button>
          </div>
        ) : !rows ? (
          <p className="empty-state" role="status">
            Loading…
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Default access</th>
                <th scope="col">Daily limit</th>
                <th scope="col">Autopilot level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.feature}>
                  <th scope="row">{capitalize(featureLabel(e.feature))}</th>
                  <td>{e.enabled ? "On" : "Off"}</td>
                  <td className="admin-num">{e.quota_per_day ?? "No limit"}</td>
                  <td className="admin-num">{e.max_level ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
