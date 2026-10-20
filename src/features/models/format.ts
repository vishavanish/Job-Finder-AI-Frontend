/** Formatting helpers shared by the models, keys and job-source screens. */
const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : dateFmt.format(d);
}

const RISK_TEXT: Record<string, string> = {
  none: "No terms-of-service risk.",
  low: "Low risk: an official or paid API.",
  high: "Scrapes the site. It may break or limit your account if overused.",
};

export function riskText(risk: string): string {
  return RISK_TEXT[risk] ?? risk;
}
