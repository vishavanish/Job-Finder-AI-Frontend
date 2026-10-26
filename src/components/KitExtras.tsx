/**
 * More page-kit pieces (F4.1, first used by the Apply Center): a state pill
 * with a dot, the "AI" sparkle chip, a soft glass hero card, a small
 * progress ring, a page journey stepper with thumbnails, a screenshot
 * lightbox and a short confetti burst. Styles live in styles/kit.css; all
 * motion stops under prefers-reduced-motion.
 */
import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { statusGroup, statusLabel } from "./status";

/** A run/application state as a pastel pill with a dot (pulses when it needs you, shimmers while working). */
export function StatePill({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string;
}) {
  const group = statusGroup(status);
  return (
    <span className="kit-state" data-group={group}>
      <span className="kit-state-dot" aria-hidden="true">
        {(group === "progress" || group === "positive") && <Icon name="check" size={10} />}
      </span>
      {label ?? statusLabel(status)}
    </span>
  );
}

/** Marks what the AI form reader did — used for nothing else, so it stays meaningful. */
export function SparkleChip({
  children = "AI form reader",
  beta = true,
}: {
  children?: ReactNode;
  beta?: boolean;
}) {
  return (
    <span className="kit-sparkle">
      <Icon name="sparkle" size={13} />
      {children}
      {beta && <span className="kit-beta">beta</span>}
    </span>
  );
}

/** Frosted card on a faint plum→indigo mesh; a plain card where blur isn't supported or on phones. */
export function GlassHero({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`kit-glass-wrap ${className}`.trim()}>
      <div className="kit-glass">{children}</div>
    </div>
  );
}

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

/** "used of max" as a small ring; the text carries the meaning, never the colour alone. */
export function ProgressRing({ used, max, label }: { used: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, used / max) : 0;
  const tone = share >= 1 ? "full" : share >= 0.8 ? "high" : "ok";
  return (
    <div className="kit-ring" data-tone={tone}>
      <span
        className="kit-ring-svg"
        role="img"
        aria-label={`${label}: ${used} of ${max} used today`}
      >
        <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="kit-ring-track" cx="20" cy="20" r={RING_R} />
          <circle
            className="kit-ring-value"
            cx="20"
            cy="20"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - share)}
          />
        </svg>
        <span className="kit-ring-num num">{used}</span>
      </span>
      <span className="kit-ring-text">
        <span className="kit-ring-label">{label}</span>
        <span className="kit-ring-sub num">of {max} today</span>
      </span>
    </div>
  );
}

export interface JourneyNode {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
  /** Screenshot of this page (an object URL), when there is one. */
  thumb?: string;
  onOpen?: () => void;
}

/** "Page 1 → 2 → 3 → Submit" with a thumbnail per page; the line draws as pages are read. */
export function PageJourney({ nodes, label }: { nodes: JourneyNode[]; label: string }) {
  return (
    <ol className="kit-journey" aria-label={label}>
      {nodes.map((n, i) => (
        <li
          key={n.key}
          className={`kit-journey-node is-${n.state}`}
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {n.thumb && n.onOpen ? (
            <button
              type="button"
              className="kit-journey-thumb"
              onClick={n.onOpen}
              aria-label={`Open ${n.label} screenshot`}
            >
              <img src={n.thumb} alt="" />
            </button>
          ) : (
            <span className="kit-journey-thumb is-empty" aria-hidden="true">
              <Icon
                name={n.state === "current" ? "spinner" : n.state === "done" ? "check" : "send"}
                size={18}
              />
            </span>
          )}
          <span className="kit-journey-label">
            <span className="kit-journey-dot" aria-hidden="true">
              {n.state === "done" && <Icon name="check" size={10} />}
            </span>
            {n.label}
            <span className="sr-only">
              {n.state === "done"
                ? " — read"
                : n.state === "current"
                  ? " — reading now"
                  : " — not yet"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A screenshot shown large, in the shared Dialog (focus trap, Escape closes). */
export function Lightbox({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog title={alt} onClose={onClose} wide>
      <figure className="kit-lightbox">
        <img src={src} alt={alt} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    </Dialog>
  );
}

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);

/** About one second of CSS confetti over the parent (position: relative). Decorative only. */
export function Confetti() {
  return (
    <span className="kit-confetti" aria-hidden="true">
      {CONFETTI.map((i) => (
        <span
          key={i}
          style={{
            left: `${5 + ((i * 53) % 90)}%`,
            animationDelay: `${(i % 6) * 45}ms`,
            ["--kit-drift" as string]: `${((i * 37) % 60) - 30}px`,
            ["--kit-spin" as string]: `${(i * 97) % 360}deg`,
          }}
        />
      ))}
    </span>
  );
}
