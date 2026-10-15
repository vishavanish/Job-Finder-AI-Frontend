import type { UsageSummary } from "../../lib/api/types";

const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const num = new Intl.NumberFormat();

function formatUsd(v: number): string {
  return v === 0 ? "$0" : usd.format(v);
}

/** AI usage over the last N days: totals, by model and (admin) by user. */
export function UsageCard({
  usage,
  title = "AI usage, last 30 days",
}: {
  usage: UsageSummary;
  title?: string;
}) {
  const t = usage.totals;
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      {t.calls === 0 ? (
        <p className="field-hint">No AI calls yet. Usage appears here after your first search.</p>
      ) : (
        <>
          <dl className="usage-stats">
            <div>
              <dt>Calls</dt>
              <dd>{num.format(t.calls)}</dd>
            </div>
            <div>
              <dt>Failed calls</dt>
              <dd>{num.format(t.failed_calls)}</dd>
            </div>
            <div>
              <dt>Tokens in / out</dt>
              <dd>
                {num.format(t.tokens_in)} / {num.format(t.tokens_out)}
              </dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{formatUsd(t.cost_usd)}</dd>
            </div>
          </dl>
          <table className="data-table">
            <caption className="sr-only">Usage by model</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Calls</th>
                <th scope="col">Failed</th>
                <th scope="col">Tokens</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.by_model.map((m) => (
                <tr key={`${m.provider}:${m.model_id}`}>
                  <th scope="row">{m.model_id}</th>
                  <td className="num">{num.format(m.calls)}</td>
                  <td className="num">{num.format(m.failed_calls)}</td>
                  <td className="num">{num.format(m.tokens_in + m.tokens_out)}</td>
                  <td className="num">{formatUsd(m.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {usage.by_user && usage.by_user.length > 0 && (
            <table className="data-table usage-users">
              <caption className="sr-only">Usage by person</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_user.map((u) => (
                  <tr key={u.user_id ?? "system"}>
                    <th scope="row">{u.email ?? "System"}</th>
                    <td className="num">{num.format(u.calls)}</td>
                    <td className="num">{num.format(u.tokens_in + u.tokens_out)}</td>
                    <td className="num">{formatUsd(u.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
