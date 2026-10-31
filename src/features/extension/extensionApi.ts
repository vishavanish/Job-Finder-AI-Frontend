/** Browser extension "Job Finder capture" (backend P8a E1): pairing code, connections, disconnect. */
import { api } from "../../lib/api/client";

export interface PairCode {
  code: string;
  expires_in: number;
}

export interface ExtensionConnection {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ExtensionConnections {
  connections: ExtensionConnection[];
  saved_total: number;
  saved_today: number;
}

export const getPairCode = () => api.post<PairCode>("/extension/pair");

export const listConnections = () => api.get<ExtensionConnections>("/extension/connections");

export const disconnect = (id: string) =>
  api.delete<void>(`/extension/connections/${encodeURIComponent(id)}`);
