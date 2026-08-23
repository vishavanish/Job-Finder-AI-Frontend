import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
import { RunProvider } from "./context/RunContext.jsx";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardLayout from "./pages/DashboardLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import KeywordsPage from "./pages/KeywordsPage.jsx";
import SkillsPage from "./pages/SkillsPage.jsx";
import AtsTargetsPage from "./pages/AtsTargetsPage.jsx";
import ProvidersPage from "./pages/ProvidersPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardLayout />
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

export default function App() {
  return (
    <AuthProvider>
  <SettingsProvider>
    <RunProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </RunProvider>
  </SettingsProvider>
</AuthProvider>
  );
}
