import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SettingsProvider } from "../context/SettingsContext.jsx";
import { RunProvider } from "../context/RunContext.jsx";
import { ActivityProvider } from "./activity";
import { ThemeProvider } from "./theme";
import AppShell from "./AppShell";

import LoginPage from "../pages/LoginPage.jsx";
import HomePage from "../pages/HomePage.jsx";
import KeywordsPage from "../pages/KeywordsPage.jsx";
import SkillsPage from "../pages/SkillsPage.jsx";
import AtsTargetsPage from "../pages/AtsTargetsPage.jsx";
import ProvidersPage from "../pages/ProvidersPage.jsx";
import ProfilePage from "../pages/ProfilePage.jsx";
import ApplicationsPage from "../pages/ApplicationsPage.jsx";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        Checking your session…
      </div>
    );
  }
  if (status === "signed_out") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="keywords" element={<KeywordsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="ats-targets" element={<AtsTargetsPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Everything except the router, so tests can wrap it in a MemoryRouter. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <ActivityProvider>
            <RunProvider>{children}</RunProvider>
          </ActivityProvider>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
