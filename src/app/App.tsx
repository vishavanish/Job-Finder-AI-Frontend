import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
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
import AtsTargetsPage from "../features/ats/AtsTargetsPage";
import AdminAtsPage from "../features/admin/AdminAtsPage";
import ProvidersPage from "../features/providers/ProvidersPage";
import JobsPage from "../features/jobs/JobsPage";
import ProfilePage from "../features/profile/ProfilePage";
import SearchProfilePage from "../features/search-profile/SearchProfilePage";
import AlertsPage from "../features/alerts/AlertsPage";
import ApplyCenterPage from "../features/apply/ApplyCenterPage";
import RunReviewPage from "../features/apply/RunReviewPage";
import DashboardPage from "../features/dashboard/DashboardPage";
import TrackerPage from "../features/tracker/TrackerPage";
import ApplicationDetailPage from "../features/tracker/ApplicationDetailPage";
import { QueryProvider } from "../lib/query";

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

/** The old Applications page lives on as the tracker; keep any filters in the query. */
function ToTracker() {
  const { search } = useLocation();
  return <Navigate to={`/tracker${search}`} replace />;
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
        {/* Old setup pages moved to /search-profile (F3); /applications became the tracker (F5). */}
        <Route index element={<DashboardPage />} />
        <Route
          path="jobs"
          element={
            <RequireFeature feature="job_search">
              <JobsPage />
            </RequireFeature>
          }
        />
        <Route path="apply" element={<ApplyCenterPage />} />
        <Route path="apply/runs/:runId" element={<RunReviewPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="search-profile" element={<SearchProfilePage />} />
        <Route path="keywords" element={<Navigate to="/search-profile" replace />} />
        <Route path="skills" element={<Navigate to="/search-profile" replace />} />
        <Route
          path="ats-targets"
          element={
            <RequireFeature feature="ats_discovery">
              <AtsTargetsPage />
            </RequireFeature>
          }
        />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="tracker/:id" element={<ApplicationDetailPage />} />
        <Route path="applications" element={<ToTracker />} />
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
          path="admin/ats"
          element={
            <RequireRole roles={ADMIN_ONLY}>
              <AdminAtsPage />
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
      <QueryProvider>
        <AuthProvider>
          <ActivityProvider>{children}</ActivityProvider>
        </AuthProvider>
      </QueryProvider>
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
