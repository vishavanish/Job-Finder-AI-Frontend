import type { IconName } from "../components/Icon";
import type { Role } from "../lib/auth/access";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Entitlement the page needs; the item shows "Off" with the reason when it's missing. */
  feature?: string;
  /** A live count shown next to the label. */
  badge?: "applyWaiting" | "trackerReview";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Only these roles see the group. */
  roles?: readonly Role[];
}

/**
 * Today's routes. Later phases add Settings and more Admin pages here
 * (spec §6); older paths redirect to the new ones (/applications → /tracker).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Dashboard", icon: "layers", end: true },
      { to: "/jobs", label: "Jobs", icon: "play", feature: "job_search" },
      { to: "/ats-targets", label: "Target companies", icon: "building", feature: "ats_discovery" },
      { to: "/apply", label: "Apply Center", icon: "check", badge: "applyWaiting" },
      { to: "/alerts", label: "Job alerts", icon: "activity", feature: "job_alerts" },
      { to: "/tracker", label: "Tracker", icon: "inbox", badge: "trackerReview" },
      { to: "/interview", label: "Interview prep", icon: "mic", feature: "voice_prep" },
    ],
  },
  {
    label: "Search setup",
    items: [
      { to: "/search-profile", label: "Keywords and skills", icon: "search" },
      { to: "/profile", label: "Profile and resume", icon: "user" },
      { to: "/providers", label: "Job sources", icon: "globe" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings/ai", label: "AI models", icon: "sparkle" },
      { to: "/settings/keys", label: "API keys", icon: "key" },
    ],
  },
  {
    label: "Admin",
    roles: ["admin", "manager"],
    items: [
      { to: "/admin/users", label: "Users", icon: "users" },
      { to: "/admin/features", label: "Feature defaults", icon: "sliders" },
    ],
  },
  {
    label: "AI & sources",
    roles: ["admin"],
    items: [
      { to: "/admin/models", label: "AI models", icon: "sparkle" },
      { to: "/admin/keys", label: "Platform keys", icon: "key" },
      { to: "/admin/sources", label: "Job sources", icon: "globe" },
      { to: "/admin/ats", label: "ATS registry", icon: "building" },
      { to: "/admin/voice", label: "Voice health", icon: "mic" },
      { to: "/admin/usage", label: "Usage", icon: "activity" },
    ],
  },
];

const ALL: (NavItem & { group: string })[] = [
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))),
];

export function currentNavItem(pathname: string): (NavItem & { group: string }) | undefined {
  return ALL.find((i) => (i.end || i.to === "/" ? pathname === i.to : pathname.startsWith(i.to)));
}
