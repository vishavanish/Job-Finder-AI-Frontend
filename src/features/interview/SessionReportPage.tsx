/**
 * A session's report (spec §6.10 report, §7.1 after Stop; restyled in
 * F7.1): Practice shows the overall score, delivery tiles, per-answer scores,
 * STAR steps, strengths, improvements and model answers; Live Copilot shows
 * the debrief, weak topics, the questions to prepare and every card.
 * Feedback is polled every 3 s while it is being prepared (stops after 2
 * minutes; the server keeps retrying busy AI models for longer, so "Check
 * again" resumes it). Failed feedback has a Try again button.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon, type IconName } from "../../components/Icon";
import { CardHead, IconTile, PageHeader, StatChip } from "../../components/PageKit";
import { errorMessage } from "../../lib/api/errors";
import type { AnswerFeedback } from "../../lib/api/types";
import { InterviewNav, ScoreBars, ScoreDial, ScorePill } from "./parts";
import {
  END_REASONS,
  createVoiceSession,
  deleteVoiceSession,
  formatDuration,
  getVoiceFeedback,
  getVoiceSession,
  retryVoiceFeedback,
  typeIcon,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const POLL_MS = 3000;
const POLL_LIMIT_MS = 120_000;
const STAR = ["situation", "task", "action", "result"] as const;

function average(scores: Record<string, unknown>): number | null {
  const v = Object.values(scores).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function MetricTile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="iv-metric">
      <Icon name={icon} size={16} />
      <span className="iv-metric-value num">{value}</span>
      <span className="iv-metric-label">{label}</span>
    </div>
  );
}

function AnswerCard({ a, index }: { a: AnswerFeedback; index: number }) {
  const m = a.metrics as { wpm?: number | null; filler_count?: number; long_pauses?: number };
  const avg = average(a.scores);
  return (
    <li className="card kit-card iv-answer">
      <div className="iv-answer-head">
        <span className="iv-answer-n num" aria-hidden="true">
          {index + 1}
        </span>
        <h4>
          <span className="sr-only">{index + 1}. </span>
          {a.question}
        </h4>
        {avg != null && <ScorePill score={avg} />}
      </div>
      <p className="iv-your-answer">
        <span className="iv-who">Your answer</span> {a.answer || <em>(no answer)</em>}
      </p>
      <div className="iv-answer-body">
        <ScoreBars scores={a.scores} />
        <div>
          {Object.keys(a.star).length > 0 && (
            <ol className="iv-star" aria-label="STAR parts">
              {STAR.map((k) => (
                <li key={k} className={a.star[k] ? "is-on" : ""}>
                  <span className="iv-star-dot" aria-hidden="true">
                    {a.star[k] ? <Icon name="check" size={12} /> : k[0]!.toUpperCase()}
                  </span>
                  <span>
                    {k}
                    <span className="sr-only">{a.star[k] ? " covered" : " missing"}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {(m.wpm || m.filler_count) && (
            <p className="field-hint">
              {m.wpm ? `${m.wpm} words per minute` : ""}
              {m.filler_count
                ? ` · ${m.filler_count} filler word${m.filler_count === 1 ? "" : "s"}`
                : ""}
              {m.long_pauses
                ? ` · ${m.long_pauses} long pause${m.long_pauses === 1 ? "" : "s"}`
                : ""}
            </p>
          )}
        </div>
      </div>
      {(a.strengths.length > 0 || a.improvements.length > 0) && (
        <div className="iv-two">
          {a.strengths.length > 0 && (
            <div className="iv-list iv-list--good">
              <h5>
                <Icon name="check" size={14} /> Strengths
              </h5>
              <ul>
                {a.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {a.improvements.length > 0 && (
            <div className="iv-list iv-list--fix">
              <h5>
                <Icon name="target" size={14} /> Improve
              </h5>
              <ul>
                {a.improvements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {a.model_answer && (
        <details className="iv-model">
          <summary>
            <Icon name="sparkle" size={14} /> Model answer (from your resume and stories)
          </summary>
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
  const [since, setSince] = useState(() => Date.now());
  const [slow, setSlow] = useState(false);
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
  const pending = !feedback.data || feedback.data.state === "pending";
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setSlow(true), since + POLL_LIMIT_MS - Date.now());
    return () => window.clearTimeout(t);
  }, [pending, since]);
  const pollAgain = () => {
    setSlow(false);
    setSince(Date.now());
    void feedback.refetch();
  };
  const retry = useMutation({
    mutationFn: () => retryVoiceFeedback(id),
    onSuccess: (fb) => {
      qc.setQueryData(voiceKeys.feedback(id), fb);
      pollAgain();
    },
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
      <div className="iv-skeleton" role="status" aria-label="Loading the session">
        <span />
        <span />
        <span />
      </div>
    );
  if (detail.error || !detail.data) {
    return (
      <div className="iv-page">
        <InterviewNav />
        <p className="kit-banner bad" role="alert">
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
  const itype = String(s.config.interview_type ?? "");

  return (
    <div className="iv-page">
      <PageHeader
        eyebrow={copilot ? "Copilot debrief" : "Practice report"}
        title={copilot ? "Live Copilot session" : `${typeLabel(itype)} practice`}
        sub={
          <>
            {new Date(s.created_at).toLocaleString()}
            {s.job_title ? ` · ${s.job_title}, ${s.company}` : s.role ? ` · ${s.role}` : ""}
          </>
        }
      >
        <StatChip icon="clock">
          <strong className="num">{formatDuration(s.duration_s)}</strong>
        </StatChip>
        <StatChip dot={s.end_reason === "disconnected" ? "negative" : "positive"}>
          {END_REASONS[s.end_reason ?? ""] ?? s.state}
        </StatChip>
        <button
          type="button"
          className="btn-secondary iv-icon-btn"
          onClick={() => setConfirm(true)}
        >
          <Icon name="trash" size={14} />
          Delete session
        </button>
      </PageHeader>
      <InterviewNav />

      {(!fb || fb.state === "pending") &&
        (slow ? (
          <p className="kit-banner warn iv-pending" role="status">
            <Icon name="clock" size={16} />
            <span>
              This is taking longer than usual — the AI models are busy, so we keep trying for a few
              more minutes.
            </span>{" "}
            <button type="button" className="link-button" onClick={pollAgain}>
              Check again
            </button>
          </p>
        ) : (
          <p className="kit-banner iv-pending" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Your feedback is being prepared — this usually takes under a minute.</span>
          </p>
        ))}
      {fb?.state === "failed" && (
        <p className="kit-banner bad" role="alert">
          <Icon name="alert" size={16} />
          <span>
            We couldn&apos;t prepare feedback for this session (no AI model was available, even
            after several tries). The transcript is below.
          </span>{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            {retry.isPending ? "Retrying…" : "Try again"}
          </button>
          {retry.error && <> {errorMessage(retry.error)}</>}
        </p>
      )}

      {fb?.state === "ready" && (
        <div className="iv-report kit-rise">
          <section className="card kit-card iv-hero" aria-labelledby="summary-title">
            <div className="iv-hero-main">
              {!copilot && fb.overall_score != null ? (
                <ScoreDial score={fb.overall_score} size={120} label="Overall score" />
              ) : (
                <IconTile icon={copilot ? "sparkle" : typeIcon(itype)} size="lg" />
              )}
              <div className="iv-hero-text">
                <h3 id="summary-title">{copilot ? "Debrief" : "Overall"}</h3>
                {!copilot && fb.overall_score != null && (
                  <p className="iv-overall">
                    <strong className="num">{fb.overall_score.toFixed(1)}</strong>/5
                  </p>
                )}
                {fb.summary && <p className="iv-summary-text">{fb.summary}</p>}
                {weakTopics.length > 0 && (
                  <p className="iv-topics">Weak topics: {weakTopics.join(", ")}</p>
                )}
              </div>
            </div>
            {!copilot && (
              <div className="iv-metrics">
                <MetricTile
                  icon="activity"
                  label="words per minute"
                  value={delivery?.wpm != null ? String(delivery.wpm) : "–"}
                />
                <MetricTile
                  icon="message"
                  label="filler words"
                  value={String(delivery?.filler_count ?? 0)}
                />
                <MetricTile
                  icon="pause"
                  label="long pauses"
                  value={String(delivery?.long_pauses ?? 0)}
                />
                <MetricTile icon="clock" label="length" value={formatDuration(s.duration_s)} />
              </div>
            )}
          </section>

          {!copilot && Object.keys(fb.scores ?? {}).length > 0 && (
            <section className="card kit-card" aria-labelledby="scores-title">
              <CardHead
                icon="chart"
                id="scores-title"
                title="Scores"
                sub="Across every answer, out of 5"
              />
              <ScoreBars scores={fb.scores ?? {}} />
            </section>
          )}

          {((fb.strengths ?? []).length > 0 || (fb.improvements ?? []).length > 0) && (
            <div className="iv-two">
              {(fb.strengths ?? []).length > 0 && (
                <section className="card kit-card" aria-labelledby="strengths-title">
                  <CardHead
                    icon="star"
                    tone="positive"
                    id="strengths-title"
                    title="What went well"
                  />
                  <ul className="iv-bullets iv-bullets--good">
                    {(fb.strengths ?? []).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {(fb.improvements ?? []).length > 0 && (
                <section className="card kit-card" aria-labelledby="improve-title">
                  <CardHead
                    icon="target"
                    tone="attention"
                    id="improve-title"
                    title="What to improve"
                  />
                  <ul className="iv-bullets iv-bullets--fix">
                    {(fb.improvements ?? []).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {weak.length > 0 && (
            <section className="card kit-card iv-weak" aria-labelledby="weak-title">
              <CardHead
                icon="target"
                tone="attention"
                id="weak-title"
                title={copilot ? "Questions to prepare" : "Weak questions"}
                sub="Practice them again with the AI interviewer"
              />
              <ol className="iv-weak-list">
                {weak.map((q, i) => (
                  <li key={q}>
                    <span className="iv-weak-n num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="btn-run iv-icon-btn"
                onClick={() => drill.mutate(weak)}
                disabled={drill.isPending}
              >
                <Icon name="mic" size={15} />
                Practice these questions
              </button>
              {drill.error && <p className="login-error">{errorMessage(drill.error)}</p>}
            </section>
          )}

          {copilot ? (
            <section aria-labelledby="cards-title">
              <h3 id="cards-title" className="iv-section-title">
                Questions and suggestions
              </h3>
              <ol className="iv-answers">
                {(fb.answers ?? []).map((a, i) => (
                  <li key={`${a.question}-${i}`} className="card kit-card iv-answer">
                    <div className="iv-answer-head">
                      <span className="iv-answer-n num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <h4>{a.question}</h4>
                      {Boolean((a.metrics as { not_sure?: boolean }).not_sure) && (
                        <span className="badge tone-attention">not sure</span>
                      )}
                    </div>
                    <p className="iv-pre iv-suggestion">
                      {a.answer || <em>(no suggestion shown)</em>}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section aria-labelledby="answers-title">
              <h3 id="answers-title" className="iv-section-title">
                Answer by answer
              </h3>
              <ol className="iv-answers">
                {(fb.answers ?? []).map((a, i) => (
                  <AnswerCard key={a.turn_id ?? i} a={a} index={i} />
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      <details className="card kit-card iv-transcript">
        <summary>
          <Icon name="fileText" size={15} /> Full transcript
        </summary>
        <ol>
          {detail.data.turns.map((t) => (
            <li key={t.id} className={`iv-tline iv-tline-${t.speaker}`}>
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
