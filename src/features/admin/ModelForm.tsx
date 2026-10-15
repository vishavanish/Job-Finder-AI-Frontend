/**
 * Add or edit an AI model. Base URL appears only for OpenAI-compatible models;
 * the key name (scope) is filled in from the provider or the URL's host, and
 * the admin may change it. Provider, model id and base URL are fixed after
 * creation (delete and re-add to change them).
 */
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { AdminModel, AdminModelCreate } from "../../lib/api/types";
import { TASK_LABELS, providerLabel } from "../models/tasks";

const PROVIDERS = ["gemini", "groq", "huggingface", "anthropic", "openai_compatible"] as const;
type Provider = (typeof PROVIDERS)[number];

const MODEL_HINTS: Record<Provider, string> = {
  gemini: "e.g. gemini-2.5-flash",
  groq: "e.g. openai/gpt-oss-120b",
  huggingface: "e.g. Qwen/Qwen3-8B",
  anthropic: "e.g. claude-sonnet-5-5",
  openai_compatible: "e.g. deepseek/deepseek-chat",
};

function suggestScope(provider: string, baseUrl: string): string {
  if (provider !== "openai_compatible") return provider;
  try {
    const parts = new URL(baseUrl).hostname
      .toLowerCase()
      .split(".")
      .filter((p) => p !== "api" && p !== "www");
    return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? "";
  } catch {
    return "";
  }
}

interface Draft {
  provider: Provider;
  model_id: string;
  display_name: string;
  tier: "free" | "paid";
  base_url: string;
  key_scope: string;
  scopeTouched: boolean;
  cost_in: string;
  cost_out: string;
  priority: string;
  allTasks: boolean;
  tasks: string[];
  notes: string;
}

function initial(model?: AdminModel): Draft {
  return {
    provider: (model?.provider as Provider) ?? "openai_compatible",
    model_id: model?.model_id ?? "",
    display_name: model?.display_name ?? "",
    tier: (model?.tier as "free" | "paid") ?? "free",
    base_url: model?.base_url ?? "",
    key_scope: model?.key_scope ?? "",
    scopeTouched: Boolean(model),
    cost_in: String(model?.cost_per_1k_in ?? 0),
    cost_out: String(model?.cost_per_1k_out ?? 0),
    priority: String(model?.priority ?? 100),
    allTasks: !model || model.tasks.length === 0,
    tasks: model?.tasks ?? [],
    notes: model?.notes ?? "",
  };
}

export function ModelForm({
  model,
  onSubmit,
  onCancel,
}: {
  model?: AdminModel;
  onSubmit: (body: AdminModelCreate) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => initial(model));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const f = useId();
  const editing = Boolean(model);
  const scope = d.scopeTouched ? d.key_scope : suggestScope(d.provider, d.base_url);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!d.model_id.trim() || !d.display_name.trim()) {
      setError("Enter the model id and a display name.");
      return;
    }
    if (d.provider === "openai_compatible" && !/^https?:\/\/\S+$/.test(d.base_url.trim())) {
      setError("OpenAI-compatible models need a base URL like https://openrouter.ai/api/v1.");
      return;
    }
    const costIn = Number(d.cost_in);
    const costOut = Number(d.cost_out);
    const priority = Number(d.priority);
    if (!(costIn >= 0) || !(costOut >= 0) || !Number.isInteger(priority) || priority < 0) {
      setError("Costs must be 0 or more, and priority a whole number (lower runs first).");
      return;
    }
    if (!d.allTasks && d.tasks.length === 0) {
      setError("Pick at least one task, or choose “Every task”.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        provider: d.provider,
        model_id: d.model_id.trim(),
        display_name: d.display_name.trim(),
        tier: d.tier,
        base_url: d.provider === "openai_compatible" ? d.base_url.trim() : null,
        key_scope: scope || null,
        cost_per_1k_in: costIn,
        cost_per_1k_out: costOut,
        priority,
        tasks: d.allTasks ? [] : d.tasks,
        notes: d.notes.trim() || null,
        enabled_global: model?.enabled_global ?? true,
      });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the model."));
      setBusy(false);
    }
  };

  return (
    <form className="card model-form" onSubmit={submit} noValidate aria-labelledby={`${f}-h`}>
      <h3 id={`${f}-h`}>{editing ? `Edit ${model!.display_name}` : "Add an AI model"}</h3>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="model-form-grid">
        <div className="form-field">
          <label htmlFor={`${f}-provider`}>Provider</label>
          <select
            id={`${f}-provider`}
            value={d.provider}
            disabled={editing}
            onChange={(e) => set({ provider: e.target.value as Provider })}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {providerLabel(p)}
              </option>
            ))}
          </select>
          {d.provider === "openai_compatible" && (
            <p className="field-hint">
              OpenAI, OpenRouter, Together, DeepSeek, Mistral, a local Ollama…
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-model`}>Model id</label>
          <input
            id={`${f}-model`}
            value={d.model_id}
            disabled={editing}
            placeholder={MODEL_HINTS[d.provider]}
            onChange={(e) => set({ model_id: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-name`}>Display name</label>
          <input
            id={`${f}-name`}
            value={d.display_name}
            onChange={(e) => set({ display_name: e.target.value })}
          />
        </div>
        {d.provider === "openai_compatible" && (
          <div className="form-field">
            <label htmlFor={`${f}-url`}>Base URL</label>
            <input
              id={`${f}-url`}
              value={d.base_url}
              placeholder="https://openrouter.ai/api/v1"
              onChange={(e) => set({ base_url: e.target.value })}
            />
          </div>
        )}
        <div className="form-field">
          <label htmlFor={`${f}-tier`}>Free or paid</label>
          <select
            id={`${f}-tier`}
            value={d.tier}
            onChange={(e) => set({ tier: e.target.value as "free" | "paid" })}
          >
            <option value="free">Free — everyone can use it</option>
            <option value="paid">Paid — premium feature or own key</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-scope`}>Key name</label>
          <input
            id={`${f}-scope`}
            value={scope}
            placeholder="e.g. openrouter"
            onChange={(e) =>
              set({ key_scope: e.target.value.trim().toLowerCase(), scopeTouched: true })
            }
          />
          <p className="field-hint">Models with the same key name share one key.</p>
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-in`}>Cost per 1K input tokens (USD)</label>
          <input
            id={`${f}-in`}
            inputMode="decimal"
            value={d.cost_in}
            onChange={(e) => set({ cost_in: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-out`}>Cost per 1K output tokens (USD)</label>
          <input
            id={`${f}-out`}
            inputMode="decimal"
            value={d.cost_out}
            onChange={(e) => set({ cost_out: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`${f}-prio`}>Priority</label>
          <input
            id={`${f}-prio`}
            inputMode="numeric"
            value={d.priority}
            onChange={(e) => set({ priority: e.target.value })}
          />
          <p className="field-hint">Lower runs first when nobody picked a model.</p>
        </div>
      </div>

      <fieldset className="model-form-tasks">
        <legend>Tasks</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={d.allTasks}
            onChange={(e) => set({ allTasks: e.target.checked })}
          />
          Every task
        </label>
        {!d.allTasks &&
          Object.entries(TASK_LABELS).map(([task, label]) => (
            <label key={task} className="check">
              <input
                type="checkbox"
                checked={d.tasks.includes(task)}
                onChange={(e) =>
                  set({
                    tasks: e.target.checked
                      ? [...d.tasks, task]
                      : d.tasks.filter((t) => t !== task),
                  })
                }
              />
              {label}
            </label>
          ))}
      </fieldset>

      <div className="form-field">
        <label htmlFor={`${f}-notes`}>Notes (optional)</label>
        <input id={`${f}-notes`} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="admin-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-run" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add model"}
        </button>
      </div>
    </form>
  );
}
