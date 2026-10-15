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
};

/** Tasks the app already runs. The rest arrive in later phases (P3–P7). */
export const TASKS_IN_USE = new Set(["score"]);

export function taskLabel(task: string): string {
  return TASK_LABELS[task] ?? task.replace(/_/g, " ");
}

export function servesTask(tasks: string[], task: string): boolean {
  return tasks.length === 0 || tasks.includes(task);
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  huggingface: "Hugging Face",
  anthropic: "Anthropic",
  openai_compatible: "OpenAI-compatible",
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
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}
