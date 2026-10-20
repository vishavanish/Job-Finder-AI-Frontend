/**
 * Needs-review inbox (F5 plan §1.4): emails the matcher wasn't sure about,
 * with the AI's reading, the suggested applications and their scores, and
 * Confirm / Change / Ignore.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../../components/Dialog";
import { statusLabel } from "../../components/status";
import { errorMessage } from "../../lib/api/errors";
import type { EmailEvent, ResolveCategory, ResolveIn } from "../../lib/api/types";
import { CATEGORY_STATUS, RESOLVE_CATEGORIES, categoryLabel, formatDate } from "./stages";
import {
  listApplications,
  listGmailAccounts,
  listReview,
  resolveReview,
  trackerKeys,
} from "./trackerApi";

const isResolveCategory = (c: string | null | undefined): c is ResolveCategory =>
  Boolean(c && (RESOLVE_CATEGORIES as string[]).includes(c));

function outcome(email: EmailEvent, before: EmailEvent, appName: string): string {
  if (email.state === "ignored") return `Ignored “${before.subject}”.`;
  if (email.applied_status) return `${appName} is now ${statusLabel(email.applied_status)}.`;
  return `Noted on ${appName}'s timeline — its status didn't change.`;
}

function ChangeDialog({
  email,
  onClose,
  onSave,
}: {
  email: EmailEvent;
  onClose: () => void;
  onSave: (body: ResolveIn, appName: string) => Promise<unknown>;
}) {
  const ids = useId();
  const apps = useQuery({
    queryKey: trackerKeys.applications({}),
    queryFn: () => listApplications({}),
  });
  const [appId, setAppId] = useState((email.suggestions ?? [])[0]?.application_id ?? "");
  const [category, setCategory] = useState<ResolveCategory | "">(
    isResolveCategory(email.category) ? email.category : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suggested = new Set((email.suggestions ?? []).map((s) => s.application_id));
  const others = (apps.data?.applications ?? []).filter((a) => !suggested.has(a.id));
  const name = (id: string) => {
    const s = (email.suggestions ?? []).find((x) => x.application_id === id);
    const a = s ?? apps.data?.applications.find((x) => x.id === id);
    return a ? `${a.company} — ${a.title}` : "the application";
  };

  const save = async () => {
    setError("");
    if (!appId || !category) {
      setError("Choose the application and what the email means.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ action: "change", application_id: appId, category }, name(appId));
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save."));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Which application is this about?"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-run" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className="field-hint">
        “{email.subject}” from {email.sender}
      </p>
      <label className="field">
        <span>Application</span>
        <select id={`${ids}-app`} value={appId} onChange={(e) => setAppId(e.target.value)}>
          <option value="">Choose…</option>
          {(email.suggestions ?? []).length > 0 && (
            <optgroup label="Suggested">
              {(email.suggestions ?? []).map((s) => (
                <option key={s.application_id} value={s.application_id}>
                  {s.company} — {s.title} (match {s.score})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={apps.isLoading ? "Loading all applications…" : "All applications"}>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company} — {a.title}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {apps.isError && (
        <p className="field-hint">Couldn't load the full list — the suggestions are still here.</p>
      )}
      <label className="field">
        <span>What the email means</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ResolveCategory | "")}
        >
          <option value="">Choose…</option>
          {RESOLVE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)} → {statusLabel(CATEGORY_STATUS[c])}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function ReviewItem({
  email,
  onResolve,
}: {
  email: EmailEvent;
  onResolve: (body: ResolveIn, appName: string) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const top = (email.suggestions ?? [])[0];
  const category = isResolveCategory(email.category) ? email.category : null;
  const run = (body: ResolveIn, appName: string) => {
    setBusy(true);
    setError("");
    onResolve(body, appName).catch((err) => {
      setError(errorMessage(err, "Couldn't save."));
      setBusy(false);
    });
  };

  return (
    <li className="review-item">
      <div className="review-email">
        <p className="review-subject">{email.subject || "(no subject)"}</p>
        <p className="field-hint">
          {email.sender} · {formatDate(email.received_at, true)}
        </p>
        {email.snippet && <p className="review-snippet">{email.snippet}</p>}
      </div>
      <div className="review-reading">
        <p>
          <strong>AI reading:</strong> {categoryLabel(email.category)}
          {email.confidence != null && ` (${Math.round(email.confidence * 100)}% sure)`}
          {email.company && ` · ${email.company}`}
          {email.role && ` · ${email.role}`}
        </p>
        {email.summary && <p className="field-hint">{email.summary}</p>}
        {(email.suggestions ?? []).length > 0 ? (
          <>
            <p className="review-suggest-label">Possible applications</p>
            <ul className="review-suggestions">
              {(email.suggestions ?? []).map((s) => (
                <li key={s.application_id}>
                  <Link to={`/tracker/${s.application_id}`}>
                    {s.company} — {s.title}
                  </Link>{" "}
                  <span className="match-score" title="How well the email matches (0–100)">
                    match {s.score}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="field-hint">No application looked like a match — choose one with Change.</p>
        )}
      </div>
      <div className="review-actions">
        {top && category && (
          <button
            type="button"
            className="btn-run"
            disabled={busy}
            onClick={() => run({ action: "confirm" }, `${top.company} — ${top.title}`)}
          >
            Confirm: {top.company} → {statusLabel(CATEGORY_STATUS[category])}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => setChanging(true)}
        >
          Change
        </button>
        <button
          type="button"
          className="btn-small"
          disabled={busy}
          onClick={() => run({ action: "ignore" }, "")}
        >
          Ignore — not about my applications
        </button>
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {changing && (
        <ChangeDialog email={email} onClose={() => setChanging(false)} onSave={onResolve} />
      )}
    </li>
  );
}

export function ReviewInbox({ onOpenGmail }: { onOpenGmail: () => void }) {
  const qc = useQueryClient();
  const [done, setDone] = useState("");
  const review = useQuery({ queryKey: trackerKeys.review, queryFn: listReview });
  const accounts = useQuery({ queryKey: trackerKeys.accounts, queryFn: listGmailAccounts });
  const resolve = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveIn; before: EmailEvent; name: string }) =>
      resolveReview(id, body),
    onSuccess: (out, { before, name }) => {
      setDone(outcome(out, before, name));
      void qc.invalidateQueries({ queryKey: trackerKeys.all });
    },
  });

  const list = review.data?.events ?? [];
  const noGmail = accounts.data && accounts.data.accounts.length === 0;

  return (
    <div className="review-inbox">
      <p className="sr-only" role="status" aria-live="polite">
        {done}
      </p>
      {done && (
        <p className="flash-ok" aria-hidden="true">
          {done}
        </p>
      )}
      {review.isLoading ? (
        <p className="empty-state" role="status">
          Loading…
        </p>
      ) : review.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(review.error, "Couldn't load the emails to review.")}{" "}
          <button type="button" className="link-button" onClick={() => void review.refetch()}>
            Try again
          </button>
        </p>
      ) : list.length === 0 ? (
        noGmail ? (
          <p className="empty-state">
            Connect Gmail to track replies automatically.{" "}
            <button type="button" className="link-button" onClick={onOpenGmail}>
              Open Gmail settings
            </button>
          </p>
        ) : (
          <p className="empty-state">
            Nothing to review. Emails the tracker is unsure about appear here.
          </p>
        )
      ) : (
        <>
          <p className="field-hint">
            The tracker wasn't sure which application these emails are about, or what they mean.
            Nothing changes until you choose.
          </p>
          <ul className="review-list">
            {list.map((e) => (
              <ReviewItem
                key={e.id}
                email={e}
                onResolve={(body, name) => resolve.mutateAsync({ id: e.id, body, before: e, name })}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
