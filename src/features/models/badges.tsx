import { Icon, type IconName } from "../../components/Icon";
import { formatWhen } from "./format";

type Group = "neutral" | "attention" | "positive" | "negative" | "muted" | "progress";

function Badge({
  group,
  icon,
  children,
  title,
}: {
  group: Group;
  icon: IconName;
  children: string;
  title?: string;
}) {
  return (
    <span className="status-badge" data-group={group} title={title}>
      <Icon name={icon} size={14} className="status-badge-icon" />
      {children}
    </span>
  );
}

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  free_key: "Free key",
  paid: "Paid",
  byok: "Own key",
};

/** Free / Free key / Paid / Own key — text plus color, never color alone. */
export function TierBadge({ tier }: { tier: string }) {
  const paid = tier === "paid" || tier === "byok";
  return (
    <Badge group={paid ? "attention" : "neutral"} icon={paid ? "lock" : "circle"}>
      {TIER_LABEL[tier] ?? tier}
    </Badge>
  );
}

/** Health from last success / last error / circuit breaker. */
export function HealthBadge({
  lastSuccess,
  lastError,
  failures = 0,
  paused = false,
}: {
  lastSuccess?: string | null;
  lastError?: string | null;
  failures?: number;
  paused?: boolean;
}) {
  if (paused) {
    return (
      <Badge group="attention" icon="alert" title={lastError ?? undefined}>
        Paused after errors
      </Badge>
    );
  }
  if (failures > 0 && lastError) {
    return (
      <Badge group="negative" icon="cross" title={lastError}>
        Failing
      </Badge>
    );
  }
  if (lastSuccess) {
    return (
      <Badge group="positive" icon="check" title={`Last worked ${formatWhen(lastSuccess)}`}>
        Working
      </Badge>
    );
  }
  return (
    <Badge group="muted" icon="minus">
      Not used yet
    </Badge>
  );
}
