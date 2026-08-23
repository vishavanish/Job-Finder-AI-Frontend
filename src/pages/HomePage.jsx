import { useState } from "react";
import { useSettings } from "../context/SettingsContext.jsx";
import { useRun } from "../context/RunContext.jsx";
import { startApply, pollTask, listApplications, updateApplicationStatus } from "../api/client.js";

function buildPipelinePayload(settings) {
  const sources = Object.entries(settings.providers)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  return {
    search: {
      keywords: settings.keywords,
      locations: settings.locations,
      sources: sources.length ? sources : ["linkedin", "indeed"],
      results_per_keyword: settings.thresholds.resultsPerKeyword,
      max_age_hours: settings.thresholds.maxAgeHours,
    },
    score: {
      resume_summary: settings.resumeSummary,
      skills: settings.skills,
      career_targets: settings.careerTargets,
      keyword_prefilter_min_pct: settings.thresholds.keywordPrefilterMinPct,
      llm_top_n_to_rank: settings.thresholds.llmTopNToRank,
      llm_min_score_to_keep: settings.thresholds.llmMinScoreToKeep,
    },
  };
}

function scoreClass(score) {
  if (score >= 80) return "job-score";
  if (score >= 60) return "job-score mid";
  return "job-score low";
}

// After an apply task completes, the created Application row isn't
// returned directly by /apply — look it up by matching job_url against
// the user's most recent applications.
async function findApplicationIdByUrl(jobUrl) {
  try {
    const { data } = await listApplications({ limit: 20, offset: 0 });
    const match = data.applications.find((a) => a.url === jobUrl);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const { settings } = useSettings();
  const { status, progressLog, jobs, error, run } = useRun();
  const [applyingUrl, setApplyingUrl] = useState(null);
  const [applicationIds, setApplicationIds] = useState({}); // job.url -> application id
  const [appliedUrls, setAppliedUrls] = useState(new Set());
  const [markedUrls, setMarkedUrls] = useState(new Set());
  const [applyErrors, setApplyErrors] = useState({});

  const handleRun = () => {
    setAppliedUrls(new Set());
    setMarkedUrls(new Set());
    setApplicationIds({});
    setApplyErrors({});
    run(buildPipelinePayload(settings));
  };

  const handleApply = async (job) => {
    setApplyingUrl(job.url);
    setApplyErrors((prev) => ({ ...prev, [job.url]: "" }));
    try {
      const { data } = await startApply({
        jobs: [job],
        applicant_info: {
          first_name: settings.applicant.first_name,
          last_name: settings.applicant.last_name,
          email: settings.applicant.email,
          phone: settings.applicant.phone,
        },
        open_top_n: 1,
        auto_fill_easy_apply: true,
      });

      // Backend logs "opened" as soon as the task starts running — we
      // don't need to wait for it to finish before reflecting that here.
      setAppliedUrls((prev) => new Set(prev).add(job.url));

      pollTask(data.task_id, { intervalMs: 2000, maxAttempts: 120 })
        .then(async (finalTask) => {
          if (finalTask.status === "completed") {
            const appId = await findApplicationIdByUrl(job.url);
            if (appId) {
              setApplicationIds((prev) => ({ ...prev, [job.url]: appId }));
            }
          } else if (finalTask.status === "failed") {
            setApplyErrors((prev) => ({
              ...prev,
              [job.url]: finalTask.error || "Apply task failed.",
            }));
          }
        })
        .catch((err) => {
          setApplyErrors((prev) => ({
            ...prev,
            [job.url]: err.message || "Lost track of the apply task.",
          }));
        });
    } catch (err) {
      setApplyErrors((prev) => ({
        ...prev,
        [job.url]: err.authError || err.rateLimitError || err?.response?.data?.detail || err.message,
      }));
    } finally {
      setApplyingUrl(null);
    }
  };

  const handleMarkApplied = async (job) => {
    const appId = applicationIds[job.url];
    if (!appId) return;
    try {
      await updateApplicationStatus(appId, "submitted");
      setMarkedUrls((prev) => new Set(prev).add(job.url));
    } catch (err) {
      setApplyErrors((prev) => ({
        ...prev,
        [job.url]: err.authError || err.rateLimitError || err?.response?.data?.detail || err.message,
      }));
    }
  };

  const isRunning = status === "running";

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Run &amp; Results</h2>
          <p>Searches your configured keywords/locations/providers, scores against your profile, and lists matches here.</p>
        </div>
      </div>

      <div className="card">
        <div className="run-bar">
          <button className="btn-run" onClick={handleRun} disabled={isRunning}>
            {isRunning && <span className="spinner" />}
            {isRunning ? "Running..." : "▶ Run Job Search"}
          </button>

          {status !== "idle" && (
            <span className={`status-pill ${status}`}>
              {status === "running" && <span className="spinner" />}
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          )}

          <span className="field-hint" style={{ marginLeft: "auto" }}>
            {settings.keywords.length} keyword(s) · {settings.locations.length} location(s) ·{" "}
            {Object.values(settings.providers).filter(Boolean).length} provider(s)
          </span>
        </div>

        {error && <div className="login-error" style={{ marginTop: 14 }}>{error}</div>}

        {isRunning && (
          <p className="field-hint" style={{ marginTop: 10 }}>
            {progressLog.length} update{progressLog.length === 1 ? "" : "s"} received so far —
            this can take several minutes while scraping runs across all keyword/location combinations.
          </p>
        )}

        {progressLog.length > 0 && (
          <div className="progress-log">
            {progressLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Matching Jobs ({jobs.length})</h3>
        {jobs.length === 0 ? (
          <div className="empty-state">
            {isRunning ? "Searching and scoring — results will appear here." : "Run a search to see matches."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fit</th>
                <th>Title</th>
                <th>Source</th>
                <th>Location</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const isOpened = appliedUrls.has(job.url);
                const isMarked = markedUrls.has(job.url);
                const hasAppId = !!applicationIds[job.url];
                const rowError = applyErrors[job.url];

                return (
                  <tr key={job.url}>
                    <td>
                      <span className={scoreClass(job.llm_score ?? 0)}>{Math.round(job.llm_score ?? 0)}%</span>
                    </td>
                    <td>
                      <div className="job-title-cell">{job.title}</div>
                      <div className="job-company-cell">{job.company}</div>
                    </td>
                    <td><span className="source-badge">{job.source}</span></td>
                    <td>{job.location}</td>
                    <td style={{ maxWidth: 280 }}>{job.llm_reason}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <button
                          className={`btn-apply ${isOpened ? "applied" : ""}`}
                          disabled={applyingUrl === job.url}
                          onClick={() => handleApply(job)}
                        >
                          {applyingUrl === job.url
                            ? "Opening..."
                            : isOpened
                            ? "✓ Opened"
                            : "Apply"}
                        </button>

                        {isOpened && !isMarked && hasAppId && (
                          <button className="btn-small" onClick={() => handleMarkApplied(job)}>
                            Mark as Applied
                          </button>
                        )}
                        {isOpened && !isMarked && !hasAppId && (
                          <span className="field-hint">Finding record...</span>
                        )}
                        {isMarked && <span className="field-hint">✓ Marked applied</span>}

                        {rowError && (
                          <span className="field-hint" style={{ color: "var(--red)" }}>{rowError}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}