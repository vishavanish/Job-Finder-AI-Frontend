/**
 * Settings › API keys (bring your own key, spec §6.11): one key per provider.
 * Saved keys show only as ••••last4 and can be replaced or deleted, never read.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { KeyList, KeyOut } from "../../lib/api/types";
import { formatWhen } from "./format";
import { KeyForm } from "./KeyForm";
import { addMyKey, deleteMyKey, listMyKeys } from "./modelsApi";
import { scopeLabel } from "./tasks";
import "../admin/admin.css";
import "./models.css";

export default function ApiKeysPage() {
  const [data, setData] = useState<KeyList | null>(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<KeyOut | null>(null);
  const [flash, setFlash] = useState("");
  const [otherScope, setOtherScope] = useState("");
  const base = useId();

  const load = useCallback(async () => {
    try {
      setData(await listMyKeys());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your keys."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (scope: string, key: string) => {
    await addMyKey(scope, key);
    setFlash(`${scopeLabel(scope)} key saved.`);
    await load();
  };

  const stored = new Map((data?.keys ?? []).map((k) => [k.scope, k]));
  const scopes = [...new Set([...(data?.scopes ?? []), ...stored.keys()])].sort();

  return (
    <div className="models-page">
      <div className="page-header">
        <div>
          <h2>API keys</h2>
          <p>
            Add your own key to use paid models on your account, or to get higher limits. Your key
            is used only for your requests.
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
          Loading your keys…
        </p>
      )}

      {data && (
        <section className="card" aria-labelledby={`${base}-h`}>
          <h3 id={`${base}-h`}>Your keys</h3>
          <ul className="source-list">
            {scopes.map((scope) => {
              const key = stored.get(scope);
              return (
                <li key={scope} className="key-row">
                  <div className="model-main">
                    <div className="model-title">
                      <span className="model-name">{scopeLabel(scope)}</span>
                      {key ? (
                        <span className="key-masked" aria-label={`Saved key ending ${key.last4}`}>
                          {key.masked}
                        </span>
                      ) : (
                        <span className="count-note">No key</span>
                      )}
                    </div>
                    {key && <p className="source-desc">Added {formatWhen(key.created_at)}</p>}
                    <KeyForm
                      scope={scope}
                      label={`${key ? "Replace" : "Add"} your ${scopeLabel(scope)} key`}
                      saved={key?.masked}
                      onSave={(value) => save(scope, value)}
                    />
                  </div>
                  {key && (
                    <button
                      type="button"
                      className="btn-danger-small"
                      onClick={() => setRemoving(key)}
                    >
                      Delete key
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="key-other">
            <label htmlFor={`${base}-other`} className="model-group-title">
              Key for another provider
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
                label={`Your ${scopeLabel(otherScope)} key`}
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
          title={`Delete your ${scopeLabel(removing.scope)} key?`}
          confirmLabel="Delete key"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteMyKey(removing.id);
            setFlash(`${scopeLabel(removing.scope)} key deleted.`);
            await load();
          }}
        >
          <p>
            Models and job sources that used this key go back to the platform key, or stop being
            available if they needed yours (paid models without the premium feature).
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
