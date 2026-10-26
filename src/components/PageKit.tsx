/**
 * Page building blocks shared by the restyled screens (Dashboard, Interview
 * prep): page header with eyebrow and chips, card head with an icon tile,
 * stat chips, action rows, segmented pills and empty states. Styles live in
 * styles/kit.css.
 */
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export type KitTone = "accent" | "attention" | "positive" | "progress" | "muted";

export function PageHeader({
  eyebrow,
  title,
  sub,
  children,
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Right side: chips and actions. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-header kit-header ${className}`.trim()}>
      <div>
        <span className="kit-eyebrow">
          <span className="kit-dot" aria-hidden="true" />
          {eyebrow}
        </span>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="kit-chips">{children}</div>}
    </div>
  );
}

export function StatChip({
  dot,
  icon,
  children,
}: {
  dot?: "positive" | "negative" | "accent";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className="kit-chip">
      {dot && <span className={`kit-dot kit-dot--${dot}`} aria-hidden="true" />}
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function IconTile({
  icon,
  tone = "accent",
  size = "md",
}: {
  icon: IconName;
  tone?: KitTone;
  size?: "md" | "lg";
}) {
  return (
    <span className={`kit-icon kit-icon--${tone} kit-icon--${size}`} aria-hidden="true">
      <Icon name={icon} size={size === "lg" ? 20 : 16} />
    </span>
  );
}

export function CardHead({
  icon,
  tone = "accent",
  id,
  title,
  sub,
  children,
}: {
  icon: IconName;
  tone?: KitTone;
  id?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="kit-card-head">
      <IconTile icon={icon} tone={tone} />
      <div className="kit-card-title">
        <h3 id={id}>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function ActionRow({
  to,
  n,
  title,
  sub,
}: {
  to: string;
  n: number;
  title: string;
  sub: string;
}) {
  const subId = useId();
  return (
    <Link
      to={to}
      className={"kit-action" + (n > 0 ? " is-hot" : "")}
      aria-label={title}
      aria-describedby={subId}
    >
      <span className="kit-action-count num" aria-hidden="true">
        {n}
      </span>
      <span className="kit-action-text">
        <span className="kit-action-title">{title}</span>
        <span className="kit-action-sub" id={subId}>
          {sub}
        </span>
      </span>
      <Icon name="arrowRight" size={16} />
    </Link>
  );
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: IconName;
}

/**
 * A pill group. "radio" renders real radio inputs (a form value, named by
 * `label`); "toggle" renders buttons with aria-pressed (a view filter).
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  mode = "radio",
  name,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  mode?: "radio" | "toggle";
  name?: string;
}) {
  const auto = useId();
  if (mode === "toggle") {
    return (
      <div className="kit-segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="kit-segment"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <Icon name={o.icon} size={14} />}
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="kit-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={String(o.value)} className={`kit-segment${value === o.value ? " is-on" : ""}`}>
          <input
            type="radio"
            className="sr-only"
            name={name ?? auto}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="kit-empty">
      <IconTile icon={icon} size="lg" />
      <p className="kit-empty-title">{title}</p>
      {children}
    </div>
  );
}
