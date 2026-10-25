/** Target companies › Suggested (QA4): companies hiring for your titles in your places, or where you applied. */
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../../lib/api/errors";
import { FollowButton } from "./FollowButton";
import { getSuggestions, targetKeys } from "./targetsApi";

export function Suggestions() {
  const q = useQuery({ queryKey: targetKeys.suggestions, queryFn: getSuggestions });
  if (q.isLoading)
    return (
      <p className="field-hint" role="status">
        Finding companies for you…
      </p>
    );
  if (q.isError)
    return (
      <p className="login-error" role="alert">
        {errorMessage(q.error, "Couldn't load suggestions.")}
      </p>
    );
  const companies = q.data?.companies ?? [];
  if (!companies.length)
    return (
      <p className="empty-state">
        No suggestions yet. Add job titles in Keywords and skills and places in Profile, then check
        back.
      </p>
    );
  return (
    <ul className="ats-results">
      {companies.map((c) => (
        <li key={c.company_id} className="card ats-company">
          <div className="ats-company-head">
            <div>
              <h3 className="ats-company-name">{c.name}</h3>
              <p className="ats-company-meta">
                <span className="ats-platform" data-platform={c.platform}>
                  {c.platform_name}
                </span>
                <span>
                  {c.open_matching > 0 ? (
                    <>
                      <strong>{c.open_matching}</strong> matching role
                      {c.open_matching === 1 ? "" : "s"} · {c.reason}
                    </>
                  ) : (
                    c.reason
                  )}
                </span>
              </p>
            </div>
            <FollowButton companyId={c.company_id} name={c.name} followed={false} />
          </div>
        </li>
      ))}
    </ul>
  );
}
