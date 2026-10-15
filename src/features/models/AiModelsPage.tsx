/**
 * Settings › AI models (spec §6.11): every model the admin enabled, grouped
 * Free / Paid with whether the user can use it and why not, a model per task
 * (or the default), and the user's own usage.
 */
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../lib/api/errors";
import type { ModelCatalog, UsageSummary, UserModel } from "../../lib/api/types";
import { HealthBadge, TierBadge } from "./badges";
import { getModels, getMyUsage, setModelPreferences } from "./modelsApi";
import { TASKS_IN_USE, providerLabel, servesTask, taskLabel } from "./tasks";
import { UsageCard } from "./UsageCard";
import "../admin/admin.css";
import "./models.css";

function ModelRow({ model }: { model: UserModel }) {
  return (
    <li className="model-row">
      <div className="model-main">
        <div className="model-title">
          <span className="model-name">{model.display_name}</span>
          <TierBadge tier={model.tier} />
          {model.paused && <HealthBadge paused />}
          {model.uses_own_key && <span className="count-note">Uses your key</span>}
        </div>
        <p className="source-desc">
          {providerLabel(model.provider)} · <span className="model-id">{model.model_id}</span>
        </p>
        {!model.available && model.reason && <p className="model-reason">{model.reason}</p>}
      </div>
    </li>
  );
}

function TaskPicker({
  catalog,
  onChange,
}: {
  catalog: ModelCatalog;
  onChange: (c: ModelCatalog) => void;
}) {
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const base = useId();

  const pick = async (task: string, modelId: string) => {
    setBusyTask(task);
    setMessage(null);
    try {
      onChange(await setModelPreferences({ [task]: modelId || null }));
      setMessage({
        kind: "ok",
        text: `Saved. ${taskLabel(task)} will use ${modelId ? "your choice" : "the default"}.`,
      });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Couldn't save your choice.") });
    } finally {
      setBusyTask(null);
    }
  };

  const defaultName = (task: string) =>
    catalog.models.find((m) => m.id === catalog.defaults[task])?.display_name;

  return (
    <section className="card" aria-labelledby={`${base}-h`}>
      <h3 id={`${base}-h`}>Model for each task</h3>
      <p className="field-hint">
        &quot;Default&quot; uses the admin&apos;s choice, then the next working model. If your model
        fails, the next one takes over automatically.
      </p>
      {message && (
        <p className={message.kind === "ok" ? "admin-flash" : "login-error"} role="status">
          {message.text}
        </p>
      )}
      <div className="task-picker">
        {catalog.tasks.map((task) => {
          const options = catalog.models.filter((m) => servesTask(m.tasks, task));
          const id = `${base}-${task}`;
          return (
            <div key={task} style={{ display: "contents" }}>
              <label htmlFor={id}>
                {taskLabel(task)}
                {!TASKS_IN_USE.has(task) && (
                  <span className="task-later"> · used in a later update</span>
                )}
              </label>
              <select
                id={id}
                value={catalog.preferences[task] ?? ""}
                disabled={busyTask !== null}
                onChange={(e) => void pick(task, e.target.value)}
              >
                <option value="">
                  Default{defaultName(task) ? ` (${defaultName(task)})` : ""}
                </option>
                {options.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.display_name} · {m.tier === "paid" ? "Paid" : "Free"}
                    {m.available ? "" : " — not available"}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function AiModelsPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    getModels()
      .then((c) => active && setCatalog(c))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load AI models.")));
    getMyUsage()
      .then((u) => active && setUsage(u))
      .catch(() => active && setUsage(null));
    return () => {
      active = false;
    };
  }, [reload]);

  const free = catalog?.models.filter((m) => m.tier !== "paid") ?? [];
  const paid = catalog?.models.filter((m) => m.tier === "paid") ?? [];

  return (
    <div className="models-page">
      <div className="page-header">
        <div>
          <h2>AI models</h2>
          <p>
            Pick which model does each job. Paid models need the premium AI models feature or your
            own key (<Link to="/settings/keys">API keys</Link>).
          </p>
        </div>
      </div>

      {error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-small" onClick={() => setReload((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : !catalog ? (
        <p className="empty-state" role="status">
          Loading AI models…
        </p>
      ) : catalog.models.length === 0 ? (
        <p className="empty-state">No AI models are turned on yet. Ask your admin to add one.</p>
      ) : (
        <>
          {catalog.free_only && (
            <p className="login-notice" role="status">
              &quot;Free tools only&quot; is on, so paid models are skipped. Change it on the{" "}
              <Link to="/providers">Job sources</Link> page.
            </p>
          )}
          <TaskPicker catalog={catalog} onChange={setCatalog} />
          <section className="card" aria-label="Available models">
            <h3>Available models</h3>
            {free.length > 0 && <h4 className="model-group-title">Free</h4>}
            <ul className="model-list">
              {free.map((m) => (
                <ModelRow key={m.id} model={m} />
              ))}
            </ul>
            {paid.length > 0 && <h4 className="model-group-title">Paid</h4>}
            <ul className="model-list">
              {paid.map((m) => (
                <ModelRow key={m.id} model={m} />
              ))}
            </ul>
          </section>
          {usage && <UsageCard usage={usage} />}
        </>
      )}
    </div>
  );
}
