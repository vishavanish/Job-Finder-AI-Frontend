/**
 * A session's report (spec §6.10 report, §7.1 after Stop): Practice shows
 * per-answer and overall scores, STAR parts, filler words and pace,
 * strengths, improvements and model answers; Live Copilot shows the
 * debrief, weak topics, the questions to prepare and every card. Feedback is
 * polled every 3 s while it is being prepared (stops after 2 minutes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "../../lib/api/errors";
import type { AnswerFeedback } from "../../lib/api/types";
import { InterviewNav, ScoreBars } from "./parts";
import {
  END_REASONS,
  createVoiceSession,
  deleteVoiceSession,
  formatDuration,
  getVoiceFeedback,
  getVoiceSession,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const POLL_MS = 3000;
const POLL_LIMIT_MS = 120_000;
const STAR = ["situation", "task", "action", "result"] as const;

function AnswerCard({ a, index }: { a: AnswerFeedback; index: number }) {
  const m = a.metrics as { wpm?: number | null; filler_count?: number; long_pauses?: number };
  return (
    <li className="card iv-answer">
      <h4>
        {index + 1}. {a.question}
      </h4>
      <p className="iv-your-answer">
        <span className="iv-who">Your answer</span> {a.answer || <em>(no answer)</em>}
      </p>
      <ScoreBars scores={a.scores} />
      {Object.keys(a.star).length > 0 && (
        <p className="iv-star" aria-label="STAR parts">
          {STAR.map((k) => (
            <span key={k} className={`badge ${a.star[k] ? "tone-positive" : "tone-muted"}`}>
              {a.star[k] ? "✓" : "–"} {k}
            </span>
          ))}
        </p>
      )}
      {(m.wpm || m.filler_count) && (
        <p className="field-hint">
          {m.wpm ? `${m.wpm} words per minute` : ""}
          {m.filler_count
            ? ` · ${m.filler_count} filler word${m.filler_count === 1 ? "" : "s"}`
            : ""}
          {m.long_pauses ? ` · ${m.long_pauses} long pause${m.long_pauses === 1 ? "" : "s"}` : ""}
        </p>
      )}
      {a.strengths.length > 0 && (
        <div>
          <h5>Strengths</h5>
          <ul>
            {a.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {a.improvements.length > 0 && (
        <div>
          <h5>Improve</h5>
          <ul>
            {a.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {a.model_answer && (
        <details className="iv-model">
          <summary>Model answer (from your resume and stories)</summary>
          <p className="iv-pre">{a.model_answer}</p>
        </details>
      )}
    </li>
  );
}

export default function SessionReportPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [since] = useState(() => Date.now());
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const detail = useQuery({ queryKey: voiceKeys.session(id), queryFn: () => getVoiceSession(id) });
  const feedback = useQuery({
    queryKey: voiceKeys.feedback(id),
    queryFn: () => getVoiceFeedback(id),
    refetchInterval: (q) =>
      q.state.data?.state === "pending" && visible && Date.now() - since < POLL_LIMIT_MS
        ? POLL_MS
        : false,
  });
  useEffect(() => {
    if (feedback.data?.state === "ready")
      void qc.invalidateQueries({ queryKey: voiceKeys.session(id) });
  }, [feedback.data?.state, id, qc]);

  const drill = useMutation({
    mutationFn: (questions: string[]) =>
      createVoiceSession({
        mode: "mock",
        interview_type: "behavioral",
        length: Math.max(3, questions.length),
        focus_questions: questions,
      }),
    onSuccess: (created) =>
      navigate(`/interview/practice/${created.session.id}`, {
        state: { token: created.stream_token, path: created.stream_path },
      }),
  });

  if (detail.isLoading)
    return (
      <p className="field-hint" role="status">
        Loading the session…
      </p>
    );
  if (detail.error || !detail.data) {
    return (
      <div className="iv-page">
        <InterviewNav />
        <p className="login-error" role="alert">
          {errorMessage(detail.error, "This session doesn't exist (it may have been deleted).")}
        </p>
        <Link to="/interview/history">Back to history</Link>
      </div>
    );
  }
  const s = detail.data.session;
  const fb = feedback.data;
  const copilot = s.mode === "copilot";
  const weak = fb?.weak_questions ?? [];
  const weakTopics = ((fb?.delivery as { weak_topics?: string[] } | undefined)?.weak_topics ??
    []) as string[];
  const delivery = fb?.delivery as
    { wpm?: number; filler_count?: number; long_pauses?: number } | undefined;

  return (
    <div className="iv-page">
      <div className="page-header">
        <div>
          <h2>
            {copilot
              ? "Live Copilot session"
              : `${typeLabel(String(s.config.interview_type ?? ""))} practice`}
          </h2>
          <p>
            {new Date(s.created_at).toLocaleString()} · {formatDuration(s.duration_s)} ·{" "}
            {END_REASONS[s.end_reason ?? ""] ?? s.state}
            {s.job_title ? ` · ${s.job_title}, ${s.company}` : s.role ? ` · ${s.role}` : ""}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setConfirm(true)}>
          Delete session
        </button>
      </div>
      <InterviewNav />

      {(!fb || fb.state === "pending") && (
        <p className="card iv-pending" role="status">
          <span className="spinner" aria-hidden="true" /> Your feedback is being prepared — this
          usually takes under a minute.
        </p>
      )}
      {fb?.state === "failed" && (
        <p className="login-error" role="alert">
          We couldn't prepare feedback for this session (no AI model was available). The transcript
          is below.
        </p>
      )}

      {fb?.state === "ready" && (
        <>
          <section className="card iv-summary" aria-labelledby="summary-title">
            <h3 id="summary-title">{copilot ? "Debrief" : "Overall"}</h3>
            {!copilot && fb.overall_score != null && (
              <p className="iv-overall">
                <strong className="num">{fb.overall_score.toFixed(1)}</strong>/5
              </p>
            )}
            {fb.summary && <p>{fb.summary}</p>}
            {!copilot && <ScoreBars scores={fb.scores ?? {}} />}
            {delivery?.wpm != null && (
              <p className="field-hint">
                Pace {delivery.wpm} words per minute · {delivery.filler_count ?? 0} filler words ·{" "}
                {delivery.long_pauses ?? 0} long pauses
              </p>
            )}
            {weakTopics.length > 0 && <p>Weak topics: {weakTopics.join(", ")}</p>}
            {(fb.improvements ?? []).length > 0 && (
              <>
                <h4>What to improve</h4>
                <ul>
                  {(fb.improvements ?? []).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {weak.length > 0 && (
              <div className="iv-weak">
                <h4>{copilot ? "Questions to prepare" : "Weak questions"}</h4>
                <ul>
                  {weak.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn-run"
                  onClick={() => drill.mutate(weak)}
                  disabled={drill.isPending}
                >
                  Practice these questions
                </button>
                {drill.error && <p className="login-error">{errorMessage(drill.error)}</p>}
              </div>
            )}
          </section>

          {copilot ? (
            <section aria-labelledby="cards-title">
              <h3 id="cards-title">Questions and suggestions</h3>
              <ol className="iv-answers">
                {(fb.answers ?? []).map((a, i) => (
                  <li key={`${a.question}-${i}`} className="card iv-answer">
                    <h4>{a.question}</h4>
                    <p className="iv-pre">{a.answer || <em>(no suggestion shown)</em>}</p>
                    {Boolean((a.metrics as { not_sure?: boolean }).not_sure) && (
                      <span className="badge tone-attention">not sure</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section aria-labelledby="answers-title">
              <h3 id="answers-title">Answer by answer</h3>
              <ol className="iv-answers">
                {(fb.answers ?? []).map((a, i) => (
                  <AnswerCard key={a.turn_id ?? i} a={a} index={i} />
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <details className="card iv-transcript">
        <summary>Full transcript</summary>
        <ol>
          {detail.data.turns.map((t) => (
            <li key={t.id}>
              <span className="iv-who">
                {t.speaker === "assistant"
                  ? "Suggestion"
                  : t.speaker === "user"
                    ? "You"
                    : "Interviewer"}
              </span>{" "}
              {t.text}
            </li>
          ))}
        </ol>
        <p className="field-hint">
          Transcripts are kept encrypted for 90 days. Audio is never recorded.
        </p>
      </details>

      {confirm && (
        <ConfirmDialog
          title="Delete this session?"
          confirmLabel="Delete session"
          danger
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await deleteVoiceSession(id);
            await qc.invalidateQueries({ queryKey: voiceKeys.all });
            navigate("/interview/history");
          }}
        >
          The transcript, scores and feedback are deleted for good.
        </ConfirmDialog>
      )}
    </div>
  );
}
