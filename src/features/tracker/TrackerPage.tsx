/**
 * Application tracker (spec §6.5, F5 plan §1): summary cards, then tabs —
 * Applications (table / kanban with filters), Needs review (emails the
 * matcher wasn't sure about) and Gmail. The tab lives in the URL (?tab=), and
 * Google's redirect back (?gmail=connected | error&reason=) opens the Gmail tab
 * with the outcome.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApplicationsView } from "./ApplicationsView";
import { GMAIL_RETURN } from "./gmail";
import { GmailPanel } from "./GmailPanel";
import { ReviewInbox } from "./ReviewInbox";
import { getStats, listReview, trackerKeys } from "./trackerApi";
import "../jobs/jobs.css"; // shared tabs
import "./tracker.css";

const TABS = [
  { id: "applications", label: "Applications" },
  { id: "review", label: "Needs review" },
  { id: "gmail", label: "Gmail" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function weekAgo(): string {
  const d = new Date(Date.now() - 6 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function SummaryCards() {
  const stats = useQuery({ queryKey: trackerKeys.stats, queryFn: getStats });
  if (stats.isError) return null; // the list below shows its own error
  const s = stats.data;
  const cards = [
    { label: "Applied", value: s?.total, to: "/tracker" },
    { label: "This week", value: s?.this_week, to: `/tracker?since=${weekAgo()}` },
    { label: "Interviews", value: s?.funnel.interview, to: "/tracker?status=interview" },
    { label: "Offers", value: s?.funnel.offer, to: "/tracker?status=offer" },
    { label: "Rejected", value: s?.rejected, to: "/tracker?status=rejected" },
    { label: "Emails to review", value: s?.needs_review, to: "/tracker?tab=review" },
  ];
  return (
    <ul className="summary-cards" aria-busy={stats.isLoading}>
      {cards.map((c) => (
        <li key={c.label}>
          <Link to={c.to} className="summary-card">
            <span className="summary-value">{c.value ?? "–"}</span>
            <span className="summary-label">{c.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TrackerPage() {
  const [params, setParams] = useSearchParams();
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const review = useQuery({ queryKey: trackerKeys.review, queryFn: listReview, retry: false });
  const reviewCount = review.data?.total ?? 0;
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "applications") as TabId;
  const select = (id: TabId) =>
    setParams(id === "applications" ? {} : { tab: id }, { replace: true });

  // Google's redirect back: show the outcome once, then drop it from the URL so a refresh doesn't repeat it.
  const gmail = params.get("gmail");
  useEffect(() => {
    if (!gmail) return;
    const key = gmail === "connected" ? "connected" : (params.get("reason") ?? "failed");
    setBanner(GMAIL_RETURN[key] ?? GMAIL_RETURN.failed!);
    setParams({ tab: "gmail" }, { replace: true });
  }, [gmail, params, setParams]);

  return (
    <div className="tracker-page">
      <div className="page-header">
        <div>
          <h2>Tracker</h2>
          <p>
            Every application with how it got its status — from the apply engine, from you, or from
            an email Gmail tracking found.
          </p>
        </div>
      </div>
      {banner && (
        <div
          className={banner.ok ? "tracker-banner is-ok" : "tracker-banner is-error"}
          role="status"
        >
          <span>{banner.text}</span>
          <button type="button" className="link-button" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      )}
      <SummaryCards />
      <div className="tabs" role="tablist" aria-label="Tracker">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tracker-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="tracker-panel"
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => select(t.id)}
          >
            {t.label}
            {t.id === "review" && reviewCount > 0 && ` (${reviewCount})`}
          </button>
        ))}
      </div>
      <section id="tracker-panel" role="tabpanel" aria-labelledby={`tracker-tab-${tab}`}>
        {tab === "applications" && <ApplicationsView />}
        {tab === "review" && <ReviewInbox onOpenGmail={() => select("gmail")} />}
        {tab === "gmail" && <GmailPanel />}
      </section>
    </div>
  );
}
