/**
 * Admin › Users (spec §6.12): search, filter, invite. Admins see everyone;
 * managers see only their team and can't invite or change roles.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../lib/api/errors";
import type { AdminUserList } from "../../lib/api/types";
import { AccountBadge } from "./AccountBadge";
import { createUser, listUsers } from "./adminApi";
import { ROLE_LABELS, displayName, formatDateTime, providerLabel } from "./format";
import "./admin.css";

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function InviteForm({
  onDone,
  onCancel,
}: {
  onDone: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "manager" | "admin">("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { email: useId(), name: useId(), role: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const u = await createUser({ email: email.trim(), name: name.trim() || null, role });
      onDone(u.email);
    } catch (err) {
      setError(errorMessage(err, "Couldn't add this person."));
      setBusy(false);
    }
  };

  return (
    <form className="card admin-invite" onSubmit={submit} noValidate>
      <h3>Add a person</h3>
      <p className="field-hint">
        They sign in with this email using a one-time code or Google. No invite email is sent; tell
        them the app address.
      </p>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-invite-fields">
        <div className="form-field">
          <label htmlFor={ids.email}>Email</label>
          <input
            id={ids.email}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="form-field">
          <label htmlFor={ids.name}>Name (optional)</label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor={ids.role}>Role</label>
          <select
            id={ids.role}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="user">User</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="admin-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-run" disabled={busy}>
          {busy ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AdminUserList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [flash, setFlash] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const query = useDebounced(q.trim(), 300);
  const ids = { q: useId(), role: useId(), state: useId() };

  useEffect(() => setOffset(0), [query, role, state]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    listUsers(
      {
        q: query || undefined,
        role: role || undefined,
        active: state === "" ? undefined : state === "active",
        limit: PAGE_SIZE,
        offset,
      },
      ctrl.signal,
    )
      .then((res) => setData(res))
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(errorMessage(err, "Couldn't load people."));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, role, state, offset, reloadKey]);

  const total = data?.total ?? 0;
  const filtered = Boolean(query || role || state);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>
            {isAdmin
              ? "Everyone with an account. Open a person to change their role, access or features."
              : "People on your team. Open a person to change their access or features."}
          </p>
        </div>
        {isAdmin && !inviting && (
          <button type="button" className="btn-run" onClick={() => setInviting(true)}>
            Add person
          </button>
        )}
      </div>

      {flash && (
        <p className="admin-flash" role="status">
          {flash}
        </p>
      )}

      {inviting && (
        <InviteForm
          onCancel={() => setInviting(false)}
          onDone={(email) => {
            setInviting(false);
            setFlash(`Added ${email}. They can sign in now.`);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <div className="admin-filters" role="search">
        <div className="form-field">
          <label htmlFor={ids.q}>Search</label>
          <input
            id={ids.q}
            type="search"
            placeholder="Name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={ids.role}>Role</label>
          <select id={ids.role} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="user">Users</option>
            <option value="manager">Managers</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={ids.state}>Status</label>
          <select id={ids.state} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <div className="card admin-table-card" aria-busy={loading}>
        {error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <button type="button" className="btn-small" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        ) : !data && loading ? (
          <p className="empty-state" role="status">
            Loading people…
          </p>
        ) : data && data.users.length === 0 ? (
          <p className="empty-state">
            {filtered
              ? "No one matches these filters. Clear the search or pick another role or status."
              : isAdmin
                ? "No accounts yet. Add a person to get started."
                : "No one is on your team yet. Ask an admin to assign people to you."}
          </p>
        ) : (
          <table className="data-table">
            <caption className="sr-only">
              People, {total} in total. Showing {offset + 1} to{" "}
              {Math.min(offset + PAGE_SIZE, total)}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Signs in with</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link className="admin-user-link" to={`/admin/users/${u.id}`}>
                      {displayName(u)}
                    </Link>
                    {u.name && <span className="admin-user-email">{u.email}</span>}
                    {u.id === me?.id && <span className="admin-you">You</span>}
                  </td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>
                    <AccountBadge active={u.is_active} />
                  </td>
                  <td>{providerLabel(u.auth_provider)}</td>
                  <td className="admin-num">{formatDateTime(u.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE_SIZE && (
        <nav className="admin-pager" aria-label="Pages">
          <button
            type="button"
            className="btn-small"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </button>
          <span className="admin-num">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <button
            type="button"
            className="btn-small"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
