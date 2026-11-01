/**
 * Settings › Browser extension (backend P8a E1): connect "Job Finder capture" with a 6-digit code, see
 * what it saved, disconnect it. The extension saves the jobs on Naukri / Foundit / Glassdoor / LinkedIn /
 * Indeed pages the user opens; they show up in Job Search as "Saved from your browser". Since backend P8b
 * it also fills LinkedIn Easy Apply when the user starts Fast apply (switch in Apply settings).
 */
import { useCallback, useEffect, useId, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import { formatWhen } from "../models/format";
import {
  disconnect,
  getPairCode,
  listConnections,
  type ExtensionConnection,
  type ExtensionConnections,
  type PairCode,
} from "./extensionApi";
import "../admin/admin.css";
import "../models/models.css";
import "./extension.css";

const SITES = ["Naukri", "Foundit", "Glassdoor", "LinkedIn", "Indeed"];

export default function ExtensionPage() {
  const [data, setData] = useState<ExtensionConnections | null>(null);
  const [error, setError] = useState("");
  const [pair, setPair] = useState<(PairCode & { until: number }) | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ExtensionConnection | null>(null);
  const [flash, setFlash] = useState("");
  const base = useId();

  const load = useCallback(async () => {
    try {
      setData(await listConnections());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your browser connections."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Count the code down; refresh the list while it's showing so a new connection appears by itself.
  useEffect(() => {
    if (!pair) return;
    const tick = () => {
      const s = Math.max(0, Math.round((pair.until - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setPair(null);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(poll);
    };
  }, [pair, load]);

  const newCode = async () => {
    setBusy(true);
    setFlash("");
    try {
      const code = await getPairCode();
      setPair({ ...code, until: Date.now() + code.expires_in * 1000 });
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't get a code."));
    } finally {
      setBusy(false);
    }
  };

  const connected = (data?.connections.length ?? 0) > 0;
  const mm = String(Math.floor(left / 60));
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="models-page">
      <div className="page-header">
        <div>
          <h2>Browser extension</h2>
          <p>
            Save the jobs on the {SITES.slice(0, -1).join(", ")} or {SITES[SITES.length - 1]} page
            you're looking at with one click. They show up in your next Job Search as "Saved from
            your browser" — scored against your resume like every other job. It also powers{" "}
            <strong>Fast apply</strong>: it fills LinkedIn Easy Apply in your own tab and you click
            Submit.
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

      <section className="card ext-steps" aria-labelledby={`${base}-how`}>
        <h3 id={`${base}-how`}>
          {connected ? "Connect another browser" : "Connect in three steps"}
        </h3>
        <ol>
          <li>
            Install <b>Job Finder</b> (the browser extension) in Chrome or Edge: open{" "}
            <code>chrome://extensions</code> (or <code>edge://extensions</code>), turn on{" "}
            <b>Developer mode</b>, click <b>Load unpacked</b> and pick the <code>extension</code>{" "}
            folder from the app's code.
          </li>
          <li>Get a code here and type it in the extension (click its icon).</li>
          <li>
            Open a job search on one of the sites and click <b>Save jobs to Job Finder</b> at the
            bottom right.
          </li>
        </ol>
        {pair ? (
          <div className="ext-code" aria-live="polite">
            <span className="ext-code-digits" aria-label={`Code ${pair.code.split("").join(" ")}`}>
              {pair.code}
            </span>
            <span className="count-note">
              Works once, for {mm}:{ss} more
            </span>
          </div>
        ) : (
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={newCode} disabled={busy}>
              {busy ? "Getting a code…" : "Get a code"}
            </button>
          </div>
        )}
        <p className="source-desc">
          The extension reads only the jobs already on the page. It never clicks, scrolls, solves
          captchas, or reads your cookies or other sites, and it can only save jobs — nothing else
          in your account.
        </p>
      </section>

      {!data && !error && (
        <p className="empty-state" role="status">
          Loading your browser connections…
        </p>
      )}

      {data && (
        <section className="card" aria-labelledby={`${base}-list`}>
          <h3 id={`${base}-list`}>Connected browsers</h3>
          <div className="ext-stats">
            <div>
              <span>{data.saved_today}</span>
              <small>jobs saved today</small>
            </div>
            <div>
              <span>{data.saved_total}</span>
              <small>saved jobs kept (30 days)</small>
            </div>
          </div>
          {connected ? (
            <ul className="source-list">
              {data.connections.map((c) => (
                <li key={c.id} className="key-row">
                  <div className="model-main">
                    <div className="model-title">
                      <span className="model-name">{c.name}</span>
                    </div>
                    <p className="source-desc">
                      Connected {formatWhen(c.created_at)} · last used {formatWhen(c.last_used_at)}
                    </p>
                  </div>
                  <button type="button" className="btn-danger-small" onClick={() => setRemoving(c)}>
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No browser connected yet.</p>
          )}
        </section>
      )}

      {removing && (
        <ConfirmDialog
          title={`Disconnect "${removing.name}"?`}
          confirmLabel="Disconnect"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await disconnect(removing.id);
            setFlash(`"${removing.name}" can no longer save jobs to your account.`);
            await load();
          }}
        >
          <p>
            That browser stops saving jobs at once. Jobs it already saved stay in your searches for
            up to 30 days.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
