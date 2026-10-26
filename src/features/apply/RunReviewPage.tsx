/**
 * One apply run (spec §6.4, F4 plan §1.4, F4.1): a hero with the state and
 * the one action that matters now, the form's page journey (AI form reader
 * runs), every question with its answer and where the answer came from
 * (grouped by page), the files, the screenshots and what the AI fallback
 * did. In test mode the AI form reader never submits: the user copies the
 * answers, applies on the job page and says so. Polls while the worker is
 * moving the run.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import {
  Confetti,
  Lightbox,
  PageJourney,
  SparkleChip,
  StatePill,
  type JourneyNode,
} from "../../components/KitExtras";
import { CardHead } from "../../components/PageKit";
import { errorMessage } from "../../lib/api/errors";
import type { ApplyProof, ApplyRun, ApplyRunField } from "../../lib/api/types";
import { CompanyAvatar, SiteChip } from "./ApplyBits";
import {
  applyKeys,
  answerRun,
  approveRun,
  cancelApplyRun,
  finishRun,
  getApplySettings,
  isGeneric,
  isRunMoving,
  resumeFile,
  runSteps,
  runVision,
  saveBlob,
} from "./applyApi";
import { useApplyRun } from "./useApplyRun";
import { proofTitle, useProofUrls } from "./useProofUrls";
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

type Shot = { proof: ApplyProof; url?: string };

function Gallery({ shots, onOpen }: { shots: Shot[]; onOpen: (s: Shot) => void }) {
  if (shots.length === 0) return null;
  return (
    <section className="kit-card card review-card" aria-labelledby="shots-title">
      <CardHead id="shots-title" icon="image" title="Screenshots" sub="Tap one to see it large" />
      <ul className="shot-grid">
        {shots.map((s) => (
          <li key={s.proof.id}>
            <figure className="proof">
              {s.url ? (
                <button
                  type="button"
                  className="shot-button"
                  onClick={() => onOpen(s)}
                  aria-label={`Open ${proofTitle(s.proof)}`}
                >
                  <img src={s.url} alt={proofTitle(s.proof)} />
                </button>
              ) : (
                <p className="field-hint shot-loading">Loading screenshot…</p>
              )}
              <figcaption>
                {s.proof.kind === "confirmation"
                  ? "Confirmation"
                  : s.proof.kind === "step"
                    ? proofTitle(s.proof)
                    : "Where it stopped"}
                {s.proof.kind !== "step" && s.proof.confirmation_text
                  ? ` — ${s.proof.confirmation_text}`
                  : ""}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AiHelp({ run }: { run: ApplyRun }) {
  const v = runVision(run);
  if (!v || (v.steps === 0 && v.map_calls === 0)) return null;
  return (
    <section className="kit-card card review-card ai-help" aria-labelledby="ai-help-title">
      <CardHead
        id="ai-help-title"
        icon="sparkle"
        title="AI help on this form"
        sub="Only for the parts the text reader couldn't do — never your answers' wording"
      />
      <p className="ai-help-line">
        {v.steps > 0 && (
          <>
            Looked at the page <strong className="num">{v.steps}</strong>{" "}
            {v.steps === 1 ? "time" : "times"} ·{" "}
            <span className="num">${v.cost_usd.toFixed(3)}</span>
          </>
        )}
        {v.steps > 0 && v.map_calls > 0 && " · "}
        {v.map_calls > 0 && (
          <>
            {v.map_calls} button {v.map_calls === 1 ? "check" : "checks"}
          </>
        )}
      </p>
      {v.log.length > 0 && (
        <details className="ai-help-log">
          <summary>What it did</summary>
          <ol>
            {v.log.map((e, i) => (
              <li key={i}>
                {e.stop
                  ? `Stopped: ${e.stop}`
                  : e.refused
                    ? `Refused ${e.action ?? "an action"}: ${e.refused}`
                    : `${e.action ?? "?"}${e.key ? ` → ${e.key}` : ""}`}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function journeyNodes(run: ApplyRun, shots: Shot[], open: (s: Shot) => void): JourneyNode[] {
  const steps = runSteps(run);
  const byPage = new Map<string, Shot>();
  for (const s of shots)
    if (s.proof.kind === "step") byPage.set(s.proof.confirmation_text ?? "", s);
  const nodes: JourneyNode[] = steps.map((st) => {
    const shot = byPage.get(`Page ${st.page}`);
    return {
      key: `p${st.page}`,
      label: `Page ${st.page}`,
      state: "done",
      thumb: shot?.url,
      onOpen: shot?.url ? () => open(shot) : undefined,
    };
  });
  const reading = isRunMoving(run.state) && run.state !== "submitting";
  if (reading) nodes.push({ key: "next", label: `Page ${steps.length + 1}`, state: "current" });
  const sent = run.state === "submitted" || run.state === "done";
  nodes.push({
    key: "submit",
    label: "Submit",
    state: sent ? "done" : run.state === "submitting" ? "current" : "todo",
  });
  return nodes;
}

export default function RunReviewPage() {
  const { runId = "" } = useParams();
  const qc = useQueryClient();
  const runQuery = useApplyRun(runId);
  const run = runQuery.data;
  const settings = useQuery({ queryKey: applyKeys.settings, queryFn: getApplySettings });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");
  const [copied, setCopied] = useState(false);
  const [large, setLarge] = useState<Shot | null>(null);
  const [party, setParty] = useState(false);
  const lastState = useRef<string | undefined>(undefined);

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

  // A short confetti burst when the run is confirmed sent while you watch.
  useEffect(() => {
    const prev = lastState.current;
    lastState.current = run?.state;
    if (prev && prev !== run?.state && (run?.state === "submitted" || run?.state === "done")) {
      setParty(true);
      const t = setTimeout(() => setParty(false), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [run?.state]);

  const fields = useMemo(() => run?.fields ?? [], [run?.fields]);
  const placeholder = useMemo(() => ({ id: runId, proofs: 0 }) as ApplyRun, [runId]);
  const { proofs, urls } = useProofUrls(run ?? placeholder);
  const shots: Shot[] = proofs.map((p) => ({ proof: p, url: urls[p.id] }));

  const aiDrafts = fields.filter((f) => f.source === "ai" && f.value && !(f.key in edits)).length;
  const editable = run?.state === "awaiting_input" || run?.state === "awaiting_review";
  const dirty = Object.keys(edits).length > 0;
  const actionError = answer.error ?? approve.error ?? cancel.error ?? finish.error;
  const generic = isGeneric(run?.adapter);
  const testMode =
    generic && run?.state === "awaiting_review" && settings.data?.generic_submit_enabled === false;

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
  const steps = runSteps(run);
  const missing = fields.filter((f) => f.needs_input && !(f.key in edits)).length;

  // Answers grouped by form page (AI form reader runs); one group otherwise.
  const groups: { title: string; sub: string; items: ApplyRunField[] }[] = [];
  if (steps.length > 0) {
    const seen = new Set<string>();
    for (const st of steps) {
      const items = fields.filter((f) => st.keys.includes(f.key) && !seen.has(f.key));
      items.forEach((f) => seen.add(f.key));
      if (items.length)
        groups.push({
          title: `Page ${st.page}`,
          sub: `${items.length} question${items.length === 1 ? "" : "s"}`,
          items,
        });
    }
    const rest = fields.filter((f) => !seen.has(f.key));
    if (rest.length) groups.push({ title: "Other questions", sub: "", items: rest });
  } else if (fields.length > 0) {
    groups.push({
      title: "Answers",
      sub: `${fields.length} question${fields.length === 1 ? "" : "s"} on the form`,
      items: fields,
    });
  }

  return (
    <div className="apply-page run-review">
      <p className="run-back">
        <Link to="/apply">← Apply Center</Link>
      </p>

      <section className={`run-hero kit-card card${testMode ? " is-test" : ""}`}>
        {party && <Confetti />}
        {testMode && (
          <span className="test-ribbon">
            <Icon name="alert" size={14} /> Test mode
          </span>
        )}
        <div className="run-hero-top">
          <CompanyAvatar company={run.company} size="lg" />
          <div className="run-hero-title">
            <h2>{run.title}</h2>
            <p>
              {run.company} · {run.mode === "fast" ? "Fast apply (LinkedIn)" : "Auto apply"}{" "}
              <SiteChip adapter={run.adapter} mode={run.mode} />
            </p>
          </div>
        </div>
        <p className="run-state" role="status" aria-live="polite">
          <StatePill status={run.state} /> <span>{run.message}</span>
          {isRunMoving(run.state) && <span className="field-hint"> Updating…</span>}
        </p>

        {run.state === "awaiting_input" && missing > 0 && (
          <a className="btn-run" href="#answers">
            Answer {missing} question{missing === 1 ? "" : "s"} below
          </a>
        )}

        {run.state === "awaiting_review" && !testMode && (
          <div className="run-hero-action">
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
          </div>
        )}

        {testMode && (
          <div className="run-hero-action">
            <p>
              The AI form reader is still in test mode, so <strong>you press Submit</strong> this
              time. Check the answers below, copy them into the form, then tell us what happened.
            </p>
            <div className="prep-row">
              <button
                type="button"
                className="btn-apply"
                disabled={dirty}
                onClick={() => {
                  copyAll();
                  setCopied(true);
                  window.open(run.apply_url, "_blank", "noopener,noreferrer");
                }}
              >
                Copy answers & open the job page
              </button>
              <button
                type="button"
                className={copied ? "btn-run" : "btn-secondary"}
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
            {copied && (
              <p className="field-hint" role="status">
                Answers copied — paste them in the job page tab.
              </p>
            )}
          </div>
        )}

        {run.state === "needs_user" && (
          <div className="run-hero-action handoff">
            <p>
              <strong>Over to you.</strong> The app stopped here instead of guessing. Open the job
              page, finish the application yourself
              {fields.length > 0 ? " (your answers are below to copy)" : ""}, then tell us what
              happened.
            </p>
            <div className="prep-row">
              <a
                className="btn-apply"
                href={run.apply_url}
                target="_blank"
                rel="noopener noreferrer"
              >
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
          </div>
        )}

        {(run.state === "submitted" || run.state === "done") && (
          <p className="run-hero-sent">
            <Icon name="check" size={16} /> Sent
            {run.submitted_at ? ` on ${new Date(run.submitted_at).toLocaleString()}` : ""}. We'll
            track replies in your Tracker.
          </p>
        )}
      </section>

      {(steps.length > 0 || (generic && isRunMoving(run.state))) && (
        <section className="kit-card card review-card" aria-labelledby="journey-title">
          <CardHead
            id="journey-title"
            icon="layers"
            title="Form pages"
            sub={
              steps.length
                ? `We read ${steps.length} page${steps.length === 1 ? "" : "s"} of this form`
                : "Reading the form…"
            }
          >
            {generic && <SparkleChip beta={false}>AI form reader</SparkleChip>}
          </CardHead>
          <PageJourney label="Form pages" nodes={journeyNodes(run, shots, setLarge)} />
          {run.state === "queued" && steps.length > 0 && (
            <p className="field-hint" role="status">
              Reading the next page…
            </p>
          )}
        </section>
      )}

      {groups.length > 0 && (
        <div id="answers" className="answer-groups">
          {groups.map((g) => (
            <section key={g.title} className="kit-card card review-card">
              <CardHead
                icon={g.title.startsWith("Page") ? "fileText" : "message"}
                title={g.title}
                sub={g.sub}
              />
              <ul className="field-list">
                {g.items.map((f) => {
                  const s = sourceOf(f);
                  const value = edits[f.key] ?? f.value ?? "";
                  return (
                    <li
                      key={f.key}
                      className={`field-row${f.needs_input && !(f.key in edits) ? " needs" : ""}${
                        s === SOURCE.ai ? " is-draft" : ""
                      }`}
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
            </section>
          ))}
          {editable && (
            <div className={`answers-save${dirty ? " is-dirty" : ""}`}>
              <button
                type="button"
                className="btn-secondary"
                disabled={!dirty || answer.isPending}
                onClick={() => answer.mutate()}
              >
                Save answers
              </button>
            </div>
          )}
        </div>
      )}

      {Object.keys(run.files ?? {}).length > 0 && (
        <section className="kit-card card review-card" aria-labelledby="files-title">
          <CardHead id="files-title" icon="fileText" title="Files" sub="Uploaded with the form" />
          <ul className="file-chips">
            {Object.entries(run.files ?? {}).map(([key, what]) => (
              <li key={key} className="file-chip">
                <Icon name="fileText" size={14} />
                {what === "resume" ? "Resume" : "Cover letter"}
                <span className="field-hint"> → “{key}”</span>
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

      <AiHelp run={run} />
      <Gallery shots={shots} onOpen={setLarge} />

      {(isRunMoving(run.state) ||
        run.state === "awaiting_input" ||
        run.state === "awaiting_review") && (
        <button
          type="button"
          className="btn-small run-cancel"
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
      {large?.url && (
        <Lightbox
          src={large.url}
          alt={proofTitle(large.proof)}
          caption={large.proof.page_url ?? undefined}
          onClose={() => setLarge(null)}
        />
      )}
    </div>
  );
}
