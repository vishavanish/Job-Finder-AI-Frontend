/**
 * Manual and Email apply (F4 plan §1.1–1.2): the prep pack starts building as
 * the dialog opens — tailored resume, cover letter, email draft — and the job
 * page can be opened at once without waiting for it. What the fact check
 * removed is shown, so the user sees what the AI tried to add.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { errorMessage } from "../../lib/api/errors";
import type { PrepPack, StreamedJob } from "../../lib/api/types";
import { applyKeys, getPrep, markApplied, requestPrep, resumeFile, saveBlob } from "./applyApi";

const PACK_POLL_MS = 2000;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-small"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function PackBody({
  pack,
  mode,
  jobTitle,
}: {
  pack: PrepPack;
  mode: "manual" | "email";
  jobTitle: string;
}) {
  const [downloadError, setDownloadError] = useState("");
  const download = async () => {
    setDownloadError("");
    try {
      saveBlob(await resumeFile(pack.tailored_resume_id!), `Resume - ${jobTitle}.docx`);
    } catch (err) {
      setDownloadError(errorMessage(err, "Couldn't download the resume."));
    }
  };
  const dropped = pack.dropped ?? [];
  return (
    <>
      {pack.status === "ready" && pack.error && (
        <div className="login-notice" role="status">
          {pack.error}
          <ErrorDetail detail={pack.error_detail} />
        </div>
      )}
      {mode === "email" && pack.email_to && (
        <section className="prep-block">
          <h3>Email draft</h3>
          <dl className="prep-email">
            <dt>To</dt>
            <dd>
              <span className="mono">{pack.email_to}</span>{" "}
              <CopyButton text={pack.email_to} label="Copy" />
            </dd>
            <dt>Subject</dt>
            <dd>
              {pack.email_subject} <CopyButton text={pack.email_subject ?? ""} label="Copy" />
            </dd>
          </dl>
          <label className="sr-only" htmlFor="prep-email-body">
            Email body
          </label>
          <textarea id="prep-email-body" readOnly rows={9} value={pack.email_body ?? ""} />
          <div className="prep-row">
            <CopyButton text={pack.email_body ?? ""} label="Copy email" />
            {pack.mailto && (
              <a className="btn-secondary" href={pack.mailto}>
                Open in my email app
              </a>
            )}
          </div>
          <p className="field-hint">Attach the tailored resume below before sending.</p>
        </section>
      )}
      <section className="prep-block">
        <h3>Tailored resume</h3>
        {pack.tailored_resume_id ? (
          <div className="prep-row">
            <button type="button" className="btn-secondary" onClick={() => void download()}>
              Download (DOCX)
            </button>
            <span className="field-hint">Same facts as your resume, reordered for this job.</span>
          </div>
        ) : (
          <p className="field-hint">No tailored resume this time — use your own resume.</p>
        )}
        {downloadError && (
          <p className="login-error" role="alert">
            {downloadError}
          </p>
        )}
      </section>
      {mode === "manual" && pack.cover_letter && (
        <section className="prep-block">
          <h3>Cover letter</h3>
          <label className="sr-only" htmlFor="prep-letter">
            Cover letter
          </label>
          <textarea id="prep-letter" readOnly rows={9} value={pack.cover_letter} />
          <CopyButton text={pack.cover_letter} label="Copy cover letter" />
        </section>
      )}
      {dropped.length > 0 && (
        <details className="prep-dropped">
          <summary>
            Removed because it isn't in your resume <span className="num">({dropped.length})</span>
          </summary>
          <ul>
            {dropped.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function PrepDialog({
  job,
  mode,
  onClose,
  onApplied,
  onNotInterested,
}: {
  job: StreamedJob;
  mode: "manual" | "email";
  onClose: () => void;
  onApplied: (status: "submitted" | "emailed") => void;
  onNotInterested: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const start = useMutation({
    mutationFn: (regenerate: boolean) => requestPrep(job.id, { regenerate }),
    onSuccess: (pack) => qc.setQueryData(applyKeys.pack(pack.id), pack),
  });
  const { mutate } = start;
  useEffect(() => {
    mutate(false); // the pack starts as the dialog opens (owner decision 3)
  }, [mutate]);

  const packId = start.data?.id;
  const pack = useQuery({
    queryKey: applyKeys.pack(packId ?? ""),
    queryFn: () => getPrep(packId!),
    enabled: Boolean(packId),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? PACK_POLL_MS : false),
  });
  const p = pack.data;

  const act = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setActionError("");
    try {
      await fn();
    } catch (err) {
      setActionError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "email" ? `Email apply — ${job.title}` : `Apply — ${job.title}`;
  const actions =
    mode === "email" ? (
      <>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Not now
        </button>
        <button
          type="button"
          className="btn-run"
          disabled={busy || !p?.email_to}
          onClick={() =>
            void act(async () => {
              await markApplied(job.id, "email");
              onApplied("emailed");
              onClose();
            }, "Couldn't record it.")
          }
        >
          I sent it
        </button>
      </>
    ) : opened ? (
      <>
        <span className="dialog-question">Did you apply?</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void act(async () => (await onNotInterested(), onClose()), "Couldn't hide it.")
          }
        >
          Not interested
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Not yet
        </button>
        <button
          type="button"
          className="btn-run"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await markApplied(job.id, "manual");
              onApplied("submitted");
              onClose();
            }, "Couldn't mark it as applied.")
          }
        >
          Yes, I applied
        </button>
      </>
    ) : (
      <button type="button" className="btn-secondary" onClick={onClose}>
        Close
      </button>
    );

  return (
    <Dialog title={title} onClose={onClose} actions={actions} wide>
      <p className="job-meta">
        {job.company}
        {job.location ? ` · ${job.location}` : ""}
      </p>
      {mode === "manual" && (
        <div className="prep-row">
          <a
            className="btn-apply"
            href={job.apply_url || job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
          >
            Open job page
          </a>
          <span className="field-hint">
            You can open it now — the resume and letter keep building here.
          </span>
        </div>
      )}

      {(start.isPending || p?.status === "pending") && (
        <div className="prep-progress" role="status" aria-live="polite">
          <p>
            Tailoring your resume
            {mode === "manual" ? " and writing a cover letter" : " and the email"}…{" "}
            {p?.typical_seconds
              ? `this usually takes about ${p.typical_seconds} seconds.`
              : "this takes 10–40 seconds."}
          </p>
          <PrepSteps steps={p?.steps} mode={mode} />
        </div>
      )}
      {start.isError && (
        <p className="login-error" role="alert">
          {errorMessage(start.error, "Couldn't prepare the application.")}
        </p>
      )}
      {p?.status === "failed" && (
        <div className="login-error" role="alert">
          {p.error ?? "Couldn't prepare this. Try again."}
          <ErrorDetail detail={p.error_detail} />
        </div>
      )}
      {p && p.status !== "pending" && <PackBody pack={p} mode={mode} jobTitle={job.title} />}
      {p && p.status !== "pending" && (
        <button
          type="button"
          className="link-button"
          disabled={start.isPending}
          onClick={() => start.mutate(true)}
        >
          {p.error ? "Try again" : "Regenerate"}
        </button>
      )}
      {actionError && (
        <p className="login-error" role="alert">
          {actionError}
        </p>
      )}
    </Dialog>
  );
}

/** The model-by-model reason, folded away: useful for an admin, noise for everyone else (QA1 §7). */
function ErrorDetail({ detail }: { detail?: string | null }) {
  if (!detail) return null;
  return (
    <details className="prep-error-detail">
      <summary>Details</summary>
      <p className="mono">{detail}</p>
    </details>
  );
}

const STEP_MARK: Record<string, string> = {
  running: "…",
  done: "✓",
  failed: "✗",
};

/** Which part of the pack is ready while the rest is still being written (QA2 §2). */
function PrepSteps({ steps, mode }: { steps?: Record<string, string>; mode: "manual" | "email" }) {
  const labels: Record<string, string> = {
    resume: "Tailored resume",
    cover_letter: mode === "manual" ? "Cover letter" : "Email text",
  };
  const shown = Object.entries(steps ?? {}).filter(
    ([part, state]) => labels[part] && STEP_MARK[state],
  );
  if (!shown.length) return null;
  return (
    <ul className="prep-steps">
      {shown.map(([part, state]) => (
        <li key={part} className={`is-${state}`}>
          <span aria-hidden="true">{STEP_MARK[state]}</span> {labels[part]}
          <span className="sr-only">
            {state === "running" ? " — in progress" : state === "done" ? " — ready" : " — failed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
