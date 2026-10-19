/**
 * One apply run (spec §6.4, F4 plan §1.4): every form question with its
 * answer and where the answer came from, the files that will be uploaded,
 * Approve and submit (level 2), the hand-off when the run needs the user, and
 * the screenshots. Polls while the worker is moving the run.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { errorMessage } from "../../lib/api/errors";
import type { ApplyRun, ApplyRunField } from "../../lib/api/types";
import {
  applyKeys,
  answerRun,
  approveRun,
  cancelApplyRun,
  finishRun,
  isRunMoving,
  listProofs,
  proofImage,
  resumeFile,
  saveBlob,
} from "./applyApi";
import { useApplyRun } from "./useApplyRun";
import "./apply.css";

const SOURCE: Record<string, { label: string; tone: string }> = {
  profile: { label: "From your profile", tone: "tone-neutral" },
  eeo: { label: "Private (EEO) — never sent to AI", tone: "tone-neutral" },
  answer_bank: { label: "Saved answer", tone: "tone-neutral" },
  ai: { label: "AI draft — check it", tone: "tone-attention" },
  user: { label: "Your answer", tone: "tone-positive" },
  none: { label: "Needs your answer", tone: "tone-negative" },
};

function sourceOf(f: ApplyRunField) {
  if (f.needs_input) return SOURCE.none!;
  if (f.source === "answer_bank" && !f.approved) return SOURCE.ai!;
  return SOURCE[f.source] ?? SOURCE.none!;
}

function FieldInput({
  field,
  value,
  editable,
  onChange,
}: {
  field: ApplyRunField;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  const id = `field-${field.key}`;
  const options = field.options ?? [];
  if (!editable) return <p className="field-value">{value || <em>Left empty</em>}</p>;
  if (options.length > 0) {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "textarea") {
    return <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      id={id}
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Screenshots({ run }: { run: ApplyRun }) {
  const proofs = useQuery({
    queryKey: [...applyKeys.proofs(run.id), run.proofs ?? 0],
    queryFn: () => listProofs(run.id),
    enabled: (run.proofs ?? 0) > 0,
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void (async () => {
      for (const p of proofs.data ?? []) {
        try {
          const url = URL.createObjectURL(await proofImage(run.id, p.id));
          made.push(url);
          if (alive) setUrls((u) => ({ ...u, [p.id]: url }));
        } catch {
          /* shown as "couldn't load" below */
        }
      }
    })();
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u)); // screenshots never outlive the screen
    };
  }, [proofs.data, run.id]);

  if (!(run.proofs ?? 0)) return null;
  return (
    <section className="review-block">
      <h3>Screenshots</h3>
      {(proofs.data ?? []).map((p) => (
        <figure key={p.id} className="proof">
          {urls[p.id] ? (
            <img
              src={urls[p.id]}
              alt={p.kind === "confirmation" ? "Confirmation page" : "Where the run stopped"}
            />
          ) : (
            <p className="field-hint">Loading screenshot…</p>
          )}
          <figcaption>
            {p.kind === "confirmation" ? "Confirmation" : "Where it stopped"}
            {p.confirmation_text ? ` — ${p.confirmation_text}` : ""}
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

export default function RunReviewPage() {
  const { runId = "" } = useParams();
  const qc = useQueryClient();
  const runQuery = useApplyRun(runId);
  const run = runQuery.data;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");

  const refresh = (r: ApplyRun) => {
    qc.setQueryData(applyKeys.run(r.id), r);
    void qc.invalidateQueries({ queryKey: ["apply", "runs"] });
  };
  const answer = useMutation({
    mutationFn: () => answerRun(runId, edits),
    onSuccess: (r) => {
      setEdits({});
      refresh(r);
      setFlash("Answers saved — they're in your answer bank for next time.");
    },
  });
  const approve = useMutation({ mutationFn: () => approveRun(runId), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => cancelApplyRun(runId), onSuccess: refresh });
  const finish = useMutation({
    mutationFn: (submitted: boolean) => finishRun(runId, submitted),
    onSuccess: refresh,
  });

  const fields = useMemo(() => run?.fields ?? [], [run?.fields]);
  const aiDrafts = fields.filter((f) => f.source === "ai" && f.value && !(f.key in edits)).length;
  const editable = run?.state === "awaiting_input" || run?.state === "awaiting_review";
  const dirty = Object.keys(edits).length > 0;
  const actionError = answer.error ?? approve.error ?? cancel.error ?? finish.error;

  if (runQuery.isLoading)
    return (
      <p className="empty-state" role="status">
        Loading…
      </p>
    );
  if (runQuery.isError || !run)
    return (
      <div className="apply-page">
        <p className="login-error" role="alert">
          {errorMessage(runQuery.error, "Couldn't load this apply run.")}
        </p>
        <Link to="/apply">Back to Apply Center</Link>
      </div>
    );

  const copyAll = () =>
    void navigator.clipboard?.writeText(
      fields.map((f) => `${f.label}\n${f.value ?? ""}`).join("\n\n"),
    );

  return (
    <div className="apply-page run-review">
      <p>
        <Link to="/apply">← Apply Center</Link>
      </p>
      <div className="page-header">
        <div>
          <h2>{run.title}</h2>
          <p>
            {run.company} ·{" "}
            {run.mode === "fast" ? "Fast apply (LinkedIn)" : `Auto apply · ${run.adapter}`}
          </p>
        </div>
      </div>

      <p className="run-state" role="status" aria-live="polite">
        <StatusBadge status={run.state} /> {run.message}
        {isRunMoving(run.state) && <span className="field-hint"> Updating…</span>}
      </p>

      {run.state === "needs_user" && (
        <section className="review-block handoff">
          <h3>Over to you</h3>
          <p>
            The app stopped here instead of guessing. Open the job page, finish the application
            yourself (your answers are below to copy), then tell us what happened.
          </p>
          <div className="prep-row">
            <a className="btn-apply" href={run.apply_url} target="_blank" rel="noopener noreferrer">
              Open job page
            </a>
            {fields.length > 0 && (
              <button type="button" className="btn-secondary" onClick={copyAll}>
                Copy all answers
              </button>
            )}
            <button
              type="button"
              className="btn-run"
              disabled={finish.isPending}
              onClick={() => finish.mutate(true)}
            >
              I submitted it
            </button>
            <button
              type="button"
              className="btn-small"
              disabled={finish.isPending}
              onClick={() => finish.mutate(false)}
            >
              I didn't apply
            </button>
          </div>
        </section>
      )}

      {fields.length > 0 && (
        <section className="review-block">
          <h3>Answers</h3>
          <ul className="field-list">
            {fields.map((f) => {
              const s = sourceOf(f);
              const value = edits[f.key] ?? f.value ?? "";
              return (
                <li
                  key={f.key}
                  className={`field-row${f.needs_input && !(f.key in edits) ? " needs" : ""}`}
                >
                  <label htmlFor={`field-${f.key}`} className="field-label">
                    {f.label}
                  </label>
                  <span className={`badge ${s.tone}`}>{s.label}</span>
                  <FieldInput
                    field={f}
                    value={value}
                    editable={editable}
                    onChange={(v) => setEdits((e) => ({ ...e, [f.key]: v }))}
                  />
                </li>
              );
            })}
          </ul>
          {editable && (
            <button
              type="button"
              className="btn-secondary"
              disabled={!dirty || answer.isPending}
              onClick={() => answer.mutate()}
            >
              Save answers
            </button>
          )}
        </section>
      )}

      {Object.keys(run.files ?? {}).length > 0 && (
        <section className="review-block">
          <h3>Files</h3>
          <ul className="usage-list">
            {Object.entries(run.files ?? {}).map(([key, what]) => (
              <li key={key}>
                {what === "resume" ? "Resume" : "Cover letter"} → upload field “{key}”
              </li>
            ))}
          </ul>
          {run.resume_id && (
            <button
              type="button"
              className="btn-small"
              onClick={() =>
                void resumeFile(run.resume_id!).then((b) =>
                  saveBlob(b, `Resume - ${run.company}.docx`),
                )
              }
            >
              Download the resume it uses
            </button>
          )}
        </section>
      )}

      {run.state === "awaiting_review" && (
        <section className="review-block approve">
          <p>
            Submits within about a minute (inside your apply hours).{" "}
            <strong>A submitted application can't be taken back.</strong>
          </p>
          <button
            type="button"
            className="btn-apply"
            disabled={dirty || approve.isPending}
            onClick={() => approve.mutate()}
          >
            {aiDrafts > 0
              ? `Approve ${aiDrafts} AI answer${aiDrafts === 1 ? "" : "s"} and submit`
              : "Approve and submit"}
          </button>
          {dirty && <span className="field-hint"> Save your answers first.</span>}
        </section>
      )}

      {(isRunMoving(run.state) ||
        run.state === "awaiting_input" ||
        run.state === "awaiting_review") && (
        <button
          type="button"
          className="btn-small"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancel this application
        </button>
      )}

      {flash && (
        <p className="admin-flash" role="status">
          {flash}
        </p>
      )}
      {actionError && (
        <p className="login-error" role="alert">
          {errorMessage(actionError, "Couldn't do that.")}
        </p>
      )}
      <Screenshots run={run} />
    </div>
  );
}
