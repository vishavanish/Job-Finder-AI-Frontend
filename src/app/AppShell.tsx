import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { useAuth } from "../context/AuthContext";
import { ActivityTray } from "./ActivityTray";
import { NAV_GROUPS, currentNavItem } from "./nav";
import { useTheme, type ThemePref } from "./theme";
import { useFocusTrap } from "./useFocusTrap";

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON: Record<ThemePref, IconName> = { system: "monitor", light: "sun", dark: "moon" };
const THEME_NAME: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

function initials(name?: string | null, email?: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "?";
  const second = parts[1];
  return (second ? first.charAt(0) + second.charAt(0) : source.slice(0, 2)).toUpperCase();
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="sidebar-inner">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">
          JF
        </span>
        <span className="brand-name">Job Finder</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label" id={`nav-${group.label}`}>
              {group.label}
            </p>
            <ul aria-labelledby={`nav-${group.label}`}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => "nav-item" + (isActive ? " is-active" : "")}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <NavLink
          to="/profile"
          className={({ isActive }) => "sidebar-account" + (isActive ? " is-active" : "")}
          onClick={onNavigate}
        >
          <span className="avatar" aria-hidden="true">
            {initials(user?.name, user?.email)}
          </span>
          <span className="sidebar-account-text">
            <span className="sidebar-account-name">{user?.name || "Profile"}</span>
            <span className="sidebar-account-email">{user?.email}</span>
          </span>
        </NavLink>
        <button type="button" className="sidebar-signout" onClick={handleSignOut}>
          <Icon name="signOut" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const { pref, setPref } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const current = currentNavItem(location.pathname);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);

  // Move focus to the content on navigation so keyboard and screen-reader
  // users start at the new page, not in the sidebar.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  useEffect(() => {
    document.title = current ? `${current.label} · Job Finder` : "Job Finder";
  }, [current]);

  const nextTheme = NEXT_THEME[pref];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Sidebar">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="drawer-layer">
          <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />
          <div
            ref={drawerRef}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button type="button" className="drawer-close" onClick={closeDrawer}>
              <Icon name="close" label="Close navigation" />
            </button>
            <Sidebar onNavigate={closeDrawer} />
          </div>
        </div>
      )}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="topbar-button topbar-menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" label="Open navigation" />
          </button>

          <p className="topbar-location">
            {current ? (
              <>
                <span className="topbar-location-group">{current.group}</span>
                <span aria-hidden="true" className="topbar-location-sep">
                  /
                </span>
                <span className="topbar-location-page">{current.label}</span>
              </>
            ) : (
              <span className="topbar-location-page">Job Finder</span>
            )}
          </p>

          <div className="topbar-actions">
            <ActivityTray />
            <button
              type="button"
              className="topbar-button"
              onClick={() => setPref(nextTheme)}
              aria-label={`Theme: ${THEME_NAME[pref]}. Switch to ${THEME_NAME[nextTheme]}`}
              title={`Theme: ${THEME_NAME[pref]}`}
            >
              <Icon name={THEME_ICON[pref]} />
            </button>
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
