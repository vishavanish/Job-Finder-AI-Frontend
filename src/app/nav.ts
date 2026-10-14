import type { IconName } from "../components/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Today's routes. F1–F7 add Dashboard, Jobs, Apply Center, Tracker, Interview,
 * Settings and Admin here (spec §6); older paths will redirect to the new ones.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Run and results", icon: "play", end: true },
      { to: "/applications", label: "Applications", icon: "inbox" },
    ],
  },
  {
    label: "Search setup",
    items: [
      { to: "/keywords", label: "Keywords", icon: "search" },
      { to: "/skills", label: "Skills and resume", icon: "layers" },
      { to: "/ats-targets", label: "ATS targets", icon: "building" },
      { to: "/providers", label: "Providers", icon: "globe" },
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
