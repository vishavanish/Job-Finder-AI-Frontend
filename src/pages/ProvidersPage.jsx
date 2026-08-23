import { useSettings } from "../context/SettingsContext.jsx";

const PROVIDERS = [
  { key: "linkedin", name: "LinkedIn", desc: "Includes optional Easy Apply pre-fill", icon: "in" },
  { key: "indeed", name: "Indeed", desc: "Standard search via JobSpy", icon: "In" },
  { key: "naukri", name: "Naukri", desc: "Blocks automated scraping — needs manual paste-in or Apify", icon: "Nk" },
];

export default function ProvidersPage() {
  const { settings, update } = useSettings();

  const toggle = (key) => {
    update({ providers: { ...settings.providers, [key]: !settings.providers[key] } });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Job Providers</h2>
          <p>Which sources feed POST /api/v1/search's `sources` field.</p>
        </div>
      </div>

      <div className="card">
        <h3>Sources</h3>
        {PROVIDERS.map((p) => (
          <div className="provider-row" key={p.key}>
            <div className="provider-info">
              <div className="provider-icon">{p.icon}</div>
              <div>
                <div className="pname">{p.name}</div>
                <div className="pdesc">{p.desc}</div>
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!settings.providers[p.key]}
                onChange={() => toggle(p.key)}
              />
              <span className="slider" />
            </label>
          </div>
        ))}
      </div>

      {settings.providers.naukri && (
        <div className="card">
          <h3>Naukri Notes</h3>
          <p className="field-hint">
            Naukri returns a CAPTCHA wall for automated requests. Either paste jobs manually
            (handled server-side via <code>manual_naukri_jobs</code>) or enable the paid Apify
            actor path in the backend's <code>.env</code>. This toggle just tells the search
            request to include Naukri in <code>sources</code>.
          </p>
        </div>
      )}
    </div>
  );
}
