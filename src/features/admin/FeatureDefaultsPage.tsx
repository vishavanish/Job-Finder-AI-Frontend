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
import { clearApplyBlock, listApplyBlocks, listFeatureDefaults, type ApplyBlock } from "./adminApi";
import { formatDateTime } from "./format";
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
      <ApplyBlocksCard />
    </div>
  );
}

/** Platforms that block the server's apply browser; Auto apply on them is paused for everyone (backend QA5).
 * Shown only while something is paused. */
function ApplyBlocksCard() {
  const [blocks, setBlocks] = useState<ApplyBlock[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listApplyBlocks()
      .then((r) => active && setBlocks(r))
      .catch(() => active && setBlocks([])); // health is optional here; the table above is the page
    return () => {
      active = false;
    };
  }, []);

  if (blocks.length === 0) return null;

  const clear = (platform: string) => {
    setBusy(platform);
    setError("");
    clearApplyBlock(platform)
      .then(setBlocks)
      .catch((err) => setError(errorMessage(err, "Couldn't clear the pause.")))
      .finally(() => setBusy(""));
  };

  return (
    <section className="card admin-table-card" aria-labelledby="apply-blocks-title">
      <h3 id="apply-blocks-title">Auto apply paused on</h3>
      <p className="field-hint">
        These sites blocked the server&apos;s browser, so Auto apply on them is off for everyone
        until the time shown. People can still apply manually. Clear one only if the site no longer
        blocks us.
      </p>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Paused until</th>
            <th scope="col">Pause</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.platform}>
              <th scope="row">{b.name}</th>
              <td>{formatDateTime(new Date(b.until * 1000).toISOString())}</td>
              <td className="admin-num">{b.hours} h</td>
              <td>
                <button
                  type="button"
                  className="btn-small"
                  disabled={busy === b.platform}
                  onClick={() => clear(b.platform)}
                >
                  Clear pause on {b.name}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
