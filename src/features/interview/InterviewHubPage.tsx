/**
 * Interview prep hub (spec §6.10, F7 plan §1.1–1.2): set up a Practice
 * session (job or role, type, difficulty, length), see progress per skill
 * area, drill weak questions, and jump to recent reports.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { InterviewType } from "../../lib/api/types";
import { jobKeys, listJobs } from "../jobs/jobsApi";
import { AiBusyBanner } from "../models/AiBusyBanner";
import { InterviewNav, ProgressChart, ProviderLine } from "./parts";
import {
  END_REASONS,
  INTERVIEW_TYPES,
  createVoiceSession,
  getVoiceHistory,
  getVoiceProgress,
  getVoiceProviders,
  typeLabel,
  voiceKeys,
} from "./voiceApi";
import "./interview.css";

const LENGTHS = [3, 5, 8, 10];

export default function InterviewHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const focus = ((location.state as { focus?: string[] } | null)?.focus ?? []).slice(0, 20);
  const [jobId, setJobId] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<InterviewType>(focus.length ? "behavioral" : "behavioral");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [length, setLength] = useState(focus.length ? Math.min(10, focus.length) : 5);
  const [drill, setDrill] = useState<string[]>(focus);

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

  return (
    <div className="iv-page">
      <div className="page-header">
        <div>
          <h2>Interview prep</h2>
          <p>
            Practice out loud with an AI interviewer, then get scores, STAR feedback and model
            answers built from your own resume.
          </p>
        </div>
      </div>
      <AiBusyBanner task="interview_chat" what="practice interviews" />
      <InterviewNav />

      <div className="iv-grid">
        <form className="card iv-setup" onSubmit={submit} aria-labelledby="practice-setup">
          <h3 id="practice-setup">Start a practice interview</h3>
          {drill.length > 0 && (
            <div className="iv-drill" role="status">
              Drilling {drill.length} question{drill.length === 1 ? "" : "s"} from earlier sessions.{" "}
              <button type="button" className="link-button" onClick={() => setDrill([])}>
                Clear
              </button>
            </div>
          )}
          <div className="form-grid">
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
            <label className="field">
              <span>Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="field">
              <span>Length</span>
              <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
                {LENGTHS.map((n) => (
                  <option key={n} value={n}>
                    {n} questions
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="iv-types">
            <legend>Interview type</legend>
            {INTERVIEW_TYPES.map((t) => (
              <label key={t.value} className={`iv-type${type === t.value ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="itype"
                  value={t.value}
                  checked={type === t.value}
                  onChange={() => setType(t.value)}
                />
                <span className="iv-type-name">{t.label}</span>
                <span className="iv-type-hint">{t.hint}</span>
              </label>
            ))}
          </fieldset>
          <ProviderLine providers={providers.data} />
          {start.error && (
            <p className="login-error" role="alert">
              {busy
                ? "Another voice session is open. End it first — only one runs at a time."
                : errorMessage(start.error)}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-run" disabled={start.isPending || needsRole}>
              {start.isPending ? "Starting…" : "Start practice"}
            </button>
            {needsRole && (
              <span className="field-hint">
                Pick a job or type the role for a role-specific interview.
              </span>
            )}
          </div>
          <p className="field-hint">
            Your microphone is used only while the session runs. Audio is never recorded or stored.
          </p>
        </form>

        <section className="card iv-side" aria-labelledby="progress-title">
          <h3 id="progress-title">Your progress</h3>
          {progress.isLoading ? (
            <p className="field-hint" role="status">
              Loading progress…
            </p>
          ) : progress.error ? (
            <p className="login-error">{errorMessage(progress.error)}</p>
          ) : (
            <>
              {progress.data?.average != null && (
                <p className="iv-average">
                  Average <strong className="num">{progress.data.average.toFixed(1)}/5</strong> over{" "}
                  {progress.data.sessions} session{progress.data.sessions === 1 ? "" : "s"}
                </p>
              )}
              <ProgressChart areas={progress.data?.areas ?? []} />
              {(progress.data?.weak_questions.length ?? 0) > 0 && (
                <div className="iv-weak">
                  <h4>Questions to drill</h4>
                  <ul>
                    {progress.data!.weak_questions.slice(0, 5).map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const qs = progress.data!.weak_questions.slice(0, 5);
                      setDrill(qs);
                      setLength(Math.max(3, qs.length));
                    }}
                  >
                    Drill these
                  </button>
                </div>
              )}
            </>
          )}
          <h3 className="iv-recent-title">Recent sessions</h3>
          {recent.data?.sessions.length ? (
            <ul className="iv-recent">
              {recent.data.sessions.map((s) => (
                <li key={s.id}>
                  <Link to={`/interview/sessions/${s.id}`}>
                    {typeLabel(String(s.config.interview_type ?? ""))}
                    {s.job_title ? ` · ${s.job_title}` : s.role ? ` · ${s.role}` : ""}
                  </Link>
                  <span className="field-hint">
                    {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    {s.overall_score != null
                      ? `${s.overall_score.toFixed(1)}/5`
                      : (END_REASONS[s.end_reason ?? ""] ?? s.state)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">No sessions yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
