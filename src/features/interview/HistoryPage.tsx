/**
 * Voice history (F7 plan §1.7; restyled in F7.1): Practice and Copilot sessions with date,
 * length, score and cost; open a report, delete one, or delete all voice
 * data (the confirmation spells out what goes).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon, type IconName } from "../../components/Icon";
import { EmptyState, IconTile, PageHeader, Segmented, StatChip } from "../../components/PageKit";
import { errorMessage } from "../../lib/api/errors";
import type { VoiceSession } from "../../lib/api/types";
import { InterviewNav, ScorePill } from "./parts";
import {
  END_REASONS,
  deleteVoiceHistory,
  deleteVoiceSession,
  formatDuration,
  getVoiceHistory,
  typeIcon,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const MODES: { value: string; label: string; icon: IconName }[] = [
  { value: "", label: "All", icon: "layers" },
  { value: "mock", label: "Practice", icon: "mic" },
  { value: "copilot", label: "Live Copilot", icon: "sparkle" },
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
      <PageHeader
        eyebrow="Interview prep"
        title="Interview history"
        sub="Transcripts are kept encrypted for 90 days, then deleted. Audio is never recorded."
      >
        {(history.data?.total ?? 0) > 0 && (
          <StatChip icon="history">
            <strong className="num">{history.data!.total}</strong>{" "}
            {history.data!.total === 1 ? "session" : "sessions"}
          </StatChip>
        )}
        {rows.length > 0 && (
          <button
            type="button"
            className="btn-secondary iv-icon-btn"
            onClick={() => setConfirm("all")}
          >
            <Icon name="trash" size={14} />
            Delete all voice data
          </button>
        )}
      </PageHeader>
      <InterviewNav />
      <Segmented label="Show" mode="toggle" options={MODES} value={mode} onChange={setMode} />
      {history.isLoading ? (
        <div className="iv-skeleton" role="status" aria-label="Loading sessions">
          <span />
          <span />
          <span />
        </div>
      ) : history.error ? (
        <p className="kit-banner bad" role="alert">
          {errorMessage(history.error)}{" "}
          <button type="button" className="link-button" onClick={() => void history.refetch()}>
            Retry
          </button>
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon="history" title="No sessions yet.">
          <p>Practice once and your reports, scores and transcripts collect here.</p>
          <Link className="btn-run" to="/interview">
            Start a practice interview
          </Link>
        </EmptyState>
      ) : (
        <ul className="card kit-card iv-history kit-rise">
          {rows.map((s) => (
            <li key={s.id} className="iv-history-row">
              <IconTile
                icon={
                  s.mode === "copilot" ? "sparkle" : typeIcon(String(s.config.interview_type ?? ""))
                }
                tone={s.mode === "copilot" ? "progress" : "accent"}
              />
              <div className="iv-history-main">
                <Link to={`/interview/sessions/${s.id}`} className="iv-history-title">
                  {title(s)}
                </Link>
                <p className="iv-history-meta">
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                  <span>{formatDuration(s.duration_s)}</span>
                  <span>{END_REASONS[s.end_reason ?? ""] ?? s.state}</span>
                  {s.mode === "copilot" && <span>{s.question_count} questions</span>}
                  <span>{s.cost_usd > 0 ? `$${s.cost_usd.toFixed(3)}` : "free"}</span>
                </p>
              </div>
              <div className="iv-history-side">
                {s.overall_score != null && <ScorePill score={s.overall_score} />}
                {s.feedback_state === "pending" && (
                  <span className="badge tone-active">feedback pending</span>
                )}
                <button
                  type="button"
                  className="iv-icon-only"
                  onClick={() => setConfirm(s)}
                  aria-label={`Delete ${title(s)}`}
                  title="Delete"
                >
                  <Icon name="trash" size={15} />
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
