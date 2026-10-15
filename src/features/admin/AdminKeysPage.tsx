/**
 * Admin › Keys: the platform key for each key name used by models and job
 * sources. A stored key beats the server's .env key. Values are never shown.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { KeyOut, PlatformKeyList } from "../../lib/api/types";
import { formatWhen } from "../models/format";
import { KeyForm } from "../models/KeyForm";
import { scopeLabel } from "../models/tasks";
import { deletePlatformKey, listPlatformKeys, setPlatformKey } from "./aiAdminApi";
import "./admin.css";
import "../models/models.css";

export default function AdminKeysPage() {
  const [data, setData] = useState<PlatformKeyList | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [removing, setRemoving] = useState<KeyOut | null>(null);
  const [otherScope, setOtherScope] = useState("");
  const base = useId();

  const load = useCallback(async () => {
    try {
      setData(await listPlatformKeys());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load platform keys."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (scope: string, key: string) => {
    await setPlatformKey(scope, key);
    setFlash(`${scopeLabel(scope)} platform key saved.`);
    await load();
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>Platform keys</h2>
          <p>
            Keys the platform uses for everyone. People can add their own under Settings › API keys;
            theirs is used first for their requests.
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
      {!data && !error && (
        <p className="empty-state" role="status">
          Loading keys…
        </p>
      )}
      {data && (
        <section className="card" aria-labelledby={`${base}-h`}>
          <h3 id={`${base}-h`}>Keys by name</h3>
          <ul className="source-list">
            {data.scopes.map((s) => (
              <li key={s.scope} className="key-row">
                <div className="model-main">
                  <div className="model-title">
                    <span className="model-name">{scopeLabel(s.scope)}</span>
                    {s.stored ? (
                      <span className="key-masked">{s.stored.masked}</span>
                    ) : s.env_fallback ? (
                      <span className="count-note">Using the server .env key</span>
                    ) : (
                      <span className="admin-row-error">No key</span>
                    )}
                  </div>
                  {s.stored && (
                    <p className="source-desc">Saved {formatWhen(s.stored.created_at)}</p>
                  )}
                  <KeyForm
                    scope={s.scope}
                    label={`${s.stored ? "Replace the" : "Add a"} ${scopeLabel(s.scope)} platform key`}
                    saved={s.stored?.masked}
                    onSave={(value) => save(s.scope, value)}
                  />
                </div>
                {s.stored && (
                  <button
                    type="button"
                    className="btn-danger-small"
                    onClick={() => setRemoving(s.stored!)}
                  >
                    Delete key
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="key-other">
            <label htmlFor={`${base}-other`} className="model-group-title">
              Key for another name
            </label>
            <input
              id={`${base}-other`}
              className="admin-quota"
              placeholder="e.g. openrouter"
              value={otherScope}
              onChange={(e) => setOtherScope(e.target.value.trim().toLowerCase())}
            />
            {otherScope && (
              <KeyForm
                scope={otherScope}
                label={`${scopeLabel(otherScope)} platform key`}
                onSave={async (value) => {
                  await save(otherScope, value);
                  setOtherScope("");
                }}
              />
            )}
          </div>
        </section>
      )}
      {removing && (
        <ConfirmDialog
          title={`Delete the ${scopeLabel(removing.scope)} platform key?`}
          confirmLabel="Delete key"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deletePlatformKey(removing.id);
            setFlash(`${scopeLabel(removing.scope)} platform key deleted.`);
            await load();
          }}
        >
          <p>
            Models and job sources with this key name fall back to the server .env key if one is
            set. Otherwise they stop working for everyone without their own key.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
