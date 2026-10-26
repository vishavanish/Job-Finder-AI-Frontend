/**
 * Apply settings (spec §6.4, F4 plan §1.3, F4.1): autopilot level as big
 * tiles with a plain explanation of each, the risk notice (accepted before
 * level 2), the AI form reader opt-in (its own notice first; test mode shown
 * while the server won't submit for it), the pause switch, apply hours and
 * today's usage against the caps. Full auto is shown but off — it comes
 * later.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { Icon, type IconName } from "../../components/Icon";
import { ProgressRing, SparkleChip } from "../../components/KitExtras";
import { CardHead } from "../../components/PageKit";
import { errorMessage } from "../../lib/api/errors";
import type { ApplySettings, ApplySettingsIn } from "../../lib/api/types";
import { applyKeys, getApplySettings, putApplySettings } from "./applyApi";

const LEVELS: { level: number; name: string; icon: IconName; text: string }[] = [
  {
    level: 1,
    name: "Assist",
    icon: "user",
    text: "Nothing is ever submitted for you. Auto apply is off; use Apply manually, Email apply or Fast apply.",
  },
  {
    level: 2,
    name: "Review & submit",
    icon: "check",
    text: "Auto apply fills Greenhouse and Lever forms (and other career sites with the AI form reader). You check every answer and approve each application before it's sent.",
  },
  {
    level: 3,
    name: "Full auto",
    icon: "zap",
    text: "Coming later: submits strong matches without asking, within your caps.",
  },
];

/** Sites the AI form reader covers (backend app/apply/sites.py). */
const GENERIC_SITES = [
  "Ashby",
  "SmartRecruiters",
  "Workable",
  "Recruitee",
  "Personio",
  "Breezy",
  "Teamtailor",
  "Rippling",
  "Gem",
  "Jobvite",
  "JazzHR",
  "Pinpoint",
];

export function NoticeDialog({
  title,
  notice,
  confirm,
  onAccept,
  onClose,
}: {
  title: string;
  notice: string;
  confirm: string;
  onAccept: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={title}
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
            {confirm}
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
    generic_per_day?: number;
  };
  const platforms = Object.entries(u.by_platform ?? {}).filter(([p]) => p !== "generic");
  return (
    <section className="card kit-card settings-card" aria-labelledby="usage-title">
      <CardHead id="usage-title" icon="chart" title="Today" sub="Your limits reset at midnight" />
      <div className="usage-rings">
        <ProgressRing
          used={u.auto_submitted ?? 0}
          max={c.auto_per_day ?? 20}
          label="Auto apply submitted"
        />
        {platforms.map(([p, n]) => (
          <ProgressRing
            key={p}
            used={n}
            max={c.per_platform_per_day ?? 15}
            label={p.charAt(0).toUpperCase() + p.slice(1)}
          />
        ))}
        <ProgressRing
          used={u.by_platform?.generic ?? 0}
          max={c.generic_per_day ?? 5}
          label="AI form reader"
        />
        <ProgressRing used={u.fast ?? 0} max={c.fast_per_day ?? 25} label="Fast apply" />
      </div>
      <p className="field-hint">
        One application per company and role every {c.company_cooldown_days ?? 30} days, and never
        the same job twice. Submits are spaced 30–90 seconds apart.
      </p>
    </section>
  );
}

function GenericCard({
  s,
  busy,
  onToggle,
}: {
  s: ApplySettings;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const u = s.usage_today as { by_platform?: Record<string, number> };
  const c = s.caps as { generic_per_day?: number };
  return (
    <section className="card kit-card settings-card generic-card" aria-labelledby="generic-title">
      <CardHead
        id="generic-title"
        icon="sparkle"
        title="AI form reader"
        sub="Auto apply on other career sites"
      >
        <SparkleChip beta={false}>beta</SparkleChip>
      </CardHead>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          className="input-switch"
          checked={s.allow_generic}
          disabled={busy || s.level < 2}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <strong>Use the AI form reader on other career sites</strong>
        <span className="field-hint">
          Reads hosted application forms (even several pages long), fills them from your profile and
          saved answers, and waits for your review. Never signs in or creates accounts.
        </span>
      </label>
      {s.level < 2 && (
        <p className="field-hint">
          Turn on Review & submit first — the reader works at that level.
        </p>
      )}
      <ul className="site-cloud" aria-label="Sites it covers">
        {GENERIC_SITES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="generic-status">
        {!s.generic_submit_enabled && (
          <span className="test-pill">
            <Icon name="alert" size={13} /> Test mode — you press Submit
          </span>
        )}
        <span className="field-hint num">
          {u.by_platform?.generic ?? 0} of {c.generic_per_day ?? 5} today
        </span>
      </div>
    </section>
  );
}

export function ApplySettingsPanel() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: applyKeys.settings, queryFn: getApplySettings });
  const [showRisk, setShowRisk] = useState(false);
  const [showGeneric, setShowGeneric] = useState(false);
  const [hours, setHours] = useState<{ start: number; end: number; tz: string } | null>(null);
  const [saved, setSaved] = useState("");

  const save = useMutation({
    mutationFn: (body: ApplySettingsIn) => putApplySettings(body),
    onSuccess: (s, body) => {
      qc.setQueryData(applyKeys.settings, s);
      void qc.invalidateQueries({ queryKey: applyKeys.all });
      setSaved(
        body.paused !== undefined
          ? body.paused
            ? "Paused."
            : "Running again."
          : body.allow_generic !== undefined
            ? body.allow_generic
              ? "AI form reader is on."
              : "AI form reader is off."
            : "Saved.",
      );
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
    <div className="apply-settings kit-rise">
      <section className="card kit-card settings-card" aria-labelledby="level-title">
        <CardHead
          id="level-title"
          icon="sliders"
          title="Autopilot level"
          sub="How much the app may do on its own"
        />
        <div role="radiogroup" aria-label="Autopilot level" className="level-tiles">
          {LEVELS.map((l) => {
            const disabled = l.level === 3 || l.level > s.max_level;
            const on = s.level === l.level;
            return (
              <label
                key={l.level}
                className={`level-tile${on ? " is-on" : ""}${disabled ? " is-disabled" : ""}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="level"
                  value={l.level}
                  checked={on}
                  disabled={disabled || save.isPending}
                  onChange={() => chooseLevel(l.level)}
                />
                <span className="level-tile-icon" aria-hidden="true">
                  <Icon name={l.icon} size={18} />
                </span>
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
                {on && (
                  <span className="level-tile-check" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                )}
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

      <GenericCard
        s={s}
        busy={save.isPending}
        onToggle={(on) => (on ? setShowGeneric(true) : save.mutate({ allow_generic: false }))}
      />

      <div className="settings-pair">
        <section className="card kit-card settings-card" aria-labelledby="pause-title">
          <CardHead
            id="pause-title"
            icon="pause"
            title="Pause"
            sub="Your own off switch"
            tone="muted"
          />
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              className="input-switch"
              checked={s.paused}
              disabled={save.isPending}
              onChange={(e) => save.mutate({ paused: e.target.checked })}
            />
            <span>Pause auto apply (cancels runs in progress)</span>
          </label>
        </section>

        <section className="card kit-card settings-card" aria-labelledby="hours-title">
          <CardHead
            id="hours-title"
            icon="clock"
            title="Apply hours"
            sub="Approved applications are only submitted between these hours."
            tone="progress"
          />
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
              <select
                value={h.end}
                onChange={(e) => setHours({ ...h, end: Number(e.target.value) })}
              >
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
              onClick={() =>
                save.mutate({ hours_start: h.start, hours_end: h.end, timezone: h.tz })
              }
            >
              Save hours
            </button>
          </div>
        </section>
      </div>

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
        <NoticeDialog
          title="Before you turn on Review & submit"
          confirm="Turn on Review & submit"
          notice={s.risk_notice}
          onClose={() => setShowRisk(false)}
          onAccept={() =>
            save.mutateAsync({ accept_risk_notice: true, level: s.level >= 2 ? undefined : 2 })
          }
        />
      )}
      {showGeneric && (
        <NoticeDialog
          title="Turn on the AI form reader?"
          confirm="Turn on the AI form reader"
          notice={s.generic_notice}
          onClose={() => setShowGeneric(false)}
          onAccept={() => save.mutateAsync({ allow_generic: true })}
        />
      )}
    </div>
  );
}
