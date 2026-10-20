/** Admin console endpoints (backend Phase 1, CLAUDE.md §7.11). */
import { api } from "../../lib/api/client";
import type {
  AdminUserCreate,
  AdminUserList,
  AdminUserUpdate,
  EntitlementOut,
  EntitlementUpdate,
  User,
} from "../../lib/api/types";

export interface UserQuery {
  q?: string;
  role?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export const listUsers = (query: UserQuery, signal?: AbortSignal) =>
  api.get<AdminUserList>("/admin/users", { params: { ...query }, signal });

export const getUser = (id: string) => api.get<User>(`/admin/users/${encodeURIComponent(id)}`);

export const createUser = (body: AdminUserCreate) => api.post<User>("/admin/users", body);

export const updateUser = (id: string, body: AdminUserUpdate) =>
  api.patch<User>(`/admin/users/${encodeURIComponent(id)}`, body);

export const setUserActive = (id: string, active: boolean) =>
  api.post<User>(`/admin/users/${encodeURIComponent(id)}/${active ? "enable" : "disable"}`);

export const revokeSessions = (id: string) =>
  api.post<void>(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`);

export const listFeatureDefaults = () => api.get<EntitlementOut[]>("/admin/features");

export const getUserEntitlements = (id: string) =>
  api.get<EntitlementOut[]>(`/admin/users/${encodeURIComponent(id)}/entitlements`);

export const setUserEntitlement = (id: string, feature: string, body: EntitlementUpdate) =>
  api.put<EntitlementOut>(
    `/admin/users/${encodeURIComponent(id)}/entitlements/${encodeURIComponent(feature)}`,
    body,
  );

export const resetUserEntitlement = (id: string, feature: string) =>
  api.delete<EntitlementOut>(
    `/admin/users/${encodeURIComponent(id)}/entitlements/${encodeURIComponent(feature)}`,
  );
