/**
 * One ATS job (F6 plan §1.6): the full description (fetched on demand, plain
 * text), Open job page, Save, and the F4 apply buttons. Save and the apply
 * buttons first turn the index job into a normal job (POST /ats/jobs/{id}/track).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useEntitlement } from "../../lib/auth/access";
import { errorMessage } from "../../lib/api/errors";
import type { AtsJob, AtsJobDetail, StreamedJob } from "../../lib/api/types";
import { ApplyButtons } from "../apply/ApplyButtons";
import { applyKeys, getApplyOptions } from "../apply/applyApi";
import { jobKeys, setJobState } from "../jobs/jobsApi";
import { atsKeys, getAtsJob, trackAtsJob } from "./atsApi";
import { ago, platformName, safeHttpUrl } from "./platforms";
import "../apply/apply.css";

/** The normal job shape ApplyButtons and the prep dialog need. */
function toStreamedJob(
  d: AtsJobDetail,
  jobId: string,
  options: StreamedJob["apply_options"],
): StreamedJob {
  return {
    id: jobId,
    source: platformName(d.platform),
    title: d.title,
    company: d.company,
    location: d.location,
    url: d.url,
    description: d.description,
    posted: d.posted_at ?? "",
    posted_at: d.posted_at ?? null,
    keyword_score: null,
    llm_score: null,
    llm_reason: "",
    auto_apply_capable: false,
    created_at: d.first_seen_at ?? "",
    apply_url: d.url,
    apply_options: options,
  };
}

export function JobDetailsDialog({
  job,
  company,
  onClose,
}: {
  job: AtsJob;
  company: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const autoApply = useEntitlement("auto_apply");
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState(job.applied);
  const [hidden, setHidden] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const detail = useQuery({ queryKey: atsKeys.job(job.id), queryFn: () => getAtsJob(job.id) });

  // Turn the index job into a normal one once; then the usual job and apply calls work on it.
  const track = useMutation({
    mutationFn: async () => {
      const jobId = detail.data?.job_id ?? (await trackAtsJob(job.id)).job_id;
      const options = await getApplyOptions(jobId);
      return { jobId, options };
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { jobId } = track.data ?? (await track.mutateAsync());
      await setJobState(jobId, "save");
    },
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: jobKeys.list("saved") });
    },
  });

  const d = detail.data;
  const url = safeHttpUrl(job.url);
  const posted = ago(job.posted_at ?? job.first_seen_at);

  return (
    <Dialog title={job.title} onClose={onClose} wide>
      <p className="ats-dialog-meta">
        {company}
        {d && <> · {platformName(d.platform)}</>} · {job.location || "Location not given"}
        {job.remote && " · Remote"}
        {posted && ` · posted ${posted}`}
      </p>
      {applied && <p className="flash-ok">You applied to this job.</p>}

      <div className="ats-dialog-actions">
        {url && (
          <a className="btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
            Open job page
          </a>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={saved || save.isPending}
          onClick={() => save.mutate()}
        >
          {saved ? "Saved to Jobs" : save.isPending ? "Saving…" : "Save"}
        </button>
        {!showApply && (
          <button
            type="button"
            className="btn-run"
            disabled={track.isPending || detail.isLoading}
            onClick={() =>
              track.data
                ? setShowApply(true)
                : track.mutate(undefined, { onSuccess: () => setShowApply(true) })
            }
          >
            {track.isPending ? "Getting apply options…" : "Apply…"}
          </button>
        )}
      </div>
      {(track.isError || save.isError) && (
        <p className="login-error" role="alert">
          {errorMessage(track.error ?? save.error, "Couldn't prepare this job.")}
        </p>
      )}
      {showApply && track.data && d && !hidden && (
        <ApplyButtons
          job={toStreamedJob(d, track.data.jobId, track.data.options)}
          applied={applied}
          entitlement={autoApply}
          onApplied={() => {
            setApplied(true);
            void qc.invalidateQueries({ queryKey: atsKeys.all });
            void qc.invalidateQueries({ queryKey: applyKeys.all });
          }}
          onNotInterested={async () => {
            await setJobState(track.data!.jobId, "hide");
            setHidden(true);
          }}
        />
      )}
      {hidden && <p className="field-hint">Hidden from your job feed.</p>}

      <h3 className="ats-dialog-h">Job description</h3>
      {detail.isLoading ? (
        <p className="field-hint" role="status">
          Loading the full description from the careers page…
        </p>
      ) : detail.isError ? (
        <p className="login-error" role="alert">
          {errorMessage(detail.error, "Couldn't load this job.")}{" "}
          <button type="button" className="link-button" onClick={() => void detail.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="ats-description">{d?.description || "No description given."}</div>
      )}
    </Dialog>
  );
}
