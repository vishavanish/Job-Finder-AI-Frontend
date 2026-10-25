/** Small pieces shared by the Interview prep screens. */
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { Icon, type IconName } from "../../components/Icon";
import type { ProgressArea, VoiceProviders } from "../../lib/api/types";
import { useEntitlement } from "../../lib/auth/access";
import { getVoiceHistory, listStories, voiceKeys } from "./voiceApi";

/** Tabs: Practice · Live Copilot · History · Story bank, as Jobs-style pills with counts. */
export function InterviewNav() {
  const copilot = useEntitlement("live_copilot");
  const { pathname } = useLocation();
  const history = useQuery({
    queryKey: [...voiceKeys.all, "history-count"],
    queryFn: () => getVoiceHistory("", 1),
    staleTime: 30_000,
  });
  const stories = useQuery({
    queryKey: voiceKeys.stories,
    queryFn: listStories,
    staleTime: 30_000,
  });
  const drafts = (stories.data?.stories ?? []).filter((s) => !s.approved).length;
  // A practice session and any report belong to the Practice tab.
  const practice =
    pathname === "/interview" || /^\/interview\/(practice|sessions)\//.test(pathname);
  const tabs: {
    to: string;
    label: string;
    icon: IconName;
    end?: boolean;
    off?: boolean;
    count?: number;
    hot?: boolean;
  }[] = [
    { to: "/interview", label: "Practice", icon: "mic", end: true },
    { to: "/interview/copilot", label: "Live Copilot", icon: "sparkle", off: !copilot.allowed },
    { to: "/interview/history", label: "History", icon: "history", count: history.data?.total },
    { to: "/interview/stories", label: "Story bank", icon: "book", count: drafts, hot: drafts > 0 },
  ];
  return (
    <nav className="iv-tabs" aria-label="Interview prep">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `iv-tab${(t.to === "/interview" ? practice : isActive) ? " active" : ""}`
          }
        >
          <Icon name={t.icon} size={15} />
          {t.label}
          {t.off && (
            <span className="iv-tab-off">
              <Icon name="lock" size={12} />
              <span className="sr-only"> off</span>
            </span>
          )}
          {t.count ? (
            <span className={`iv-tab-count num${t.hot ? " is-hot" : ""}`}>
              {t.count}
              {t.hot && <span className="sr-only"> to review</span>}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

/** A 0–1 level as a meter the screen reader can read. */
export function LevelMeter({ label, level }: { label: string; level: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  return (
    <div className="iv-meter">
      <Icon name="mic" size={14} />
      <span className="iv-meter-label">{label}</span>
      <div
        className="iv-meter-track"
        role="meter"
        aria-label={`${label} level`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="iv-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Free mode: browser voice, replies in about 1.5 s" — honest about what's running. */
export function ProviderLine({
  providers,
  copilot,
}: {
  providers?: VoiceProviders;
  copilot?: boolean;
}) {
  if (!providers) return null;
  const seconds = (providers.expected_first_word_ms / 1000).toFixed(1);
  const free = providers.stt?.tier !== "paid" && providers.tts.tier !== "paid";
  if (!providers.ready) {
    return (
      <p className="iv-provider warn">
        <span className="kit-dot kit-dot--negative" aria-hidden="true" />
        {providers.reason ?? "Voice isn't set up yet."}
      </p>
    );
  }
  return (
    <p className="iv-provider">
      <span className="kit-dot kit-dot--positive" aria-hidden="true" />
      <span>
        {free ? "Free mode" : "Voice"}: {providers.stt?.name ?? "no speech-to-text"}
        {copilot ? "" : ` · ${providers.tts.name}`} · {copilot ? "answers appear" : "replies"} in
        about {seconds} s
        {copilot && !providers.streaming_stt && " (add a Deepgram key for under 1 s)"}.
      </span>
    </p>
  );
}

function band(score: number): "high" | "mid" | "low" {
  if (score >= 4) return "high";
  if (score >= 3) return "mid";
  return "low";
}

/** A 1–5 score as a ring with the number inside. */
export function ScoreDial({
  score,
  size = 88,
  label = "Average score",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(5, score));
  return (
    <span
      className={`iv-dial band-${band(v)}`}
      role="img"
      aria-label={`${label} ${v.toFixed(1)} out of 5`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <linearGradient id="iv-dial-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#5b5bd6" />
          </linearGradient>
        </defs>
        <circle className="iv-dial-track" cx="48" cy="48" r={r} />
        <circle
          className="iv-dial-value"
          cx="48"
          cy="48"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 5)}
        />
      </svg>
      <span className="iv-dial-number">
        <strong className="num">{v.toFixed(1)}</strong>
        <small>/5</small>
      </span>
    </span>
  );
}

/** A score pill coloured by band; the number carries the meaning. */
export function ScorePill({ score }: { score: number }) {
  return <span className={`iv-score-pill band-${band(score)} num`}>{score.toFixed(1)}/5</span>;
}

/** Scores per skill area as gradient bars with the latest-sessions trend (no chart library). */
export function ProgressChart({ areas }: { areas: ProgressArea[] }) {
  if (!areas.length)
    return <p className="field-hint">Finish a practice session to see your progress here.</p>;
  return (
    <ul className="iv-progress">
      {areas.map((a) => {
        const trend = a.trend.slice(-8);
        const points = trend
          .map(
            (p, i) =>
              `${trend.length === 1 ? 50 : (i / (trend.length - 1)) * 100},${30 - ((p.score - 1) / 4) * 28}`,
          )
          .join(" ");
        return (
          <li key={a.skill_area}>
            <span className="iv-progress-name">{a.skill_area}</span>
            <span className="iv-progress-bar" aria-hidden="true">
              <span style={{ width: `${(a.average / 5) * 100}%` }} />
            </span>
            <span className="num iv-progress-num">{a.average.toFixed(1)}/5</span>
            <svg
              className="iv-spark"
              viewBox="0 0 100 32"
              role="img"
              aria-label={`${a.skill_area}: last ${trend.length} sessions`}
            >
              {trend.length === 1 ? (
                <circle
                  cx="50"
                  cy={30 - ((trend[0]!.score - 1) / 4) * 28}
                  r="3"
                  fill="currentColor"
                />
              ) : (
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
              )}
            </svg>
          </li>
        );
      })}
    </ul>
  );
}

export function ScoreBars({ scores }: { scores: Record<string, unknown> }) {
  const rows = Object.entries(scores).filter(
    (e): e is [string, number] => typeof e[1] === "number",
  );
  if (!rows.length) return null;
  return (
    <dl className="iv-scores">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            <span className="iv-progress-bar" aria-hidden="true">
              <span style={{ width: `${(v / 5) * 100}%` }} />
            </span>
            <span className="num">{v}/5</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
