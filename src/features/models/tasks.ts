/** Task types the AI router serves (backend ai_router.TASKS), in plain words. */
export const TASK_LABELS: Record<string, string> = {
  score: "Job scoring",
  resume_parse: "Reading resumes",
  resume_tailor: "Tailoring resumes",
  cover_letter: "Cover letters",
  form_answer: "Application form answers",
  email_classify: "Reading job emails",
  interview_chat: "Interview practice",
  interview_eval: "Interview feedback",
  title_suggest: "Job title suggestions",
  copilot_answer: "Live Copilot answers",
  copilot_expand: "Live Copilot: expand and hard questions",
  question_gate: "Question detection",
  stt: "Speech to text",
  tts: "Interview voice",
};

/** Tasks the app runs today (backend P2–P7). */
export const TASKS_IN_USE = new Set(Object.keys(TASK_LABELS));

/** Speech tasks are served only by models that name them (backend ai_router.SPEECH_TASKS). */
export const SPEECH_TASKS = new Set(["stt", "tts"]);
const SPEECH_ONLY_PROVIDERS = new Set(["browser", "deepgram"]);

export function taskLabel(task: string): string {
  return TASK_LABELS[task] ?? task.replace(/_/g, " ");
}

/** Mirrors the backend: `tasks == []` means every TEXT task; speech needs an explicit entry. */
export function servesTask(tasks: string[], task: string, provider?: string): boolean {
  if (SPEECH_TASKS.has(task)) return tasks.includes(task);
  if (provider && SPEECH_ONLY_PROVIDERS.has(provider)) return false;
  const text = tasks.filter((t) => !SPEECH_TASKS.has(t));
  if (tasks.length > 0 && text.length === 0) return false;
  return text.length === 0 || text.includes(task);
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  huggingface: "Hugging Face",
  anthropic: "Anthropic",
  openai_compatible: "OpenAI-compatible",
  browser: "Browser (speech)",
  deepgram: "Deepgram",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

const SCOPE_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  huggingface: "Hugging Face",
  anthropic: "Anthropic",
  apify: "Apify",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  deepgram: "Deepgram",
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}
