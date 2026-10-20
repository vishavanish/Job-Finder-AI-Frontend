/**
 * Admin voice health (F7 plan decision 9, backend GET /admin/voice/health):
 * sessions by mode and end reason, latency p50/p95 per stage against the
 * targets (Practice first spoken word ≲ 1.5 s, Copilot first words ≲ 1 s),
 * speech and AI model calls with error rates, and spend.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/api/errors";
import { getVoiceHealth, voiceKeys } from "../interview/voiceApi";
import "../interview/interview.css";

const STAGE_LABELS: Record<string, string> = {
  stt_ms: "Speech to text",
  first_token_ms: "First AI token",
  first_word_ms: "First spoken word",
  reply_ms: "Whole reply",
  gate_ms: "Question detection",
  first_visible_ms: "First visible words",
  answer_ms: "Whole answer",
};
const TARGETS: Record<string, number> = { first_word_ms: 1500, first_visible_ms: 1000 };

type Pct = { p50: number; p95: number; n: number };
type Row = {
  task: string;
  provider: string;
  model_id: string;
  calls: number;
  failures: number;
  error_rate: number;
  latency_ms: Pct;
  cost_usd: number;
  last_error: string | null;
  units?: number;
};

export default function AdminVoicePage() {
  const [days, setDays] = useState(7);
  const health = useQuery({
    queryKey: voiceKeys.health(days),
    queryFn: () => getVoiceHealth(days),
  });
  const h = health.data;
  return (
    <div className="iv-page">
      <div className="page-header">
        <div>
          <h2>Voice health</h2>
          <p>
            How Practice and Live Copilot sessions are doing, from the numbers stored on each turn.
            No transcript text is shown.
          </p>
        </div>
        <label className="field narrow">
          <span>Period</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Last day</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>
      {health.isLoading ? (
        <p className="field-hint" role="status">
          Loading…
        </p>
      ) : health.error || !h ? (
        <p className="login-error" role="alert">
          {errorMessage(health.error)}
        </p>
      ) : (
        <>
          <p>
            Live Copilot is{" "}
            <strong>
              {(h.flags as { live_copilot_enabled?: boolean }).live_copilot_enabled ? "on" : "off"}
            </strong>{" "}
            for everyone (turn users on one by one under Users → entitlements) · spend{" "}
            <strong className="num">${h.spend_usd.toFixed(2)}</strong>
          </p>
          {Object.entries(h.latency as Record<string, Record<string, Pct | number>>).map(
            ([mode, stages]) => (
              <section key={mode} className="card">
                <h3>
                  {mode === "mock" ? "Practice" : "Live Copilot"} —{" "}
                  {(h.sessions as Record<string, { total?: number }>)[mode]?.total ?? 0} sessions
                </h3>
                <table className="iv-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>p50</th>
                      <th>p95</th>
                      <th>Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stages)
                      .filter((e): e is [string, Pct] => typeof e[1] === "object")
                      .map(([k, v]) => (
                        <tr
                          key={k}
                          className={TARGETS[k] && v.p50 > TARGETS[k]! ? "iv-over" : undefined}
                        >
                          <td>
                            {STAGE_LABELS[k] ?? k}
                            {TARGETS[k] ? ` (target ≤ ${TARGETS[k]! / 1000} s)` : ""}
                          </td>
                          <td className="num">{v.p50} ms</td>
                          <td className="num">{v.p95} ms</td>
                          <td className="num">{v.n}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {typeof stages.speculative_share === "number" && (
                  <p className="field-hint">
                    Answers started early (streaming speech-to-text):{" "}
                    {Math.round(stages.speculative_share * 100)}%
                  </p>
                )}
              </section>
            ),
          )}
          {(["speech", "llm"] as const).map((group) => (
            <section key={group} className="card">
              <h3>{group === "speech" ? "Speech models" : "AI models"}</h3>
              {(h[group] as Row[]).length === 0 ? (
                <p className="field-hint">No calls in this period.</p>
              ) : (
                <table className="iv-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Model</th>
                      <th>Calls</th>
                      <th>Errors</th>
                      <th>p50</th>
                      <th>Cost</th>
                      <th>Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(h[group] as Row[]).map((r) => (
                      <tr key={`${r.task}-${r.provider}-${r.model_id}`}>
                        <td>{r.task}</td>
                        <td>{r.model_id}</td>
                        <td className="num">{r.calls}</td>
                        <td className="num">{(r.error_rate * 100).toFixed(1)}%</td>
                        <td className="num">{r.latency_ms.p50} ms</td>
                        <td className="num">${r.cost_usd.toFixed(3)}</td>
                        <td>{r.last_error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
