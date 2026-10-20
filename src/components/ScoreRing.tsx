/**
 * The job-fit score (0–100) as a ring with the number inside (spec §6.3).
 * Colour bands come from the status palette; the number and the accessible
 * label carry the meaning, never the colour alone.
 */
const R = 18;
const C = 2 * Math.PI * R;

function scoreBand(score: number): "high" | "mid" | "low" {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

export function ScoreRing({
  score,
  size = 48,
}: {
  score: number | null | undefined;
  size?: number;
}) {
  if (score === null || score === undefined) {
    return (
      <span className="score-ring is-empty" role="img" aria-label="Not scored">
        –
      </span>
    );
  }
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const band = scoreBand(value);
  return (
    <span
      className={`score-ring band-${band}`}
      role="img"
      aria-label={`Fit score ${value} out of 100`}
    >
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
        <circle className="score-ring-track" cx="22" cy="22" r={R} />
        <circle
          className="score-ring-value"
          cx="22"
          cy="22"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - value / 100)}
        />
      </svg>
      <span className="score-ring-number">{value}</span>
    </span>
  );
}
