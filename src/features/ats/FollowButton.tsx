/** Follow / Following toggle for one registry company (QA4 Target companies). */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import { atsKeys } from "./atsApi";
import { followCompany, unfollowCompany } from "./targetsApi";

export function FollowButton({
  companyId,
  name,
  followed,
}: {
  companyId: string;
  name: string;
  followed: boolean;
}) {
  const qc = useQueryClient();
  // The search results are cached for minutes; keep the button right without waiting for them.
  const [on, setOn] = useState(followed);
  const toggle = useMutation({
    mutationFn: async () => {
      if (on) await unfollowCompany(companyId);
      else await followCompany(companyId);
    },
    onSuccess: () => {
      setOn((v) => !v);
      void qc.invalidateQueries({ queryKey: atsKeys.all });
    },
  });
  return (
    <span className="ats-follow">
      <button
        type="button"
        className={on ? "btn-small is-following" : "btn-small"}
        aria-pressed={on}
        aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {on ? "★ Following" : "☆ Follow"}
      </button>
      {toggle.isError && (
        <span className="login-error" role="alert">
          {errorMessage(toggle.error, "Couldn't change this.")}
        </span>
      )}
    </span>
  );
}
