/**
 * Dashboard card "New at your companies" (QA4 §2): followed companies with
 * roles you haven't seen yet, each linking to Target companies. Hidden when
 * you follow no companies or your account has no company career pages.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ActionRow, CardHead } from "../../components/PageKit";
import { useEntitlement } from "../../lib/auth/access";
import { getFollowing, targetKeys } from "./targetsApi";

export function NewAtCompaniesCard() {
  const ats = useEntitlement("ats_discovery");
  const following = useQuery({
    queryKey: targetKeys.following,
    queryFn: getFollowing,
    enabled: ats.allowed,
    retry: false,
  });
  const companies = following.data?.companies ?? [];
  if (!ats.allowed || companies.length === 0) return null;
  const fresh = companies.filter((c) => c.new_count > 0).sort((a, b) => b.new_count - a.new_count);
  const total = fresh.reduce((n, c) => n + c.new_count, 0);
  return (
    <section className="card kit-card dash-targets" aria-labelledby="targets-h">
      <CardHead
        icon="building"
        tone={total > 0 ? "attention" : "muted"}
        id="targets-h"
        title="New at your companies"
        sub={
          total > 0
            ? `${total} new role${total === 1 ? "" : "s"} at companies you follow`
            : `No new roles at the ${companies.length} compan${companies.length === 1 ? "y" : "ies"} you follow`
        }
      >
        <Link to="/ats-targets?tab=mine" className="btn-secondary dash-head-link">
          Target companies
        </Link>
      </CardHead>
      {fresh.length > 0 && (
        <div className="dash-actions-list">
          {fresh.slice(0, 5).map((c) => (
            <ActionRow
              key={c.id}
              to="/ats-targets?tab=mine"
              n={c.new_count}
              title={`${c.name}: ${c.new_count} new role${c.new_count === 1 ? "" : "s"}`}
              sub={`${c.open_matching} matching open · ${c.platform_name ?? "career page"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
