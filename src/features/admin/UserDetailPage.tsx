/**
 * Admin › Users › one person: role, enable/disable, sign out everywhere, and
 * per-feature access with daily limits (spec §6.12). Destructive actions are
 * confirmed with the consequence spelled out. Managers can't change roles and
 * can't grant more than they hold (the backend answers 403 with the reason).
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { capitalize, featureLabel } from "../../lib/auth/access";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../lib/api/errors";
import type { EntitlementOut, User } from "../../lib/api/types";
import { AccountBadge } from "./AccountBadge";
import {
  getUser,
  getUserEntitlements,
  resetUserEntitlement,
  revokeSessions,
  setUserActive,
  setUserEntitlement,
  updateUser,
} from "./adminApi";
import { ROLE_LABELS, displayName, formatDateTime, providerLabel } from "./format";
import "./admin.css";

type Role = "user" | "manager" | "admin";
type Pending = "disable" | "enable" | "revoke" | null;

function AccountCard({
  target,
  isSelf,
  isAdmin,
  onChanged,
}: {
  target: User;
  isSelf: boolean;
  isAdmin: boolean;
  onChanged: (u: User) => void;
}) {
  const [role, setRole] = useState<Role>(target.role as Role);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const roleId = useId();
  const who = displayName(target);

  useEffect(() => setRole(target.role as Role), [target.role]);

  const saveRole = async () => {
    setSaving(true);
    setMessage(null);
    try {
      onChanged(await updateUser(target.id, { role }));
      setMessage({ kind: "ok", text: `Role saved. ${who} is now ${ROLE_LABELS[role]}.` });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Couldn't change the role.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-labelledby={`${roleId}-h`}>
      <h3 id={`${roleId}-h`}>Account</h3>
      <dl className="admin-facts">
        <div>
          <dt>Status</dt>
          <dd>
            <AccountBadge active={target.is_active} />
          </dd>
        </div>
        <div>
          <dt>Signs in with</dt>
          <dd>{providerLabel(target.auth_provider)}</dd>
        </div>
        <div>
          <dt>Last sign-in</dt>
          <dd className="admin-num">{formatDateTime(target.last_login_at)}</dd>
        </div>
        <div>
          <dt>Email verified</dt>
          <dd>{target.email_verified_at ? formatDateTime(target.email_verified_at) : "Not yet"}</dd>
        </div>
      </dl>

      {message && (
        <p className={message.kind === "ok" ? "admin-flash" : "login-error"} role="status">
          {message.text}
        </p>
      )}

      <div className="admin-role-row">
        <div className="form-field">
          <label htmlFor={roleId}>Role</label>
          <select
            id={roleId}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={!isAdmin || isSelf || saving}
            aria-describedby={`${roleId}-hint`}
          >
            <option value="user">User</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <p className="field-hint" id={`${roleId}-hint`}>
            {!isAdmin
              ? "Only admins can change roles."
              : isSelf
                ? "You can't change your own role."
                : "Managers can manage their team; admins can manage everyone."}
          </p>
        </div>
        {isAdmin && !isSelf && (
          <button
            type="button"
            className="btn-small"
            onClick={() => void saveRole()}
            disabled={saving || role === target.role}
          >
            {saving ? "Saving…" : "Save role"}
          </button>
        )}
      </div>

      <div className="admin-actions admin-actions-start">
        {target.is_active ? (
          <button
            type="button"
            className="btn-danger-small"
            onClick={() => setPending("disable")}
            disabled={isSelf}
            title={isSelf ? "You can't disable your own account." : undefined}
          >
            Disable account
          </button>
        ) : (
          <button type="button" className="btn-small" onClick={() => setPending("enable")}>
            Enable account
          </button>
        )}
        <button type="button" className="btn-small" onClick={() => setPending("revoke")}>
          Sign out everywhere
        </button>
      </div>

      {pending === "disable" && (
        <ConfirmDialog
          title={`Disable ${who}?`}
          confirmLabel="Disable account"
          danger
          onClose={() => setPending(null)}
          onConfirm={async () => {
            onChanged(await setUserActive(target.id, false));
            setMessage({ kind: "ok", text: `${who} is disabled and signed out.` });
          }}
        >
          <p>
            Disabling {who} signs them out on every device right away and cancels their running
            searches and apply tasks.
          </p>
          <p>They can't sign in again until you enable the account. Their data is kept.</p>
        </ConfirmDialog>
      )}
      {pending === "enable" && (
        <ConfirmDialog
          title={`Enable ${who}?`}
          confirmLabel="Enable account"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            onChanged(await setUserActive(target.id, true));
            setMessage({ kind: "ok", text: `${who} can sign in again.` });
          }}
        >
          <p>{who} will be able to sign in again with their email code or Google.</p>
        </ConfirmDialog>
      )}
      {pending === "revoke" && (
        <ConfirmDialog
          title={`Sign ${who} out everywhere?`}
          confirmLabel="Sign out everywhere"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await revokeSessions(target.id);
            setMessage({ kind: "ok", text: `${who} was signed out on every device.` });
          }}
        >
          <p>
            {isSelf ? "You'll" : `${who} will`} be signed out on every device within 15 minutes and
            need to sign in again. The account stays active.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

interface Draft {
  enabled: boolean;
  quota: string;
  level: string;
}

function toDraft(e: EntitlementOut): Draft {
  return {
    enabled: e.enabled,
    quota: e.quota_per_day == null ? "" : String(e.quota_per_day),
    level: e.max_level == null ? (e.feature === "auto_apply" ? "1" : "") : String(e.max_level),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.enabled === b.enabled && a.quota.trim() === b.quota.trim() && a.level === b.level;
}

function EntitlementRow({
  userId,
  ent,
  onSaved,
}: {
  userId: string;
  ent: EntitlementOut;
  onSaved: (e: EntitlementOut) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(ent));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const base = useId();
  const label = capitalize(featureLabel(ent.feature));
  const dirty = !sameDraft(draft, toDraft(ent));
  const isAutoApply = ent.feature === "auto_apply";

  useEffect(() => setDraft(toDraft(ent)), [ent]);

  const save = async () => {
    const q = draft.quota.trim();
    if (q && !/^\d+$/.test(q)) {
      setMessage({
        kind: "error",
        text: "Daily limit must be a whole number, or empty for no limit.",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await setUserEntitlement(userId, ent.feature, {
        enabled: draft.enabled,
        quota_per_day: q ? Number(q) : null,
        max_level: isAutoApply && draft.level ? Number(draft.level) : (ent.max_level ?? null),
      });
      onSaved(saved);
      setMessage({ kind: "ok", text: "Saved" });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Couldn't save.") });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await resetUserEntitlement(userId, ent.feature));
      setMessage({ kind: "ok", text: "Back to default" });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Couldn't reset.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <th scope="row">
        {label}
        <span className="admin-source">{ent.source === "override" ? "Custom" : "Default"}</span>
      </th>
      <td>
        <label className="switch">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            disabled={busy}
            aria-label={`${label}: ${draft.enabled ? "on" : "off"}`}
          />
          <span className="slider" />
        </label>
      </td>
      <td>
        <input
          className="admin-quota"
          inputMode="numeric"
          placeholder="No limit"
          value={draft.quota}
          onChange={(e) => setDraft({ ...draft, quota: e.target.value })}
          disabled={busy || !draft.enabled}
          aria-label={`${label}: daily limit`}
          aria-describedby={`${base}-used`}
        />
      </td>
      <td className="admin-num" id={`${base}-used`}>
        {ent.used_today == null ? "—" : `${ent.used_today} used today`}
      </td>
      <td>
        {isAutoApply ? (
          <select
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value })}
            disabled={busy || !draft.enabled}
            aria-label="Auto apply: highest autopilot level"
          >
            <option value="1">1 · Prefill only</option>
            <option value="2">2 · Submit after review</option>
            <option value="3">3 · Full auto</option>
          </select>
        ) : (
          <span className="admin-muted">—</span>
        )}
      </td>
      <td>
        <div className="admin-row-actions">
          <button
            type="button"
            className="btn-small"
            onClick={() => void save()}
            disabled={busy || !dirty}
          >
            Save
          </button>
          {ent.source === "override" && (
            <button
              type="button"
              className="link-button"
              onClick={() => void reset()}
              disabled={busy}
            >
              Reset to default
            </button>
          )}
          {message && (
            <span
              className={message.kind === "ok" ? "admin-row-ok" : "admin-row-error"}
              role={message.kind === "error" ? "alert" : "status"}
            >
              {message.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function EntitlementsCard({ target }: { target: User }) {
  const [rows, setRows] = useState<EntitlementOut[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const { user: me, reloadMe } = useAuth();

  useEffect(() => {
    let active = true;
    setError("");
    getUserEntitlements(target.id)
      .then((r) => active && setRows(r))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load feature access.")));
    return () => {
      active = false;
    };
  }, [target.id, reload]);

  const onSaved = useCallback(
    (saved: EntitlementOut) => {
      // The save response has no usage count; keep the one we already show.
      setRows(
        (rs) =>
          rs?.map((r) =>
            r.feature === saved.feature
              ? { ...r, ...saved, used_today: saved.used_today ?? r.used_today }
              : r,
          ) ?? rs,
      );
      if (target.id === me?.id) void reloadMe();
    },
    [target.id, me?.id, reloadMe],
  );

  return (
    <section className="card admin-table-card" aria-labelledby="ent-heading">
      <h3 id="ent-heading">Feature access</h3>
      <p className="field-hint admin-card-hint">
        Turn features on or off for {displayName(target)} and set daily limits (empty = no limit).
        Limits reset at 00:00 UTC. “Default” rows follow the defaults for everyone.
      </p>
      {error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-small" onClick={() => setReload((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : !rows ? (
        <p className="empty-state" role="status">
          Loading feature access…
        </p>
      ) : (
        <table className="data-table admin-ent-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Access</th>
              <th scope="col">Daily limit</th>
              <th scope="col">Today</th>
              <th scope="col">Autopilot level</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <EntitlementRow key={e.feature} userId={target.id} ent={e} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function UserDetailPage() {
  const { userId = "" } = useParams();
  const { user: me } = useAuth();
  const [target, setTarget] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    setTarget(null);
    getUser(userId)
      .then((u) => active && setTarget(u))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load this person.")));
    return () => {
      active = false;
    };
  }, [userId, reload]);

  return (
    <div className="admin-page">
      <p className="admin-back">
        <Link to="/admin/users">← All users</Link>
      </p>
      {error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-small" onClick={() => setReload((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : !target ? (
        <p className="empty-state" role="status">
          Loading…
        </p>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h2>{displayName(target)}</h2>
              <p>
                {target.name ? `${target.email} · ` : ""}
                {ROLE_LABELS[target.role] ?? target.role}
                {target.id === me?.id ? " · You" : ""}
              </p>
            </div>
          </div>
          <AccountCard
            target={target}
            isSelf={target.id === me?.id}
            isAdmin={me?.role === "admin"}
            onChanged={setTarget}
          />
          <EntitlementsCard target={target} />
        </>
      )}
    </div>
  );
}
