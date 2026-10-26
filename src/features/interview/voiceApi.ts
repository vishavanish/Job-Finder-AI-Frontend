/** Voice interview prep calls (backend P7): providers, settings, sessions, feedback, history, story bank. */
import type { IconName } from "../../components/Icon";
import { api } from "../../lib/api/client";
import type {
  Story,
  StoryIn,
  StoryList,
  TaskQueued,
  TaskResponse,
  VoiceFeedback,
  VoiceHealth,
  VoiceHistory,
  VoiceProgress,
  VoiceProviders,
  VoiceSessionCreate,
  VoiceSessionCreated,
  VoiceSessionDetail,
  VoiceSettings,
  VoiceSettingsIn,
  VoiceStreamToken,
} from "../../lib/api/types";

const enc = encodeURIComponent;

export const voiceKeys = {
  all: ["voice"] as const,
  providers: ["voice", "providers"] as const,
  settings: ["voice", "settings"] as const,
  history: (mode: string) => ["voice", "history", mode] as const,
  progress: ["voice", "progress"] as const,
  session: (id: string) => ["voice", "session", id] as const,
  feedback: (id: string) => ["voice", "feedback", id] as const,
  stories: ["voice", "stories"] as const,
  health: (days: number) => ["voice", "admin", "health", days] as const,
};

export const getVoiceProviders = () => api.get<VoiceProviders>("/voice/providers");
export const getVoiceSettings = () => api.get<VoiceSettings>("/voice/settings");
export const putVoiceSettings = (body: VoiceSettingsIn) =>
  api.put<VoiceSettings>("/voice/settings", body);
export const acknowledgeCopilot = (version: string) =>
  api.post<VoiceSettings>("/voice/copilot/acknowledge", { version });

export const createVoiceSession = (body: Partial<VoiceSessionCreate>) =>
  api.post<VoiceSessionCreated>("/voice/sessions", body);
export const refreshStreamToken = (id: string) =>
  api.post<VoiceStreamToken>(`/voice/sessions/${enc(id)}/token`);
export const getVoiceSession = (id: string) =>
  api.get<VoiceSessionDetail>(`/voice/sessions/${enc(id)}`);
export const getVoiceFeedback = (id: string) =>
  api.get<VoiceFeedback>(`/voice/sessions/${enc(id)}/feedback`);
export const retryVoiceFeedback = (id: string) =>
  api.post<VoiceFeedback>(`/voice/sessions/${enc(id)}/feedback/retry`);
export const getVoiceHistory = (mode: string, limit = 20, offset = 0) =>
  api.get<VoiceHistory>("/voice/history", { params: { mode: mode || undefined, limit, offset } });
export const getVoiceProgress = () => api.get<VoiceProgress>("/voice/progress");
export const deleteVoiceSession = (id: string) => api.delete<void>(`/voice/sessions/${enc(id)}`);
export const deleteVoiceHistory = () => api.delete<{ deleted: number }>("/voice/history");

export const listStories = () => api.get<StoryList>("/story-bank");
export const createStory = (body: StoryIn) => api.post<Story>("/story-bank", body);
export const updateStory = (id: string, body: StoryIn) =>
  api.put<Story>(`/story-bank/${enc(id)}`, body);
export const deleteStory = (id: string) => api.delete<void>(`/story-bank/${enc(id)}`);
export const approveStory = (id: string) => api.post<Story>(`/story-bank/${enc(id)}/approve`);
export const draftStories = () => api.post<TaskQueued>("/story-bank/draft-from-resume");
export const getTask = (id: string) => api.get<TaskResponse>(`/tasks/${enc(id)}`);

export const getVoiceHealth = (days: number) =>
  api.get<VoiceHealth>("/admin/voice/health", { params: { days } });

export const INTERVIEW_TYPES: {
  value: VoiceSessionCreate["interview_type"];
  label: string;
  hint: string;
}[] = [
  {
    value: "behavioral",
    label: "Behavioral (STAR)",
    hint: "Past situations, answered with the STAR method.",
  },
  {
    value: "technical",
    label: "Technical Q&A",
    hint: "Questions on your stack and the role's skills.",
  },
  { value: "system_design", label: "System design", hint: "One design problem, step by step." },
  {
    value: "role_specific",
    label: "Role-specific",
    hint: "Built from the job description and your resume.",
  },
  { value: "rapid_fire", label: "Rapid-fire", hint: "Short questions, one after another." },
  {
    value: "resume_walkthrough",
    label: "Walk me through your resume",
    hint: "Questions about your own experience.",
  },
];

/** Icon per interview type (Practice) or "copilot". */
export const TYPE_ICONS: Record<string, IconName> = {
  behavioral: "message",
  technical: "code",
  system_design: "network",
  role_specific: "briefcase",
  rapid_fire: "zap",
  resume_walkthrough: "fileText",
  copilot: "sparkle",
};

export const typeIcon = (t: string): IconName => TYPE_ICONS[t] ?? "mic";

export const typeLabel = (t: string) =>
  INTERVIEW_TYPES.find((x) => x.value === t)?.label ?? t.replace(/_/g, " ");

export const QTYPE_LABELS: Record<string, string> = {
  intro: "Intro",
  behavioral: "Behavioral",
  technical: "Technical",
  coding: "Coding",
  system_design: "System design",
  hr: "HR",
  situational: "Situational",
  general: "Question",
};

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

export const END_REASONS: Record<string, string> = {
  user: "Ended by you",
  length: "Finished",
  max_minutes: "Time limit reached",
  cost_cap: "Cost limit reached",
  idle: "Ended after silence",
  disconnected: "Connection lost",
};
