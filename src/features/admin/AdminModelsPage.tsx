/**
 * Admin › AI models (spec §6.12): every model with tier, priority, key status
 * and health; add/edit (any provider, free or paid), turn on/off, test, delete;
 * default model per task. Users see enabled models immediately.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { AdminModel, ModelTestResult } from "../../lib/api/types";
import { HealthBadge, TierBadge } from "../models/badges";
import { TASKS_IN_USE, TASK_LABELS, providerLabel, servesTask, taskLabel } from "../models/tasks";
import {
  createAdminModel,
  deleteAdminModel,
  getModelDefaults,
  listAdminModels,
  setModelDefaults,
  testAdminModel,
  updateAdminModel,
} from "./aiAdminApi";
import { ModelForm } from "./ModelForm";
import "./admin.css";
import "../models/models.css";

type Editing = { mode: "add" } | { mode: "edit"; model: AdminModel } | null;

function Defaults({
  models,
  defaults,
  onSaved,
}: {
  models: AdminModel[];
  defaults: Record<string, string>;
  onSaved: (d: Record<string, string>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = useId();
  const pick = async (task: string, modelId: string) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await setModelDefaults({ [task]: modelId || null });
      onSaved(res.defaults as Record<string, string>);
      setMessage(`Default for ${taskLabel(task)} saved.`);
    } catch (err) {
      setMessage(errorMessage(err, "Couldn't save the default."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card" aria-labelledby={`${base}-h`}>
      <h3 id={`${base}-h`}>Default model per task</h3>
      <p className="field-hint">
        Used when a person hasn&apos;t picked a model. &quot;By priority&quot; tries every enabled
        model in priority order.
      </p>
      {message && (
        <p className="field-hint" role="status">
          {message}
        </p>
      )}
      <div className="task-picker">
        {Object.keys(TASK_LABELS).map((task) => (
          <div key={task} style={{ display: "contents" }}>
            <label htmlFor={`${base}-${task}`}>
              {taskLabel(task)}
              {!TASKS_IN_USE.has(task) && (
                <span className="task-later"> · used in a later update</span>
              )}
            </label>
            <select
              id={`${base}-${task}`}
              value={defaults[task] ?? ""}
              disabled={busy}
              onChange={(e) => void pick(task, e.target.value)}
            >
              <option value="">By priority</option>
              {models
                .filter((m) => m.enabled_global && servesTask(m.tasks, task))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<AdminModel[] | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<AdminModel | null>(null);
  const [tests, setTests] = useState<Record<string, ModelTestResult | "running">>({});
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, defs] = await Promise.all([listAdminModels(), getModelDefaults()]);
      setModels(list);
      setDefaults(defs.defaults as Record<string, string>);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't load AI models."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (m: AdminModel) => {
    setToggling(m.id);
    try {
      await updateAdminModel(m.id, { enabled_global: !m.enabled_global });
      setFlash(
        m.enabled_global
          ? `${m.display_name} is off. Users no longer see it.`
          : `${m.display_name} is on. Users can see it now.`,
      );
      await load();
    } catch (err) {
      setFlash(errorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const runTest = async (m: AdminModel) => {
    setTests((t) => ({ ...t, [m.id]: "running" }));
    try {
      const res = await testAdminModel(m.id);
      setTests((t) => ({ ...t, [m.id]: res }));
      await load();
    } catch (err) {
      setTests((t) => ({
        ...t,
        [m.id]: { ok: false, latency_ms: 0, tokens_in: 0, tokens_out: 0, error: errorMessage(err) },
      }));
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>AI models</h2>
          <p>
            Add any model, free or paid. As soon as a model is on, everyone sees it in their AI
            models list. Keys live under <Link to="/admin/keys">Keys</Link>.
          </p>
        </div>
        {!editing && (
          <button type="button" className="btn-run" onClick={() => setEditing({ mode: "add" })}>
            Add model
          </button>
        )}
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

      {editing && (
        <ModelForm
          model={editing.mode === "edit" ? editing.model : undefined}
          onCancel={() => setEditing(null)}
          onSubmit={async (body) => {
            if (editing.mode === "add") {
              const m = await createAdminModel(body);
              setFlash(`${m.display_name} added. Users can see it now.`);
            } else {
              const { provider: _p, model_id: _m, ...changes } = body;
              if (editing.model.provider !== "openai_compatible") delete changes.base_url;
              const m = await updateAdminModel(editing.model.id, changes);
              setFlash(`${m.display_name} saved.`);
            }
            setEditing(null);
            await load();
          }}
        />
      )}

      {!models && !error && (
        <p className="empty-state" role="status">
          Loading AI models…
        </p>
      )}

      {models && (
        <section className="card admin-table-card" aria-label="Models">
          {models.length === 0 ? (
            <p className="empty-state">No models yet. Add one to start scoring jobs.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Key</th>
                  <th scope="col">Health</th>
                  <th scope="col">On</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const test = tests[m.id];
                  return (
                    <tr key={m.id}>
                      <th scope="row">
                        <span className="model-name">{m.display_name}</span>
                        <span className="admin-user-email">
                          {providerLabel(m.provider)} ·{" "}
                          <span className="model-id">{m.model_id}</span>
                        </span>
                        {m.tasks.length > 0 && (
                          <span className="admin-user-email">
                            Only: {m.tasks.map(taskLabel).join(", ")}
                          </span>
                        )}
                        {test && test !== "running" && (
                          <span
                            className={test.ok ? "admin-row-ok" : "admin-row-error"}
                            role="status"
                          >
                            {test.ok
                              ? `Test passed in ${test.latency_ms} ms (${test.key_source} key).`
                              : `Test failed: ${test.error}`}
                          </span>
                        )}
                      </th>
                      <td>
                        <TierBadge tier={m.tier} />
                      </td>
                      <td className="num">{m.priority}</td>
                      <td>
                        {m.key_configured ? (
                          m.key_scope
                        ) : (
                          <span className="admin-row-error">No {m.key_scope} key</span>
                        )}
                      </td>
                      <td>
                        <HealthBadge
                          lastSuccess={m.health.last_success_at}
                          lastError={m.health.last_error}
                          failures={m.health.consecutive_failures}
                          paused={m.health.paused}
                        />
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={m.enabled_global}
                            disabled={toggling === m.id}
                            onChange={() => void toggle(m)}
                            aria-label={`${m.display_name}: ${m.enabled_global ? "on" : "off"}`}
                          />
                          <span className="slider" />
                        </label>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => void runTest(m)}
                            disabled={test === "running"}
                            aria-label={`Test ${m.display_name}`}
                          >
                            {test === "running" ? "Testing…" : "Test"}
                          </button>
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => setEditing({ mode: "edit", model: m })}
                            aria-label={`Edit ${m.display_name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-danger-small"
                            onClick={() => setDeleting(m)}
                            aria-label={`Delete ${m.display_name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {models && models.length > 0 && (
        <Defaults models={models} defaults={defaults} onSaved={setDefaults} />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.display_name}?`}
          confirmLabel="Delete model"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteAdminModel(deleting.id);
            setFlash(`${deleting.display_name} deleted.`);
            await load();
          }}
        >
          <p>
            It disappears for everyone. People who picked it go back to the default model. Past
            usage stays in the usage report.
          </p>
          <p>To hide it for a while instead, turn it off.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
