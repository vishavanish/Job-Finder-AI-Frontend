/** Admin console: AI models, platform keys, job sources, usage (backend routes/admin_ai.py). */
import { api } from "../../lib/api/client";
import type {
  AdminModel,
  AdminModelCreate,
  AdminModelUpdate,
  AdminSource,
  AdminSourceUpdate,
  KeyOut,
  ModelTestResult,
  PlatformKeyList,
  TaskDefaults,
  UsageSummary,
} from "../../lib/api/types";

const id = (v: string) => encodeURIComponent(v);

export const listAdminModels = () => api.get<AdminModel[]>("/admin/models");
export const createAdminModel = (body: AdminModelCreate) =>
  api.post<AdminModel>("/admin/models", body);
export const updateAdminModel = (modelId: string, body: AdminModelUpdate) =>
  api.patch<AdminModel>(`/admin/models/${id(modelId)}`, body);
export const deleteAdminModel = (modelId: string) =>
  api.delete<void>(`/admin/models/${id(modelId)}`);
export const testAdminModel = (modelId: string) =>
  api.post<ModelTestResult>(`/admin/models/${id(modelId)}/test`);

export const getModelDefaults = () => api.get<TaskDefaults>("/admin/models/defaults");
export const setModelDefaults = (defaults: Record<string, string | null>) =>
  api.put<TaskDefaults>("/admin/models/defaults", { defaults });

export const listPlatformKeys = () => api.get<PlatformKeyList>("/admin/keys");
export const setPlatformKey = (scope: string, key: string, label?: string) =>
  api.post<KeyOut>("/admin/keys", { scope, key, label: label || null });
export const deletePlatformKey = (keyId: string) => api.delete<void>(`/admin/keys/${id(keyId)}`);

export const listAdminSources = () => api.get<AdminSource[]>("/admin/providers");
export const updateAdminSource = (key: string, body: AdminSourceUpdate) =>
  api.patch<AdminSource>(`/admin/providers/${id(key)}`, body);

export const getAllUsage = (days = 30) =>
  api.get<UsageSummary>("/admin/usage", { params: { days } });
export const getUserUsage = (userId: string, days = 30) =>
  api.get<UsageSummary>(`/admin/users/${id(userId)}/usage`, { params: { days } });
