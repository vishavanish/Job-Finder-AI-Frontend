import { useQuery } from "@tanstack/react-query";
import { applyKeys, listRuns } from "./applyApi";

const BADGE_POLL_MS = 60_000;

/** How many apply runs need the user (nav badge; refreshed every minute and after any apply action). */
export function ApplyWaitingBadge() {
  const waiting = useQuery({
    queryKey: applyKeys.waitingCount,
    queryFn: () => listRuns("waiting", undefined, 1),
    refetchInterval: BADGE_POLL_MS,
    retry: false,
  });
  const n = waiting.data?.total ?? 0;
  if (!n) return null;
  return (
    <span className="nav-count" aria-label={`${n} need${n === 1 ? "s" : ""} you`}>
      {n}
    </span>
  );
}
