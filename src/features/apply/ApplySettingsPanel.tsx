/**
 * Apply settings (spec §6.4, F4 plan §1.3): autopilot level with a plain
 * explanation of each, the risk notice (accepted before level 2), apply hours,
 * the pause switch and today's usage against the caps. Full auto is shown
 * but off — it comes later.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { errorMessage } from "../../lib/api/errors";
import type { ApplySettings, ApplySettingsIn } from "../../lib/api/types";
import { applyKeys, getApplySettings, putApplySettings } from "./applyApi";

const LEVELS = [
  {
    level: 1,
    name: "Assist",
    text: "Nothing is ever submitted for you. Auto apply is off; use Apply manually, Email apply or Fast apply.",
  },
  {
    level: 2,
    name: "Review & submit",
    text: "Auto apply fills Greenhouse and Lever forms. You check every answer and approve each application before it's sent.",
  },
  {
    level: 3,
    name: "Full auto",
    text: "Coming later: submits strong matches without asking, within your caps.",
  },
];

function RiskNoticeDialog({
  notice,
  onAccept,
  onClose,
}: {
  notice: string;
  onAccept: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title="Before you turn on Review & submit"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className="btn-run"
            disabled={!checked || busy}
            onClick={() => {
              setBusy(true);
              setError("");
              onAccept()
                .then(onClose)
                .catch((err) => setError(errorMessage(err, "Couldn't save.")))
                .finally(() => setBusy(false));
            }}
          >
            Turn on Review & submit
          </button>
        </>
      }
    >
      <p>{notice}</p>
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I
        understand and accept this
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function Usage({ s }: { s: ApplySettings }) {
  const u = s.usage_today as {
    auto_submitted?: number;
    by_platform?: Record<string, number>;
    fast?: number;
  };
  const c = s.caps as {
    auto_per_day?: number;
    per_platform_per_day?: number;
    fast_per_day?: number;
    company_cooldown_days?: number;
  };
  const platforms = Object.entries(u.by_platform ?? {});
  return (
    <section className="settings-block">
      <h3>Today</h3>
      <ul className="usage-list">
        <li>
          Auto apply submitted{" "}
          <span className="num">
            {u.auto_submitted ?? 0} of {c.auto_per_day ?? "?"}
          </span>
        </li>
        {platforms.map(([p, n]) => (
          <li key={p}>
            {p.charAt(0).toUpperCase() + p.slice(1)}{" "}
            <span className="num">
              {n} of {c.per_platform_per_day ?? "?"}
            </span>
          </li>
        ))}
        <li>
          Fast apply{" "}
          <span className="num">
            {u.fast ?? 0} of {c.fast_per_day ?? "?"}
          </span>
        </li>
      </ul>
      <p className="field-hint">
        One application per company and role every {c.company_cooldown_days ?? 30} days, and never
        the same job twice. Submits are spaced 30–90 seconds apart.
      </p>
    </section>
  );
}

export function ApplySettingsPanel() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: applyKeys.settings, queryFn: getApplySettings });
  const [showRisk, setShowRisk] = useState(false);
  const [hours, setHours] = useState<{ start: number; end: number; tz: string } | null>(null);
  const [saved, setSaved] = useState("");

  const save = useMutation({
    mutationFn: (body: ApplySettingsIn) => putApplySettings(body),
    onSuccess: (s, body) => {
      qc.setQueryData(applyKeys.settings, s);
      void qc.invalidateQueries({ queryKey: applyKeys.all });
      setSaved(body.paused !== undefined ? (body.paused ? "Paused." : "Running again.") : "Saved.");
      setTimeout(() => setSaved(""), 2500);
    },
  });

  if (settings.isLoading)
    return (
      <p className="empty-state" role="status">
        Loading…
      </p>
    );
  if (settings.isError || !settings.data)
    return (
      <p className="login-error" role="alert">
        {errorMessage(settings.error, "Couldn't load apply settings.")}
      </p>
    );
  const s = settings.data;
  const h = hours ?? { start: s.hours_start, end: s.hours_end, tz: s.timezone };
  const chooseLevel = (level: number) => {
    if (level === s.level) return;
    if (level === 2 && !s.risk_accepted_at) setShowRisk(true);
    else save.mutate({ level });
  };

  return (
    <div className="apply-settings">
      <section className="settings-block">
        <h3>Autopilot level</h3>
        <div role="radiogroup" aria-label="Autopilot level" className="level-list">
          {LEVELS.map((l) => {
            const disabled = l.level === 3 || l.level > s.max_level;
            return (
              <label key={l.level} className={`level-option${disabled ? " is-disabled" : ""}`}>
                <input
                  type="radio"
                  name="level"
                  value={l.level}
                  checked={s.level === l.level}
                  disabled={disabled || save.isPending}
                  onChange={() => chooseLevel(l.level)}
                />
                <span>
                  <strong>
                    {l.level}. {l.name}
                  </strong>
                  <span className="field-hint"> {l.text}</span>
                  {l.level === 2 && s.max_level < 2 && (
                    <span className="field-hint">
                      {" "}
                      Your account allows level 1 only — ask an admin to allow level 2.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {s.risk_accepted_at && (
          <p className="field-hint">
            Risk notice accepted {new Date(s.risk_accepted_at).toLocaleDateString()}.{" "}
            <button type="button" className="link-button" onClick={() => setShowRisk(true)}>
              Read it again
            </button>
          </p>
        )}
      </section>

      <section className="settings-block">
        <h3>Pause</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={s.paused}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ paused: e.target.checked })}
          />
          Pause auto apply (cancels runs in progress)
        </label>
      </section>

      <section className="settings-block">
        <h3>Apply hours</h3>
        <p className="field-hint">Approved applications are only submitted between these hours.</p>
        <div className="hours-row">
          <label>
            From
            <select
              value={h.start}
              onChange={(e) => setHours({ ...h, start: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            Until
            <select value={h.end} onChange={(e) => setHours({ ...h, end: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
                <option key={i} value={i}>
                  {String(i % 24).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            Time zone
            <input
              value={h.tz}
              onChange={(e) => setHours({ ...h, tz: e.target.value })}
              maxLength={64}
            />
          </label>
          <button
            type="button"
            className="btn-run"
            disabled={!hours || save.isPending}
            onClick={() => save.mutate({ hours_start: h.start, hours_end: h.end, timezone: h.tz })}
          >
            Save hours
          </button>
        </div>
      </section>

      <Usage s={s} />

      {saved && (
        <p className="admin-flash" role="status">
          {saved}
        </p>
      )}
      {save.isError && (
        <p className="login-error" role="alert">
          {errorMessage(save.error, "Couldn't save.")}
        </p>
      )}
      {showRisk && (
        <RiskNoticeDialog
          notice={s.risk_notice}
          onClose={() => setShowRisk(false)}
          onAccept={() =>
            save.mutateAsync({ accept_risk_notice: true, level: s.level >= 2 ? undefined : 2 })
          }
        />
      )}
    </div>
  );
}
