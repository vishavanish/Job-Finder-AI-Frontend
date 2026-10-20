import { Icon } from "./Icon";
import { GROUP_ICON, statusGroup, statusLabel } from "./status";

/** Status shown as icon + text in the status palette — never color alone. */
export function StatusBadge({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string;
}) {
  const group = statusGroup(status);
  // Raw backend detail (e.g. "open_failed:TimeoutError ...") goes in the tooltip, not the badge.
  const title = status && status.includes(":") ? status : undefined;
  return (
    <span className="status-badge" data-group={group} title={title}>
      <Icon name={GROUP_ICON[group]} size={14} className="status-badge-icon" />
      {label ?? statusLabel(status)}
    </span>
  );
}
