/**
 * QA10 keyword fit in the prep dialog: how much of the job's hard skills,
 * title and degree the resume shows, and before → after once the tailored
 * resume is ready. Missing skills are never written in for the user.
 */
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { KeywordFit } from "../../lib/api/types";
import { getKeywordFit, profileKeys } from "../profile/profileApi";

function Chips({ items, tone }: { items: string[]; tone: "found" | "missing" }) {
  return (
    <ul className={`fit-chips fit-${tone}`}>
      {items.map((s) => (
        <li key={s} className="chip">
          {s}
        </li>
      ))}
    </ul>
  );
}

export function KeywordFitBlock({
  jobId,
  tailoredResumeId,
}: {
  jobId: string;
  tailoredResumeId?: string | null;
}) {
  const id = useId();
  const master = useQuery({
    queryKey: profileKeys.keywordFit(jobId, null),
    queryFn: () => getKeywordFit(jobId),
    retry: false,
    staleTime: 60_000,
  });
  const tailored = useQuery({
    queryKey: profileKeys.keywordFit(jobId, tailoredResumeId ?? null),
    queryFn: () => getKeywordFit(jobId, tailoredResumeId),
    enabled: Boolean(tailoredResumeId),
    retry: false,
    staleTime: 60_000,
  });

  if (master.isLoading) return null;
  if (master.isError)
    return (
      <p className="field-hint" role="status">
        {errorMessage(master.error, "Keyword fit isn't available for this job.")}
      </p>
    );
  const fit: KeywordFit | undefined = tailored.data ?? master.data;
  if (!fit || fit.fit === null || fit.fit === undefined) return null;
  const before = master.data?.fit;
  const showAfter = tailored.data && before !== null && before !== undefined;
  const good = fit.fit >= fit.target;

  return (
    <section className="prep-block keyword-fit" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Keyword fit</h3>
      <p className="fit-score">
        <span className={`badge tone-${good ? "positive" : "attention"}`}>
          {showAfter ? (
            <>
              {before}% → {fit.fit}%
            </>
          ) : (
            <>{fit.fit}%</>
          )}
        </span>{" "}
        <span className="field-hint">
          {showAfter ? "your resume → the tailored one. " : ""}
          Around {fit.target}% of the job's keywords is a good fit.
        </span>
      </p>
      {(fit.hard_found ?? []).length > 0 && (
        <>
          <h4>In your resume</h4>
          <Chips items={fit.hard_found ?? []} tone="found" />
        </>
      )}
      {(fit.hard_missing ?? []).length > 0 && (
        <>
          <h4>The job asks for, not in your resume</h4>
          <Chips items={fit.hard_missing ?? []} tone="missing" />
          <p className="field-hint">
            Add these only if you really have them — a recruiter will ask.
          </p>
        </>
      )}
      <ul className="fit-facts">
        <li>Job title {fit.title_found ? "appears" : "doesn't appear"} in your resume.</li>
        {fit.education?.required && (
          <li>
            Asks for a {fit.education.required} degree —{" "}
            {fit.education.met ? "your resume shows one." : "not found in your resume."}
          </li>
        )}
      </ul>
    </section>
  );
}
