/**
 * Interview prep hub (spec §6.10, F7 plan §1.1–1.2; restyled in F7.1): set
 * up a Practice session (job or role, type, difficulty, length), see
 * progress per skill area, drill weak questions, and jump to recent reports.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import {
  CardHead,
  EmptyState,
  IconTile,
  PageHeader,
  Segmented,
  StatChip,
} from "../../components/PageKit";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { InterviewType } from "../../lib/api/types";
import { useEntitlement } from "../../lib/auth/access";
import { jobKeys, listJobs } from "../jobs/jobsApi";
import { AiBusyBanner } from "../models/AiBusyBanner";
import { InterviewNav, ProgressChart, ProviderLine, ScoreDial, ScorePill } from "./parts";
import {
  END_REASONS,
  INTERVIEW_TYPES,
  createVoiceSession,
  getVoiceHistory,
  getVoiceProgress,
  getVoiceProviders,
  typeIcon,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const LENGTHS = [3, 5, 8, 10];
const DIFFICULTIES = [
  { value: "easy" as const, label: "Easy" },
  { value: "medium" as const, label: "Medium" },
  { value: "hard" as const, label: "Hard" },
];

export default function InterviewHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const focus = ((location.state as { focus?: string[] } | null)?.focus ?? []).slice(0, 20);
  const [jobId, setJobId] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<InterviewType>("behavioral");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [length, setLength] = useState(focus.length ? Math.min(10, focus.length) : 5);
  const [drill, setDrill] = useState<string[]>(focus);
  const copilot = useEntitlement("live_copilot");

  const providers = useQuery({ queryKey: voiceKeys.providers, queryFn: getVoiceProviders });
  const progress = useQuery({ queryKey: voiceKeys.progress, queryFn: getVoiceProgress });
  const recent = useQuery({
    queryKey: voiceKeys.history("mock"),
    queryFn: () => getVoiceHistory("mock", 5),
  });
  const saved = useQuery({ queryKey: jobKeys.list("saved"), queryFn: () => listJobs("saved", 50) });
  const applied = useQuery({
    queryKey: jobKeys.list("applied"),
    queryFn: () => listJobs("applied", 50),
  });
  const jobs = useMemo(() => {
    const all = [...(saved.data?.jobs ?? []), ...(applied.data?.jobs ?? [])];
    return [...new Map(all.map((j) => [j.id, j])).values()];
  }, [saved.data, applied.data]);

  const start = useMutation({
    mutationFn: () =>
      createVoiceSession({
        mode: "mock",
        job_id: jobId || null,
        role: jobId ? null : role.trim() || null,
        interview_type: type,
        difficulty,
        length,
        focus_questions: drill,
      }),
    onSuccess: (created) =>
      navigate(`/interview/practice/${created.session.id}`, {
        state: { token: created.stream_token, path: created.stream_path },
      }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    start.mutate();
  };
  const needsRole = type === "role_specific" && !jobId && !role.trim();
  const busy = start.error instanceof ApiError && start.error.code === "voice_session_busy";
  const p = progress.data;
  const weak = p?.weak_questions ?? [];

  return (
    <div className="iv-page">
      <PageHeader
        eyebrow="Get interview-ready"
        title="Interview prep"
        sub="Practice out loud with an AI interviewer, then get scores, STAR feedback and model answers built from your own resume."
      >
        {p?.average != null && (
          <StatChip dot="positive">
            <strong className="num">{p.average.toFixed(1)}/5</strong> average
          </StatChip>
        )}
        {p && p.sessions > 0 && (
          <StatChip icon="history">
            <strong className="num">{p.sessions}</strong> session{p.sessions === 1 ? "" : "s"}
          </StatChip>
        )}
      </PageHeader>
      <AiBusyBanner task="interview_chat" what="practice interviews" />
      <InterviewNav />

      <div className="iv-grid kit-rise">
        <form className="card kit-card iv-setup" onSubmit={submit} aria-labelledby="practice-setup">
          <CardHead
            icon="mic"
            id="practice-setup"
            title="Start a practice interview"
            sub="Pick the role, the kind of interview and how long it runs."
          />
          {drill.length > 0 && (
            <div className="kit-banner iv-drill" role="status">
              <Icon name="target" size={16} />
              <span>
                Drilling {drill.length} question{drill.length === 1 ? "" : "s"} from earlier
                sessions.
              </span>
              <button type="button" className="link-button" onClick={() => setDrill([])}>
                Clear
              </button>
            </div>
          )}

          <div className="iv-step">
            <span className="iv-step-label">
              <span className="iv-step-n">1</span> Target role
            </span>
            <div className="iv-fields">
              <label className="field">
                <span>Job</span>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">No job — type a role</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} · {j.company}
                    </option>
                  ))}
                </select>
              </label>
              {!jobId && (
                <label className="field">
                  <span>Role</span>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Backend Engineer"
                    maxLength={200}
                  />
                </label>
              )}
            </div>
          </div>

          <fieldset className="iv-step iv-types">
            <legend className="iv-step-label">
              <span className="iv-step-n">2</span> Interview type
            </legend>
            <div className="iv-type-grid">
              {INTERVIEW_TYPES.map((t) => (
                <label key={t.value} className={`iv-type${type === t.value ? " selected" : ""}`}>
                  <input
                    type="radio"
                    className="sr-only"
                    name="itype"
                    value={t.value}
                    checked={type === t.value}
                    onChange={() => setType(t.value)}
                  />
                  <IconTile icon={typeIcon(t.value)} tone={type === t.value ? "accent" : "muted"} />
                  <span className="iv-type-text">
                    <span className="iv-type-name">{t.label}</span>
                    <span className="iv-type-hint">{t.hint}</span>
                  </span>
                  <span className="iv-type-check" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="iv-step">
            <span className="iv-step-label">
              <span className="iv-step-n">3</span> Difficulty and length
            </span>
            <div className="iv-pills-row">
              <div className="iv-pill-field">
                <span className="iv-pill-label">Difficulty</span>
                <Segmented
                  label="Difficulty"
                  options={DIFFICULTIES}
                  value={difficulty}
                  onChange={setDifficulty}
                />
              </div>
              <div className="iv-pill-field">
                <span className="iv-pill-label">Questions</span>
                <Segmented
                  label="Length"
                  options={LENGTHS.map((n) => ({ value: n, label: String(n) }))}
                  value={length}
                  onChange={setLength}
                />
              </div>
            </div>
          </div>

          <div className="iv-setup-foot">
            <ProviderLine providers={providers.data} />
            {start.error && (
              <p className="kit-banner bad" role="alert">
                {busy
                  ? "Another voice session is open. End it first — only one runs at a time."
                  : errorMessage(start.error)}
              </p>
            )}
            <div className="iv-start-row">
              <button
                type="submit"
                className="btn-run iv-start"
                disabled={start.isPending || needsRole}
              >
                <Icon name="mic" size={16} />
                {start.isPending ? "Starting…" : "Start practice"}
              </button>
              {needsRole && (
                <span className="field-hint">
                  Pick a job or type the role for a role-specific interview.
                </span>
              )}
            </div>
            <p className="field-hint iv-privacy">
              <Icon name="lock" size={12} />
              Your microphone is used only while the session runs. Audio is never recorded or
              stored.
            </p>
          </div>
        </form>

        <div className="iv-side">
          <section className="card kit-card" aria-labelledby="progress-title">
            <CardHead
              icon="chart"
              id="progress-title"
              title="Your progress"
              sub="Average per skill area, with your latest sessions"
            />
            {progress.isLoading ? (
              <div className="iv-skeleton" role="status" aria-label="Loading progress">
                <span />
                <span />
                <span />
              </div>
            ) : progress.error ? (
              <p className="login-error">{errorMessage(progress.error)}</p>
            ) : (
              <>
                {p?.average != null && (
                  <div className="iv-average">
                    <ScoreDial score={p.average} />
                    <p>
                      Average <strong className="num">{p.average.toFixed(1)}/5</strong> over{" "}
                      {p.sessions} session{p.sessions === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
                <ProgressChart areas={p?.areas ?? []} />
              </>
            )}
          </section>

          {weak.length > 0 && (
            <section className="card kit-card" aria-labelledby="drill-title">
              <CardHead
                icon="target"
                tone="attention"
                id="drill-title"
                title="Questions to drill"
                sub="Where your answers scored lowest"
              />
              <ol className="iv-weak-list">
                {weak.slice(0, 5).map((q, i) => (
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
                className="btn-secondary iv-drill-btn"
                onClick={() => {
                  const qs = weak.slice(0, 5);
                  setDrill(qs);
                  setLength(Math.max(3, qs.length));
                }}
              >
                Drill these
              </button>
            </section>
          )}

          <section className="card kit-card" aria-labelledby="recent-title">
            <CardHead icon="clock" id="recent-title" title="Recent sessions" sub="Open a report">
              <Link to="/interview/history" className="iv-head-link">
                All
              </Link>
            </CardHead>
            {recent.data?.sessions.length ? (
              <ul className="iv-recent">
                {recent.data.sessions.map((s) => {
                  const itype = String(s.config.interview_type ?? "");
                  return (
                    <li key={s.id}>
                      <IconTile icon={typeIcon(itype)} tone="muted" />
                      <span className="iv-recent-text">
                        <Link to={`/interview/sessions/${s.id}`}>
                          {typeLabel(itype)}
                          {s.job_title ? ` · ${s.job_title}` : s.role ? ` · ${s.role}` : ""}
                        </Link>
                        <span className="field-hint">
                          {new Date(s.created_at).toLocaleDateString()}
                          {s.overall_score == null
                            ? ` · ${END_REASONS[s.end_reason ?? ""] ?? s.state}`
                            : ""}
                        </span>
                      </span>
                      {s.overall_score != null && <ScorePill score={s.overall_score} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="mic" title="No sessions yet.">
                <p>Your reports show up here after your first practice.</p>
              </EmptyState>
            )}
          </section>

          <section className="card kit-card iv-copilot-promo" aria-labelledby="copilot-title">
            <CardHead
              icon={copilot.allowed ? "sparkle" : "lock"}
              tone={copilot.allowed ? "accent" : "muted"}
              id="copilot-title"
              title="Live Copilot"
              sub={copilot.allowed ? "Suggested answers during a real call" : "Not on your plan"}
            />
            <p className="field-hint">
              {copilot.allowed
                ? "Hears the interviewer's questions and drafts answers from your resume and story bank while you talk."
                : "Suggests answers from your resume during a live interview. Ask your admin to turn it on."}
            </p>
            {copilot.allowed && (
              <Link to="/interview/copilot" className="btn-secondary iv-promo-link">
                Open Live Copilot <Icon name="arrowRight" size={14} />
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
