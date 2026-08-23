import { useState } from "react";
import { useSettings } from "../context/SettingsContext.jsx";
import ChipEditor from "../components/ChipEditor.jsx";

export default function KeywordsPage() {
  const { settings, update } = useSettings();
  const [resultsPerKeyword, setResultsPerKeyword] = useState(settings.thresholds.resultsPerKeyword);
  const [maxAgeHours, setMaxAgeHours] = useState(settings.thresholds.maxAgeHours);

  const saveThresholds = () => {
    update({
      thresholds: {
        ...settings.thresholds,
        resultsPerKeyword: Number(resultsPerKeyword) || 25,
        maxAgeHours: Number(maxAgeHours) || 24,
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Keywords &amp; Locations</h2>
          <p>These drive the job search — sent as dynamic fields to POST /api/v1/search.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Search Keywords</h3>
          <ChipEditor
            items={settings.keywords}
            placeholder="e.g. AI Engineer"
            onChange={(keywords) => update({ keywords })}
          />
        </div>

        <div className="card">
          <h3>Locations</h3>
          <ChipEditor
            items={settings.locations}
            placeholder="e.g. Mumbai, India"
            onChange={(locations) => update({ locations })}
          />
        </div>
      </div>

      <div className="card">
        <h3>Search Limits</h3>
        <div className="grid-2">
          <div className="form-field">
            <label>Results per keyword</label>
            <input
              type="number"
              min="1"
              max="200"
              value={resultsPerKeyword}
              onChange={(e) => setResultsPerKeyword(e.target.value)}
              onBlur={saveThresholds}
            />
          </div>
          <div className="form-field">
            <label>Max posting age (hours)</label>
            <input
              type="number"
              min="1"
              max="720"
              value={maxAgeHours}
              onChange={(e) => setMaxAgeHours(e.target.value)}
              onBlur={saveThresholds}
            />
          </div>
        </div>
        <p className="field-hint">Saved automatically — used the next time you run the pipeline.</p>
      </div>
    </div>
  );
}
