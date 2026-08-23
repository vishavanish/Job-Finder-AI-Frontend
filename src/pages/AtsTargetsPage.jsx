import { useState } from "react";
import { useSettings } from "../context/SettingsContext.jsx";

const PLATFORMS = ["greenhouse", "lever", "smartrecruiters", "workday", "successfactors", "custom"];

export default function AtsTargetsPage() {
  const { settings, update } = useSettings();
  const [platform, setPlatform] = useState("greenhouse");
  const [slug, setSlug] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const addTarget = () => {
    if (!slug.trim()) return;
    const target = { platform, slug: slug.trim() };
    if (platform === "custom") {
      if (!customUrl.trim()) return;
      target.custom_endpoint_url = customUrl.trim();
      target.custom_method = "GET";
    }
    update({ atsTargets: [...settings.atsTargets, target] });
    setSlug("");
    setCustomUrl("");
  };

  const removeTarget = (idx) => {
    update({ atsTargets: settings.atsTargets.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Company ATS Targets</h2>
          <p>Direct company career pages (Greenhouse / Lever / SmartRecruiters / custom) — POST /api/v1/company-ats/fetch.</p>
        </div>
      </div>

      <div className="card">
        <h3>Add a Target</h3>
        <div className="grid-2">
          <div className="form-field">
            <label>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Company slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. stripe"
            />
          </div>
        </div>
        {platform === "custom" && (
          <div className="form-field">
            <label>Custom JSON endpoint URL</label>
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://careers.example.com/api/jobs"
            />
          </div>
        )}
        <button className="btn-add" style={{ marginTop: 8 }} onClick={addTarget}>
          + Add Target
        </button>
      </div>

      <div className="card">
        <h3>Configured Targets</h3>
        {settings.atsTargets.length === 0 ? (
          <div className="empty-state">No ATS targets yet — add one above.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Slug</th>
                <th>Endpoint</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.atsTargets.map((t, idx) => (
                <tr key={`${t.platform}-${t.slug}-${idx}`}>
                  <td><span className="source-badge">{t.platform}</span></td>
                  <td>{t.slug}</td>
                  <td>{t.custom_endpoint_url || "—"}</td>
                  <td>
                    <button className="btn-danger-small" onClick={() => removeTarget(idx)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
