/**
 * One company in the ATS search results (F6 plan §1.3): platform badge,
 * careers link, matching / open job counts, locations, the top matching jobs,
 * and "Show all" for the company's other open jobs.
 */
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { AtsCompanyGroup, AtsJob } from "../../lib/api/types";
import { atsKeys, getCompanyJobs } from "./atsApi";
import { FollowButton } from "./FollowButton";
import { ago, safeHttpUrl } from "./platforms";

export function AtsJobRow({ job, onDetails }: { job: AtsJob; onDetails: (job: AtsJob) => void }) {
  const url = safeHttpUrl(job.url);
  const posted = ago(job.posted_at ?? job.first_seen_at);
  return (
    <li className="ats-job">
      <div className="ats-job-main">
        <button type="button" className="link-button ats-job-title" onClick={() => onDetails(job)}>
          {job.title}
        </button>
        <span className="ats-job-meta">
          {job.location || "Location not given"}
          {(job.more_locations?.length ?? 0) > 0 && (
            <span className="ats-more-places" title={job.more_locations!.join(" · ")}>
              {" "}
              +{job.more_locations!.length} location{job.more_locations!.length === 1 ? "" : "s"}
            </span>
          )}
          {job.remote && <span className="ats-tag">Remote</span>}
          {posted && <> · {posted}</>}
          {job.applied && <span className="ats-tag is-applied">Applied</span>}
        </span>
      </div>
      <div className="ats-job-actions">
        <button
          type="button"
          className="btn-small"
          aria-label={`Details: ${job.title}`}
          onClick={() => onDetails(job)}
        >
          Details
        </button>
        {url && (
          <a
            className="btn-small"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open job page for ${job.title} (new tab)`}
          >
            Open job page
          </a>
        )}
      </div>
    </li>
  );
}

export function CompanyCard({
  group,
  query,
  onDetails,
}: {
  group: AtsCompanyGroup;
  query: string;
  onDetails: (job: AtsJob, company: AtsCompanyGroup) => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const all = useQuery({
    queryKey: atsKeys.companyJobs(group.company_id, ""),
    queryFn: () => getCompanyJobs(group.company_id),
    enabled: expanded,
  });
  const careers = safeHttpUrl(group.careers_url);
  const newest = ago(group.newest_posted_at);
  const topIds = new Set(group.top_jobs.map((j) => j.id));
  const others = (all.data?.jobs ?? []).filter((j) => !topIds.has(j.id));
  const more = group.open_jobs - group.top_jobs.length;
  const details = (job: AtsJob) => onDetails(job, group);

  return (
    <li className="card ats-company" aria-labelledby={`${id}-name`}>
      <div className="ats-company-head">
        <div>
          <h3 id={`${id}-name`} className="ats-company-name">
            {group.name}
          </h3>
          <p className="ats-company-meta">
            <span className="ats-platform" data-platform={group.platform}>
              {group.platform_name}
            </span>
            <span>
              <strong>{group.matching_jobs}</strong> matching
              {group.matching_jobs === 1 ? " job" : " jobs"} · {group.open_jobs} open
            </span>
            {newest && <span>newest {newest}</span>}
          </p>
          {group.locations.length > 0 && (
            <p className="field-hint">{group.locations.slice(0, 5).join(" · ")}</p>
          )}
        </div>
        <div className="ats-company-actions">
          <FollowButton
            companyId={group.company_id}
            name={group.name}
            followed={Boolean(group.followed)}
          />
          {careers && (
            <a
              className="btn-secondary"
              href={careers}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Careers page of ${group.name} (new tab)`}
            >
              Careers page
            </a>
          )}
        </div>
      </div>

      <p className="sr-only">Top matches for “{query}”</p>
      <ul className="ats-jobs">
        {group.top_jobs.map((j) => (
          <AtsJobRow key={j.id} job={j} onDetails={details} />
        ))}
      </ul>

      {more > 0 && (
        <div className="ats-more">
          <button
            type="button"
            className="link-button"
            aria-expanded={expanded}
            aria-controls={`${id}-all`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide other jobs" : `Show all ${group.open_jobs} open jobs`}
          </button>
          {expanded && (
            <div id={`${id}-all`}>
              {all.isLoading ? (
                <p className="field-hint" role="status">
                  Loading…
                </p>
              ) : all.isError ? (
                <p className="login-error" role="alert">
                  {errorMessage(all.error, "Couldn't load this company's jobs.")}{" "}
                  <button type="button" className="link-button" onClick={() => void all.refetch()}>
                    Try again
                  </button>
                </p>
              ) : others.length === 0 ? (
                <p className="field-hint">No other open jobs right now.</p>
              ) : (
                <ul className="ats-jobs">
                  {others.map((j) => (
                    <AtsJobRow key={j.id} job={j} onDetails={details} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
