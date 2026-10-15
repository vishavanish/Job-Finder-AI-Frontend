/**
 * Access control in the UI (spec §5.2). UX only: hides or disables what the
 * user can't use and says why. The backend enforces every rule.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { capitalize, featureLabel, hasRole, useEntitlement, type Role } from "../lib/auth/access";

/** Route guard: renders children only for the given roles, otherwise explains why. */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (hasRole(user?.role, roles)) return children;
  const who = roles.map((r) => (r === "admin" ? "admins" : `${r}s`)).join(" and ");
  return (
    <div className="access-denied" role="alert">
      <h2>You don't have access to this page</h2>
      <p>Only {who} can open it. If you need access, ask an admin to change your role.</p>
      <Link className="btn-small" to="/">
        Go to Run and results
      </Link>
    </div>
  );
}

/** Wraps a page that needs a feature: shows the reason instead of a form that will fail. */
export function RequireFeature({ feature, children }: { feature: string; children: ReactNode }) {
  const { allowed, reason } = useEntitlement(feature);
  if (allowed) return children;
  return (
    <div className="access-denied" role="alert">
      <h2>{capitalize(featureLabel(feature))} isn't available</h2>
      <p>{reason}</p>
    </div>
  );
}
