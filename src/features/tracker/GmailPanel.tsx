/**
 * Gmail panel (F5 plan §1.3): connect (full-page redirect to Google and back
 * to /tracker?gmail=…), connected accounts with their sync state, Check now,
 * Disconnect with a confirm that spells out what is deleted, the privacy note,
 * and the "not set up on this server" / entitlement-off states.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { ApiError, errorMessage } from "../../lib/api/errors";
import { useEntitlement } from "../../lib/auth/access";
import type { GmailAccount } from "../../lib/api/types";
import { connectTarget } from "./gmail";
import { formatDate } from "./stages";
import {
  disconnectGmailAccount,
  gmailConnectUrl,
  listGmailAccounts,
  syncGmailAccount,
  trackerKeys,
} from "./trackerApi";

/** After Check now: refresh accounts, review and stats this often, for this long. */
export const SYNC_POLL_MS = 15_000;
const SYNC_POLL_FOR_MS = 120_000;

const ACCOUNT_STATUS: Record<GmailAccount["status"], { status: string; label: string }> = {
  active: { status: "completed", label: "Active" },
  needs_reconnect: { status: "needs_user", label: "Needs reconnect" },
  paused: { status: "withdrawn", label: "Paused" },
};

function syncError(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return "You've checked a lot this hour. It also checks on its own every 15 minutes.";
  }
  return errorMessage(err, "Couldn't start a check.");
}

export function PrivacyNote() {
  return (
    <div className="gmail-privacy">
      <h3>What Job Finder reads</h3>
      <ul>
        <li>Read-only access — it can't send, delete or change anything in your mailbox.</li>
        <li>Only job-related emails are looked at (replies from companies and job boards).</li>
        <li>
          It keeps the sender, subject, date and a short snippet — never the full email. The email
          is read once to work out what it means and then dropped.
        </li>
        <li>Email details are removed after 180 days, jobs from alert emails after 30.</li>
      </ul>
    </div>
  );
}

function AccountRow({
  account,
  canUse,
  reason,
  onSynced,
  onReconnect,
  connecting,
}: {
  account: GmailAccount;
  canUse: boolean;
  reason: string;
  onSynced: () => void;
  onReconnect: () => void;
  connecting: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const sync = useMutation({
    mutationFn: () => syncGmailAccount(account.id),
    onSuccess: (out) => {
      setMessage(out.message);
      onSynced();
    },
  });
  const badge = ACCOUNT_STATUS[account.status] ?? { status: account.status, label: account.status };
  const reconnect = account.status === "needs_reconnect";

  return (
    <li className="gmail-account">
      <div className="gmail-account-main">
        <strong className="gmail-address">{account.gmail_address}</strong>{" "}
        <StatusBadge status={badge.status} label={badge.label} />
        <dl className="gmail-facts">
          <div>
            <dt>Last checked</dt>
            <dd>{account.last_synced_at ? formatDate(account.last_synced_at, true) : "Not yet"}</dd>
          </div>
          {account.status === "active" && account.next_sync_at && (
            <div>
              <dt>Next check</dt>
              <dd>{formatDate(account.next_sync_at, true)}</dd>
            </div>
          )}
          <div>
            <dt>Connected</dt>
            <dd>{formatDate(account.connected_at)}</dd>
          </div>
        </dl>
        {account.last_error && (
          <p className="gmail-error" role="note">
            Last problem: {account.last_error}
          </p>
        )}
        {message && (
          <p className="flash-ok" role="status">
            {message}
          </p>
        )}
        {sync.isError && (
          <p className="login-error" role="alert">
            {syncError(sync.error)}
          </p>
        )}
      </div>
      <div className="gmail-account-actions">
        {reconnect ? (
          <button
            type="button"
            className="btn-run"
            disabled={!canUse || connecting}
            title={canUse ? undefined : reason}
            onClick={onReconnect}
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn-small"
            disabled={!canUse || sync.isPending || account.status !== "active"}
            title={canUse ? undefined : reason}
            onClick={() => {
              setMessage("");
              sync.mutate();
            }}
          >
            {sync.isPending ? "Starting…" : "Check now"}
          </button>
        )}
        <button type="button" className="btn-danger-small" onClick={() => setConfirming(true)}>
          Disconnect
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Disconnect ${account.gmail_address}?`}
          confirmLabel="Disconnect"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await disconnectGmailAccount(account.id);
            await qc.invalidateQueries({ queryKey: trackerKeys.accounts });
            await qc.invalidateQueries({ queryKey: trackerKeys.all });
          }}
        >
          <p>Job Finder stops reading this mailbox and its Google access is revoked.</p>
          <p>
            <strong>Deleted:</strong> the job emails found in it (sender, subject, date, snippet)
            and the jobs read from its job-alert emails.
          </p>
          <p>
            <strong>Kept:</strong> your applications and their status history.
          </p>
        </ConfirmDialog>
      )}
    </li>
  );
}

export function GmailPanel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { allowed, reason: entitlementReason } = useEntitlement("gmail_tracking");
  const [pollUntil, setPollUntil] = useState(0);
  const polling = pollUntil > Date.now();
  const accounts = useQuery({
    queryKey: trackerKeys.accounts,
    queryFn: listGmailAccounts,
    refetchInterval: polling ? SYNC_POLL_MS : false,
  });

  // While a check runs, refresh what it may change (review inbox, stats, applications) on the same beat.
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (Date.now() > pollUntil) {
        setPollUntil(0);
        return;
      }
      if (document.visibilityState === "visible") {
        void qc.invalidateQueries({ queryKey: trackerKeys.all });
      }
    }, SYNC_POLL_MS);
    return () => window.clearInterval(t);
  }, [polling, pollUntil, qc]);

  const connect = useMutation({
    mutationFn: async () => {
      const target = connectTarget((await gmailConnectUrl()).auth_url);
      if (!target) throw new Error("The server sent an unexpected sign-in address.");
      return target;
    },
    onSuccess: (target) => {
      if ("external" in target) window.location.assign(target.external);
      else {
        navigate(target.internal);
        void qc.invalidateQueries({ queryKey: trackerKeys.accounts });
      }
    },
  });

  const configured = accounts.data?.configured ?? true;
  const list = accounts.data?.accounts ?? [];
  const notConfigured =
    "Gmail tracking isn't set up on this server yet — an admin needs to add the Google OAuth client.";
  const canConnect = allowed && configured;
  const connectReason = !allowed ? entitlementReason : !configured ? notConfigured : "";

  return (
    <div className="gmail-panel">
      <div className="card">
        <div className="gmail-head">
          <div>
            <h3>Gmail</h3>
            <p className="field-hint">
              Connect Gmail and replies from companies update your applications automatically —
              acknowledgements, assessments, interview invites, offers and rejections. Job-alert
              emails become a job source.
            </p>
          </div>
          {list.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              disabled={!canConnect || connect.isPending}
              aria-describedby={connectReason ? "gmail-connect-reason" : undefined}
              onClick={() => connect.mutate()}
            >
              Connect another
            </button>
          )}
        </div>

        {connectReason && (
          <p className="field-hint gmail-reason" id="gmail-connect-reason">
            {connectReason}
          </p>
        )}
        {connect.isError && (
          <p className="login-error" role="alert">
            {errorMessage(connect.error, "Couldn't start connecting Gmail.")}
          </p>
        )}

        {accounts.isLoading ? (
          <p className="empty-state" role="status">
            Loading…
          </p>
        ) : accounts.isError ? (
          <p className="login-error" role="alert">
            {errorMessage(accounts.error, "Couldn't load your Gmail accounts.")}{" "}
            <button type="button" className="link-button" onClick={() => void accounts.refetch()}>
              Try again
            </button>
          </p>
        ) : list.length === 0 ? (
          <div className="gmail-empty">
            <p>No Gmail account connected.</p>
            <button
              type="button"
              className="btn-run"
              disabled={!canConnect || connect.isPending}
              aria-describedby={connectReason ? "gmail-connect-reason" : undefined}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? "Opening Google…" : "Connect Gmail"}
            </button>
          </div>
        ) : (
          <ul className="gmail-accounts">
            {list.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                canUse={allowed}
                reason={entitlementReason}
                connecting={connect.isPending}
                onReconnect={() => connect.mutate()}
                onSynced={() => setPollUntil(Date.now() + SYNC_POLL_FOR_MS)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <PrivacyNote />
      </div>
    </div>
  );
}
