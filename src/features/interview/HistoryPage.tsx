/**
 * Voice history (F7 plan §1.7): Practice and Copilot sessions with date,
 * length, score and cost; open a report, delete one, or delete all voice
 * data (the confirmation spells out what goes).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { VoiceSession } from "../../lib/api/types";
import { InterviewNav } from "./parts";
import {
  END_REASONS,
  deleteVoiceHistory,
  deleteVoiceSession,
  formatDuration,
  getVoiceHistory,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const MODES = [
  { value: "", label: "All" },
  { value: "mock", label: "Practice" },
  { value: "copilot", label: "Live Copilot" },
];

function title(s: VoiceSession): string {
  const base =
    s.mode === "copilot"
      ? "Live Copilot"
      : `${typeLabel(String(s.config.interview_type ?? ""))} practice`;
  return s.job_title ? `${base} · ${s.job_title}` : s.role ? `${base} · ${s.role}` : base;
}

export default function HistoryPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState("");
  const [confirm, setConfirm] = useState<VoiceSession | "all" | null>(null);
  const history = useQuery({
    queryKey: voiceKeys.history(mode),
    queryFn: () => getVoiceHistory(mode, 100),
  });
  const rows = history.data?.sessions ?? [];

  return (
    <div className="iv-page">
      <div className="page-header">
        <div>
          <h2>Interview history</h2>
          <p>Transcripts are kept encrypted for 90 days, then deleted. Audio is never recorded.</p>
        </div>
        {rows.length > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setConfirm("all")}>
            Delete all voice data
          </button>
        )}
      </div>
      <InterviewNav />
      <div className="iv-filter" role="group" aria-label="Show">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className="ats-pick"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {history.isLoading ? (
        <p className="field-hint" role="status">
          Loading sessions…
        </p>
      ) : history.error ? (
        <p className="login-error" role="alert">
          {errorMessage(history.error)}{" "}
          <button type="button" className="link-button" onClick={() => void history.refetch()}>
            Retry
          </button>
        </p>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No sessions yet.</p>
          <Link className="btn-run" to="/interview">
            Start a practice interview
          </Link>
        </div>
      ) : (
        <ul className="iv-history">
          {rows.map((s) => (
            <li key={s.id} className="card">
              <div>
                <Link to={`/interview/sessions/${s.id}`} className="iv-history-title">
                  {title(s)}
                </Link>
                <p className="field-hint">
                  {new Date(s.created_at).toLocaleString()} · {formatDuration(s.duration_s)} ·{" "}
                  {END_REASONS[s.end_reason ?? ""] ?? s.state}
                  {s.mode === "copilot" ? ` · ${s.question_count} questions` : ""}
                  {s.cost_usd > 0 ? ` · $${s.cost_usd.toFixed(3)}` : " · free"}
                </p>
              </div>
              <div className="row-actions">
                {s.overall_score != null && (
                  <span className="badge tone-progress num">{s.overall_score.toFixed(1)}/5</span>
                )}
                {s.feedback_state === "pending" && (
                  <span className="badge tone-active">feedback pending</span>
                )}
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setConfirm(s)}
                  aria-label={`Delete ${title(s)}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === "all" ? "Delete all voice data?" : "Delete this session?"}
          confirmLabel={confirm === "all" ? "Delete everything" : "Delete session"}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === "all") await deleteVoiceHistory();
            else await deleteVoiceSession(confirm.id);
            await qc.invalidateQueries({ queryKey: voiceKeys.all });
            setConfirm(null);
          }}
        >
          {confirm === "all"
            ? `All ${history.data?.total ?? rows.length} sessions — transcripts, scores, feedback and copilot answers — are deleted for good. Your story bank stays.`
            : "Its transcript, scores and feedback are deleted for good."}
        </ConfirmDialog>
      )}
    </div>
  );
}
