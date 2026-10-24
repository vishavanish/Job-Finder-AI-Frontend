/** "The AI is busy" note for screens whose main action needs an AI task (QA1 §3). */
import { useQuery } from "@tanstack/react-query";
import { aiTaskHealth } from "./aiHealth";
import { getModels } from "./modelsApi";

const modelHealthKey = ["models", "health"] as const;

export function AiBusyBanner({ task, what }: { task: string; what: string }) {
  const catalog = useQuery({
    queryKey: modelHealthKey,
    queryFn: getModels,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const health = aiTaskHealth(catalog.data, task);
  if (health === "ok") return null;
  return (
    <p className="login-notice ai-busy" role="status">
      {health === "busy"
        ? `The AI models are busy right now (free-tier limits), so ${what} may fail. They come back on their own — try again in a few minutes.`
        : `The AI models aren't set up correctly right now, so ${what} won't work until an admin fixes them.`}
    </p>
  );
}
