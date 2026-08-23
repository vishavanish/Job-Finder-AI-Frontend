import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/", label: "Run & Results", icon: "▶", end: true },
  { to: "/applications", label: "Applications", icon: "📄" },
  { to: "/keywords", label: "Keywords", icon: "🔍" },
  { to: "/skills", label: "Skills & Resume", icon: "🧩" },
  { to: "/ats-targets", label: "ATS Targets", icon: "🏢" },
  { to: "/providers", label: "Providers", icon: "🌐" },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-badge">JF</div>
          <div className="brand">Job Finder</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Pipeline</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/profile"
            className={({ isActive }) => "sidebar-profile nav-link" + (isActive ? " active" : "")}
            style={{ textDecoration: "none" }}
          >
            <div className="avatar">{initials}</div>
            <div className="profile-meta">
              <div className="name">{user?.name || "Profile"}</div>
              <div className="email">{user?.email}</div>
            </div>
          </NavLink>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
