/** Small pieces shared by the Interview prep screens. */
import { NavLink, useLocation } from "react-router-dom";
import type { ProgressArea, VoiceProviders } from "../../lib/api/types";
import { useEntitlement } from "../../lib/auth/access";

/** Tabs: Practice · Live Copilot · History · Story bank. */
export function InterviewNav() {
  const copilot = useEntitlement("live_copilot");
  const { pathname } = useLocation();
  // A practice session and any report belong to the Practice tab.
  const practice =
    pathname === "/interview" || /^\/interview\/(practice|sessions)\//.test(pathname);
  const tabs = [
    { to: "/interview", label: "Practice", end: true },
    { to: "/interview/copilot", label: "Live Copilot", off: !copilot.allowed },
    { to: "/interview/history", label: "History" },
    { to: "/interview/stories", label: "Story bank" },
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
          {t.label}
          {t.off && <span className="iv-tab-off"> · off</span>}
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
    return <p className="iv-provider warn">{providers.reason ?? "Voice isn't set up yet."}</p>;
  }
  return (
    <p className="iv-provider">
      {free ? "Free mode" : "Voice"}: {providers.stt?.name ?? "no speech-to-text"}
      {copilot ? "" : ` · ${providers.tts.name}`} · {copilot ? "answers appear" : "replies"} in
      about {seconds} s
      {copilot && !providers.streaming_stt && " (add a Deepgram key for under 1 s)"}.
    </p>
  );
}

/** Scores per skill area as plain SVG bars with the latest-sessions trend (no chart library). */
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
            <span className="num">{a.average.toFixed(1)}/5</span>
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
