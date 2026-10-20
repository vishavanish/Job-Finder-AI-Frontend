/** Admin › Usage: AI calls, tokens and cost for everyone, by model and by person. */
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import type { UsageSummary } from "../../lib/api/types";
import { UsageCard } from "../models/UsageCard";
import { getAllUsage } from "./aiAdminApi";
import "./admin.css";
import "../models/models.css";

const RANGES = [7, 30, 90] as const;

export default function AdminUsagePage() {
  const [days, setDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setUsage(null);
    setError("");
    getAllUsage(days)
      .then((u) => active && setUsage(u))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load usage.")));
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>Usage</h2>
          <p>
            Every AI call, including failed ones, with tokens and cost from the model&apos;s prices.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="usage-range">Period</label>
          <select id="usage-range" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
      {!usage && !error && (
        <p className="empty-state" role="status">
          Loading usage…
        </p>
      )}
      {usage && <UsageCard usage={usage} title={`All AI usage, last ${days} days`} />}
    </div>
  );
}
