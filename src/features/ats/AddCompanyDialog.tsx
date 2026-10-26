/**
 * Add a company to the shared registry (F6 plan §1.7) by its careers link, plus
 * the one-time import of the old browser-only ATS targets (§1.8).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { ApiError, errorMessage } from "../../lib/api/errors";
import type { AtsCompany } from "../../lib/api/types";
import { addAtsCompany, atsKeys } from "./atsApi";
import { forgetLegacyTargets, targetToCompany, type LegacyTarget } from "./legacyTargets";
import { platformName } from "./platforms";

function addError(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return "You've added a lot of companies this hour. Try again later.";
  }
  return errorMessage(err, "Couldn't add this company.");
}

function addedText(c: AtsCompany): string {
  if (!c.created) {
    return `${c.name} (${c.platform_name}) is already in the registry${
      c.job_count ? ` with ${c.job_count} open jobs` : ""
    }.`;
  }
  return `Added ${c.name} (${c.platform_name}). Its jobs appear after the first check, in a minute or two.`;
}

export function AddCompanyDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => addAtsCompany({ url: url.trim() }),
    onSuccess: () => {
      setUrl("");
      void qc.invalidateQueries({ queryKey: atsKeys.all });
    },
  });

  return (
    <Dialog
      title="Add a company"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="submit"
            form="ats-add-company"
            className="btn-run"
            disabled={!url.trim() || add.isPending}
          >
            {add.isPending ? "Checking…" : "Add company"}
          </button>
        </>
      }
    >
      <form
        id="ats-add-company"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add.mutate();
        }}
      >
        <label className="field">
          <span>Careers page or job link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jobs.lever.co/yourcompany"
            inputMode="url"
            autoComplete="off"
          />
        </label>
        <p className="field-hint">
          Works with Greenhouse, Lever, Workday, Recruitee, Ashby, SmartRecruiters, Workable,
          Personio, Breezy, Teamtailor, Rippling and Gem links. Companies you add are shared with
          everyone — only their public job list is stored.
        </p>
      </form>
      <div aria-live="polite">
        {add.isSuccess && <p className="flash-ok">{addedText(add.data)}</p>}
      </div>
      {add.isError && (
        <p className="login-error" role="alert">
          {addError(add.error)}
        </p>
      )}
    </Dialog>
  );
}

type ImportResult = { target: LegacyTarget; text: string; ok: boolean };

export function LegacyTargetsCard({
  targets,
  onDone,
}: {
  targets: LegacyTarget[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const out: ImportResult[] = [];
    for (const target of targets) {
      const body = targetToCompany(target);
      if (!body) {
        out.push({ target, ok: false, text: "custom pages can't go in the registry" });
        continue;
      }
      try {
        const c = await addAtsCompany(body);
        out.push({ target, ok: true, text: c.created ? "added" : "already there" });
      } catch (err) {
        out.push({ target, ok: false, text: addError(err) });
      }
    }
    forgetLegacyTargets();
    setResults(out);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: atsKeys.all });
  };

  const n = targets.length;
  return (
    <div className="card ats-legacy" role="region" aria-label="Your saved companies">
      {results ? (
        <>
          <p>Your saved companies:</p>
          <ul>
            {results.map((r) => (
              <li key={`${r.target.platform}:${r.target.slug}`}>
                {r.target.slug} ({platformName(r.target.platform)}) — {r.text}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-small" onClick={onDone}>
            Done
          </button>
        </>
      ) : (
        <>
          <p>
            You saved {n === 1 ? "1 company" : `${n} companies`} on the old ATS targets page (
            {targets.map((t) => t.slug).join(", ")}). Add {n === 1 ? "it" : "them"} to the registry
            so {n === 1 ? "its" : "their"} jobs show up in searches?
          </p>
          <div className="form-actions">
            <button type="button" className="btn-run" disabled={busy} onClick={() => void run()}>
              {busy ? "Adding…" : `Add ${n === 1 ? "it" : `these ${n}`}`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                forgetLegacyTargets();
                onDone();
              }}
            >
              No, forget {n === 1 ? "it" : "them"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
