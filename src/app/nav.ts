import type { IconName } from "../components/Icon";
import type { Role } from "../lib/auth/access";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Entitlement the page needs; the item shows "Off" with the reason when it's missing. */
  feature?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Only these roles see the group. */
  roles?: readonly Role[];
}

/**
 * Today's routes. F2–F7 add Dashboard, Jobs, Apply Center, Tracker, Interview,
 * Settings and more Admin pages here (spec §6); older paths will redirect to the new ones.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Run and results", icon: "play", end: true, feature: "job_search" },
      { to: "/applications", label: "Applications", icon: "inbox" },
    ],
  },
  {
    label: "Search setup",
    items: [
      { to: "/keywords", label: "Keywords", icon: "search" },
      { to: "/skills", label: "Skills and resume", icon: "layers" },
      { to: "/ats-targets", label: "ATS targets", icon: "building", feature: "ats_discovery" },
      { to: "/providers", label: "Providers", icon: "globe" },
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
];

const ALL: (NavItem & { group: string })[] = [
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))),
  { to: "/profile", label: "Profile", icon: "user", group: "Account" },
];

export function currentNavItem(pathname: string): (NavItem & { group: string }) | undefined {
  return ALL.find((i) => (i.end || i.to === "/" ? pathname === i.to : pathname.startsWith(i.to)));
}
