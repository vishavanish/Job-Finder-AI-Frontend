/**
 * Providers (spec §6.8): every job source from the server with tier, risk,
 * health, the user's switch and whether it will run. "Free tools only" turns
 * off paid sources and paid AI models. Sources that need a key get inline
 * key entry (masked after saving). Replaces the old browser-only toggles.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../lib/api/errors";
import type { ProviderSettings, UserSource } from "../../lib/api/types";
import { addMyKey, getProviders, listMyKeys, updateProviderSettings } from "../models/modelsApi";
import { HealthBadge, TierBadge } from "../models/badges";
import { riskText } from "../models/format";
import { KeyForm } from "../models/KeyForm";
import "../admin/admin.css";
import "../models/models.css";

/** Sources grouped the way users think about them (keys from backend registry.py). */
const GROUPS: { title: string; note?: string; keys: string[] }[] = [
  { title: "Job boards", keys: ["linkedin", "indeed", "glassdoor", "google_jobs"] },
  {
    title: "Job APIs with a free key",
    note: "Official APIs. Get a free key from each provider and save it here; it's used only for your searches.",
    keys: ["adzuna", "jooble", "careerjet", "google_jobs_api"],
  },
  {
    title: "Remote job feeds",
    note: "Run when a search is for remote work — add Remote to your work modes in Profile or to a location.",
    keys: [
      "remoteok",
      "remotive",
      "himalayas",
      "jobicy",
      "wwr",
      "hn_hiring",
      "arbeitnow",
      "themuse",
    ],
  },
  { title: "Naukri", keys: ["naukri", "naukri_apify"] },
];

const KEY_LABELS: Record<string, string> = {
  brightdata: "Your Bright Data key (API_KEY:ZONE)",
  serpapi: "Your SerpApi key",
  jsearch: "Your JSearch (RapidAPI) key",
  adzuna: "Your Adzuna key (APP_ID:APP_KEY)",
  jooble: "Your Jooble key",
  careerjet: "Your Careerjet key",
  apify: "Your apify key",
};

function keyScopes(keyScope: string): string[] {
  return keyScope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function grouped(sources: UserSource[]): { title: string; note?: string; sources: UserSource[] }[] {
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const out = GROUPS.map((g) => ({
    ...g,
    sources: g.keys
      .map((k) => sources.find((s) => s.key === k))
      .filter((s): s is UserSource => Boolean(s)),
  }));
  const other = sources.filter((s) => !known.has(s.key));
  if (other.length) out.push({ title: "Other", keys: [], sources: other });
  return out.filter((g) => g.sources.length);
}

function SourceRow({
  source,
  busy,
  savedKeys,
  onToggle,
  onSaveKey,
}: {
  source: UserSource;
  busy: boolean;
  savedKeys: Record<string, string>;
  onToggle: (enabled: boolean) => void;
  onSaveKey: (scope: string, key: string) => Promise<unknown>;
}) {
  const id = useId();
  return (
    <li className="source-row">
      <div className="source-main">
        <div className="source-title">
          <span className="source-name" id={`${id}-name`}>
            {source.name}
          </span>
          <TierBadge tier={source.tier} />
          <HealthBadge
            lastSuccess={source.health.last_success_at}
            lastError={source.health.last_error}
            failures={source.health.consecutive_failures}
          />
        </div>
        {source.description && <p className="source-desc">{source.description}</p>}
        {!source.default_enabled && !source.enabled && (
          <p className="source-desc">Off unless you turn it on.</p>
        )}
        <p className="source-desc">{riskText(source.tos_risk)}</p>
        <p className={source.available ? "source-state is-on" : "source-state"} id={`${id}-state`}>
          {source.available ? "Will run in your next search." : `Won't run: ${source.reason}.`}
        </p>
        {source.requires_key &&
          source.key_scope &&
          source.enabled &&
          keyScopes(source.key_scope).map((scope) => (
            <KeyForm
              key={scope}
              scope={scope}
              label={KEY_LABELS[scope] ?? `Your ${scope} key`}
              saved={savedKeys[scope] ?? null}
              onSave={(key) => onSaveKey(scope, key)}
            />
          ))}
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={source.enabled}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-state`}
        />
        <span className="slider" />
      </label>
    </li>
  );
}

export default function ProvidersPage() {
  const [data, setData] = useState<ProviderSettings | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const freeId = useId();

  const loadKeys = useCallback(async () => {
    try {
      const res = await listMyKeys();
      setKeys(Object.fromEntries(res.keys.map((k) => [k.scope, k.masked])));
    } catch {
      // Keys are optional here; the source list still works without them.
    }
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    getProviders()
      .then((res) => active && setData(res))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load your job sources.")));
    void loadKeys();
    return () => {
      active = false;
    };
  }, [reload, loadKeys]);

  const save = async (body: Parameters<typeof updateProviderSettings>[0]) => {
    setBusy(true);
    setError("");
    try {
      setData(await updateProviderSettings(body));
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async (scope: string, key: string) => {
    await addMyKey(scope, key);
    await loadKeys();
    setData(await getProviders());
  };

  const paidCount = data?.sources.filter((s) => s.tier === "paid" || s.tier === "byok").length ?? 0;
  const running = data?.sources.filter((s) => s.available).length ?? 0;

  return (
    <div className="models-page">
      <div className="page-header">
        <div>
          <h2>Job sources</h2>
          <p>
            Choose where searches look for jobs. The server skips any source that can&apos;t run and
            tells you why.
          </p>
        </div>
      </div>

      {error && (
        <div className="login-error" role="alert">
          {error}{" "}
          {!data && (
            <button type="button" className="link-button" onClick={() => setReload((k) => k + 1)}>
              Try again
            </button>
          )}
        </div>
      )}

      {!data && !error && (
        <p className="empty-state" role="status">
          Loading job sources…
        </p>
      )}

      {data && (
        <>
          <section className="card free-only" aria-labelledby={`${freeId}-h`}>
            <div className="free-only-row">
              <div>
                <h3 id={`${freeId}-h`}>Free tools only</h3>
                <p className="field-hint" id={`${freeId}-d`}>
                  When on, nothing that costs money runs: {paidCount} paid job source
                  {paidCount === 1 ? "" : "s"} and every paid AI model are skipped, even if you
                  added your own key. <Link to="/settings/ai">See AI models</Link>.
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={data.free_only}
                  disabled={busy}
                  onChange={(e) => void save({ free_only: e.target.checked, enabled: {} })}
                  aria-labelledby={`${freeId}-h`}
                  aria-describedby={`${freeId}-d`}
                />
                <span className="slider" />
              </label>
            </div>
          </section>

          <section className="card" aria-labelledby={`${freeId}-list`}>
            <h3 id={`${freeId}-list`}>
              Sources <span className="count-note">{running} will run</span>
            </h3>
            {grouped(data.sources).map((g) => (
              <div key={g.title} className="source-group">
                <h4 className="model-group-title">{g.title}</h4>
                {g.note && <p className="field-hint">{g.note}</p>}
                <ul className="source-list">
                  {g.sources.map((s) => (
                    <SourceRow
                      key={s.key}
                      source={s}
                      busy={busy}
                      savedKeys={keys}
                      onToggle={(enabled) => void save({ enabled: { [s.key]: enabled } })}
                      onSaveKey={(scope, key) => saveKey(scope, key)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
