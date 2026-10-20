/** Sign-in endpoints (backend Phase 1, CLAUDE.md §7.1). */
import { api } from "../../lib/api/client";
import type { Me, MessageResponse, TokenResponse } from "../../lib/api/types";

export const requestOtp = (email: string) =>
  api.post<MessageResponse>("/auth/otp/request", { email });

export const verifyOtp = (email: string, code: string) =>
  api.post<TokenResponse>("/auth/otp/verify", { email, code });

export const signInWithGoogle = (idToken: string) =>
  api.post<TokenResponse>("/auth/google", { id_token: idToken });

export const fetchMe = () => api.get<Me>("/auth/me");
