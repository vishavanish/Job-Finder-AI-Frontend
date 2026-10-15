import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SettingsProvider } from "../context/SettingsContext.jsx";
import { RunProvider } from "../context/RunContext.jsx";
import { ActivityProvider } from "./activity";
import { ThemeProvider } from "./theme";
import AppShell from "./AppShell";
import { RequireFeature, RequireRole } from "./guards";

import SignInPage from "../features/auth/SignInPage";
import UsersPage from "../features/admin/UsersPage";
import UserDetailPage from "../features/admin/UserDetailPage";
import FeatureDefaultsPage from "../features/admin/FeatureDefaultsPage";
import AdminModelsPage from "../features/admin/AdminModelsPage";
import AdminKeysPage from "../features/admin/AdminKeysPage";
import AdminSourcesPage from "../features/admin/AdminSourcesPage";
import AdminUsagePage from "../features/admin/AdminUsagePage";
import AiModelsPage from "../features/models/AiModelsPage";
import ApiKeysPage from "../features/models/ApiKeysPage";
import HomePage from "../pages/HomePage.jsx";
import KeywordsPage from "../pages/KeywordsPage.jsx";
import SkillsPage from "../pages/SkillsPage.jsx";
import AtsTargetsPage from "../pages/AtsTargetsPage.jsx";
import ProvidersPage from "../features/providers/ProvidersPage";
import ProfilePage from "../pages/ProfilePage.jsx";
import ApplicationsPage from "../pages/ApplicationsPage.jsx";

const ADMIN_ROLES = ["admin", "manager"] as const;
const ADMIN_ONLY = ["admin"] as const;

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
      <Route path="/login" element={<SignInPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <RequireFeature feature="job_search">
              <HomePage />
            </RequireFeature>
          }
        />
        <Route path="keywords" element={<KeywordsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route
          path="ats-targets"
          element={
            <RequireFeature feature="ats_discovery">
              <AtsTargetsPage />
            </RequireFeature>
          }
        />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings/ai" element={<AiModelsPage />} />
        <Route path="settings/keys" element={<ApiKeysPage />} />
        <Route
          path="admin/users"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/users/:userId"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <UserDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/models"
          element={
            <RequireRole roles={ADMIN_ONLY}>
              <AdminModelsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/keys"
          element={
            <RequireRole roles={ADMIN_ONLY}>
              <AdminKeysPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/sources"
          element={
            <RequireRole roles={ADMIN_ONLY}>
              <AdminSourcesPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/usage"
          element={
            <RequireRole roles={ADMIN_ONLY}>
              <AdminUsagePage />
            </RequireRole>
          }
        />
        <Route
          path="admin/features"
          element={
            <RequireRole roles={ADMIN_ROLES}>
              <FeatureDefaultsPage />
            </RequireRole>
          }
        />
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
