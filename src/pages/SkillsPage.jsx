import { useState } from "react";
import { useSettings } from "../context/SettingsContext.jsx";
import ChipEditor from "../components/ChipEditor.jsx";

export default function SkillsPage() {
  const { settings, update } = useSettings();
  const [resume, setResume] = useState(settings.resumeSummary);
  const [minScore, setMinScore] = useState(settings.thresholds.llmMinScoreToKeep);
  const [prefilter, setPrefilter] = useState(settings.thresholds.keywordPrefilterMinPct);
  const [topN, setTopN] = useState(settings.thresholds.llmTopNToRank);

  const saveResume = () => update({ resumeSummary: resume });

  const saveThresholds = () => {
    update({
      thresholds: {
        ...settings.thresholds,
        llmMinScoreToKeep: Number(minScore) || 70,
        keywordPrefilterMinPct: Number(prefilter) || 30,
        llmTopNToRank: Number(topN) || 40,
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Skills &amp; Resume</h2>
          <p>Your candidate profile — sent as dynamic fields to POST /api/v1/score.</p>
        </div>
      </div>

      <div className="card">
        <h3>Skills</h3>
        <ChipEditor
          items={settings.skills}
          placeholder="e.g. fastapi"
          onChange={(skills) => update({ skills })}
        />
      </div>

      <div className="card">
        <h3>Career Targets</h3>
        <ChipEditor
          items={settings.careerTargets}
          placeholder="e.g. Senior Backend Developer"
          onChange={(careerTargets) => update({ careerTargets })}
        />
      </div>

      <div className="card">
        <h3>Resume Summary</h3>
        <div className="form-field">
          <textarea
            rows={5}
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            onBlur={saveResume}
            placeholder="Short summary of your experience and stack..."
          />
        </div>
      </div>

      <div className="card">
        <h3>Scoring Thresholds</h3>
        <div className="grid-2">
          <div className="form-field">
            <label>Keyword prefilter min %</label>
            <input type="number" min="0" max="100" value={prefilter}
              onChange={(e) => setPrefilter(e.target.value)} onBlur={saveThresholds} />
          </div>
          <div className="form-field">
            <label>Top N to send to LLM</label>
            <input type="number" min="1" max="200" value={topN}
              onChange={(e) => setTopN(e.target.value)} onBlur={saveThresholds} />
          </div>
          <div className="form-field">
            <label>Min LLM score to keep</label>
            <input type="number" min="0" max="100" value={minScore}
              onChange={(e) => setMinScore(e.target.value)} onBlur={saveThresholds} />
          </div>
        </div>
      </div>
    </div>
  );
}
