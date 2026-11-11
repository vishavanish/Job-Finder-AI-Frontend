/**
 * QA10 resume check: how easily a resume reader (ATS) can read the file.
 * No ATS really scores a resume, so the UI says "Resume check", not "ATS score".
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { ResumeCheck, ResumeCheckFinding, ResumeOut } from "../../lib/api/types";
import { makePlainCopy, profileKeys, recheckResume } from "./profileApi";

const BAND_LABEL: Record<string, string> = {
  good: "Good",
  needs_fixes: "Needs fixes",
  hard_to_read: "Hard to read",
};
const BAND_TONE: Record<string, string> = {
  good: "positive",
  needs_fixes: "attention",
  hard_to_read: "negative",
};
const LEVEL_LABEL: Record<ResumeCheckFinding["level"], string> = {
  fail: "Problem",
  warn: "Fix",
  info: "Tip",
  pass: "OK",
};
const ORDER: Record<ResumeCheckFinding["level"], number> = { fail: 0, warn: 1, info: 2, pass: 3 };

/** The small badge on each resume row. */
export function ResumeCheckBadge({
  resume,
  open,
  onToggle,
}: {
  resume: ResumeOut;
  open: boolean;
  onToggle: () => void;
}) {
  const check = resume.ats_check;
  if (resume.parse_status === "pending") return null;
  if (!check)
    return (
      <span className="badge tone-active" role="status">
        Checking file…
      </span>
    );
  const band = check.band ?? "";
  return (
    <button
      type="button"
      className={`badge badge-button tone-${BAND_TONE[band] ?? "neutral"}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      Resume check: {check.band ? `${BAND_LABEL[band]} · ${check.score}` : "couldn't check"}
    </button>
  );
}

export function ResumeCheckPanel({
  resume,
  onReview,
  onCopied,
}: {
  resume: ResumeOut;
  onReview: () => void;
  onCopied: (copy: ResumeOut) => void;
}) {
  const qc = useQueryClient();
  const id = useId();
  const [showText, setShowText] = useState(false);
  const check = resume.ats_check as ResumeCheck | null | undefined;
  const refresh = () => void qc.invalidateQueries({ queryKey: profileKeys.resumes });
  const again = useMutation({ mutationFn: () => recheckResume(resume.id), onSuccess: refresh });
  const copy = useMutation({
    mutationFn: () => makePlainCopy(resume.id),
    onSuccess: (c) => {
      refresh();
      onCopied(c);
    },
  });
  if (!check) return null;
  const findings = [...(check.findings ?? [])].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const problems = findings.filter((f) => f.level !== "pass");
  const passed = findings.filter((f) => f.level === "pass");
  const error =
    (again.isError && errorMessage(again.error, "Couldn't start the check.")) ||
    (copy.isError && errorMessage(copy.error, "Couldn't make the plain copy.")) ||
    "";

  return (
    <section className="resume-check" aria-labelledby={`${id}-h`}>
      <h4 id={`${id}-h`}>
        How a resume reader sees v{resume.version}
        {check.band && (
          <span className={`badge tone-${BAND_TONE[check.band]}`}>
            {BAND_LABEL[check.band]} · {check.score}/100
          </span>
        )}
      </h4>
      <p className="field-hint">
        Job sites read your file into fields before a recruiter searches them. These checks find
        what often goes wrong. There is no official ATS score — this is our summary.
      </p>
      {check.error && (
        <p className="login-error" role="alert">
          {check.error}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="check-list">
          {problems.map((f, i) => (
            <li key={`${f.id}-${i}`} className={`check-item level-${f.level}`}>
              <span className="check-level">{LEVEL_LABEL[f.level]}</span>
              <div>
                <strong>{f.title}</strong>
                {f.detail && <p>{f.detail}</p>}
                {f.fix && <p className="check-fix">How to fix: {f.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {passed.length > 0 && (
        <details className="check-passed">
          <summary>
            Passed <span className="num">({passed.length})</span>
          </summary>
          <ul>
            {passed.map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
        </details>
      )}
      {check.seen_text && (
        <>
          <button
            type="button"
            className="link-button"
            aria-expanded={showText}
            onClick={() => setShowText((v) => !v)}
          >
            {showText ? "Hide" : "See"} what a resume reader sees
          </button>
          {showText && (
            <pre className="seen-text" aria-label="Text in the order a reader gets it">
              {check.seen_text}
            </pre>
          )}
        </>
      )}
      {check.band === "hard_to_read" && (
        <div className="prep-row">
          {resume.parse_status === "reviewed" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={copy.isPending}
              onClick={() => copy.mutate()}
            >
              {copy.isPending ? "Making it…" : "Make a plain copy"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              disabled={resume.parse_status !== "parsed"}
              onClick={onReview}
            >
              Review what we read first
            </button>
          )}
          <span className="field-hint">
            A one-column Word file with standard headings, made from your reviewed resume. Check it
            before you use it — your master stays as it is.
          </span>
        </div>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="btn-small"
          disabled={again.isPending}
          onClick={() => again.mutate()}
        >
          Check again
        </button>
      </div>
    </section>
  );
}
