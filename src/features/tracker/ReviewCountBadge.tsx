import { useQuery } from "@tanstack/react-query";
import { listReview, trackerKeys } from "./trackerApi";

const BADGE_POLL_MS = 60_000;

/** How many emails wait for review (nav badge; refreshed every minute and after resolve / sync). */
export function ReviewCountBadge() {
  const review = useQuery({
    queryKey: trackerKeys.review,
    queryFn: listReview,
    refetchInterval: BADGE_POLL_MS,
    retry: false,
  });
  const n = review.data?.total ?? 0;
  if (!n) return null;
  return (
    <span className="nav-count" aria-label={`${n} email${n === 1 ? "" : "s"} to review`}>
      {n}
    </span>
  );
}
