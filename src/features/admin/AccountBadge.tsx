import { Icon } from "../../components/Icon";

/** Account state as icon + text (never color alone). */
export function AccountBadge({ active }: { active: boolean }) {
  return (
    <span className="status-badge" data-group={active ? "positive" : "negative"}>
      <Icon name={active ? "check" : "cross"} size={14} className="status-badge-icon" />
      {active ? "Active" : "Disabled"}
    </span>
  );
}
