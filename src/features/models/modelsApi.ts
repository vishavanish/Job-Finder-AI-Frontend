/** User side of the AI model registry, own keys, usage and job sources (backend P2). */
import { api } from "../../lib/api/client";
import type {
  KeyList,
  KeyOut,
  ModelCatalog,
  ProviderSettings,
  ProviderSettingsIn,
  UsageSummary,
} from "../../lib/api/types";

export const getModels = () => api.get<ModelCatalog>("/models");

export const setModelPreferences = (preferences: Record<string, string | null>) =>
  api.put<ModelCatalog>("/models/preferences", { preferences });

export const listMyKeys = () => api.get<KeyList>("/keys");

export const addMyKey = (scope: string, key: string, label?: string) =>
  api.post<KeyOut>("/keys", { scope, key, label: label || null });

export const deleteMyKey = (id: string) => api.delete<void>(`/keys/${encodeURIComponent(id)}`);

export const getMyUsage = (days = 30) => api.get<UsageSummary>("/usage", { params: { days } });

export const getProviders = () => api.get<ProviderSettings>("/providers");

export const updateProviderSettings = (body: ProviderSettingsIn) =>
  api.put<ProviderSettings>("/providers/settings", body);
