/**
 * MSW handlers for the F5 screens, mirroring backend P5: /applications with
 * filters, /applications/stats, /applications/{id}/events, the manual status
 * change, and /gmail/* (connect, accounts, sync, disconnect, review inbox).
 * State lives in mocks/f5State.ts.
 *
 * The mock connect URL points back to the app (`/tracker?gmail=connected`)
 * instead of Google, and the account is added at once, as if Google had
 * redirected back.
 */
import { http, HttpResponse } from "msw";
import type { ApplicationLogEntry, GmailAccount, ResolveIn } from "../lib/api/types";
import { mockDb } from "./data";
import { READING, applyEmail, f5Db, recordStatus, statsFor, timelineFor } from "./f5State";
import type { MockAccount, MockEmail } from "./f5State";
import { API, authenticate, newId, readJson } from "./handlers";

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ detail: { code, message } }, { status });

const MANUAL = new Set([
  "opened",
  "submitted",
  "emailed",
  "acknowledged",
  "assessment",
  "interview",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
]);
const CATEGORY_STATUS: Record<string, string> = {
  acknowledgement: "acknowledged",
  assessment: "assessment",
  interview_invite: "interview",
  offer: "offer",
  rejection: "rejected",
};
const MAX_ACCOUNTS = 3;

function accountOut(a: MockAccount): GmailAccount {
  const { user_id: _u, ...out } = a;
  return out;
}

function emailOut(e: MockEmail) {
  const { user_id: _u, message_id: _m, ...out } = e;
  return out;
}

function findApp(id: unknown): ApplicationLogEntry | undefined {
  return mockDb.applications.find((a) => a.id === String(id));
}

export const f5Handlers = [
  // ---- applications ----
  http.get(`${API}/applications/stats`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(statsFor(auth.user.id));
  }),

  http.get(`${API}/applications`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const q = new URL(request.url).searchParams;
    const limit = Number(q.get("limit") ?? 100);
    const offset = Number(q.get("offset") ?? 0);
    const status = q.get("status");
    const company = q.get("company")?.toLowerCase();
    const source = q.get("source");
    const since = q.get("since");
    const rows = mockDb.applications.filter(
      (r) =>
        (!status || r.status === status) &&
        (!company || r.company.toLowerCase().includes(company)) &&
        (!source || r.source === source) &&
        (!since || r.date >= since),
    );
    return HttpResponse.json({
      applications: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
    });
  }),

  http.get(`${API}/applications/:id/events`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = findApp(params.id);
    if (!row)
      return HttpResponse.json({ detail: "no application found with this id" }, { status: 404 });
    return HttpResponse.json({ application_id: row.id, events: timelineFor(row) });
  }),

  http.patch(`${API}/applications/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = findApp(params.id);
    if (!row)
      return HttpResponse.json({ detail: "no application found with this id" }, { status: 404 });
    const { status } = await readJson<{ status: string }>(request);
    if (!status || !MANUAL.has(status)) {
      return HttpResponse.json(
        { detail: [{ msg: "Input should be a known status" }] },
        { status: 422 },
      );
    }
    recordStatus(row, status, "manual");
    return HttpResponse.json(row);
  }),

  // ---- Gmail ----
  http.get(`${API}/gmail/connect`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    if (!f5Db.configured) {
      return fail(503, "gmail_not_configured", "Gmail tracking isn't set up on this server.");
    }
    const mine = f5Db.accounts.filter((a) => a.user_id === auth.user.id);
    if (mine.length >= MAX_ACCOUNTS) {
      return fail(
        409,
        "gmail_limit",
        `You can connect up to ${MAX_ACCOUNTS} Gmail accounts. Disconnect one first.`,
      );
    }
    const now = new Date().toISOString();
    const address =
      auth.user.email.replace(/@.*/, "") + (mine.length ? mine.length + 1 : "") + "@gmail.com";
    const existing = mine.find((a) => a.status === "needs_reconnect");
    if (existing) {
      Object.assign(existing, { status: "active", last_error: null, next_sync_at: now });
    } else {
      f5Db.accounts.push({
        id: newId("gm"),
        user_id: auth.user.id,
        gmail_address: address,
        status: "active",
        last_synced_at: null,
        next_sync_at: now,
        last_error: null,
        connected_at: now,
        reading: READING,
      });
    }
    return HttpResponse.json({ auth_url: "/tracker?gmail=connected" });
  }),

  http.get(`${API}/gmail/accounts`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({
      accounts: f5Db.configured
        ? f5Db.accounts.filter((a) => a.user_id === auth.user.id).map(accountOut)
        : [],
      configured: f5Db.configured,
    });
  }),

  http.delete(`${API}/gmail/accounts/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const account = f5Db.accounts.find((a) => a.id === params.id && a.user_id === auth.user.id);
    if (!account)
      return fail(404, "gmail_account_not_found", "No connected Gmail account with this id.");
    f5Db.accounts = f5Db.accounts.filter((a) => a !== account);
    f5Db.emails = f5Db.emails.filter((e) => e.account_id !== account.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/gmail/accounts/:id/sync`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const account = f5Db.accounts.find((a) => a.id === params.id && a.user_id === auth.user.id);
    if (!account)
      return fail(404, "gmail_account_not_found", "No connected Gmail account with this id.");
    if (account.status === "active") {
      account.last_synced_at = new Date().toISOString();
      account.next_sync_at = new Date(Date.now() + 15 * 60_000).toISOString();
    }
    return HttpResponse.json(
      { queued: true, message: "Checking your inbox — new results appear in a minute or two." },
      { status: 202 },
    );
  }),

  http.get(`${API}/gmail/review`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const rows = f5Db.emails.filter(
      (e) => e.user_id === auth.user.id && e.state === "needs_review",
    );
    return HttpResponse.json({ events: rows.map(emailOut), total: rows.length });
  }),

  http.post(`${API}/gmail/review/:id/resolve`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const m = f5Db.emails.find((e) => e.id === params.id && e.user_id === auth.user.id);
    if (!m) return fail(404, "email_not_found", "No email with this id.");
    if (m.state !== "needs_review")
      return fail(409, "not_in_review", "This email isn't waiting for review.");
    const body = await readJson<ResolveIn>(request);
    if (body.action === "ignore") {
      m.state = "ignored";
      return HttpResponse.json(emailOut(m));
    }
    let appId = body.application_id ?? null;
    if (body.action === "confirm") {
      if (!m.suggestions?.length) {
        return fail(
          422,
          "no_suggestion",
          "There's no suggested application to confirm — choose one.",
        );
      }
      appId ??= m.suggestions![0]!.application_id;
    }
    const category = body.category ?? m.category ?? "";
    const status = CATEGORY_STATUS[category];
    if (!status) {
      return fail(
        422,
        "bad_category",
        "Choose what the email means (acknowledgement, assessment, interview, offer or rejection).",
      );
    }
    const row = findApp(appId);
    if (!row) return fail(404, "application_not_found", "No application with this id.");
    m.category = category as MockEmail["category"];
    m.application_id = row.id;
    m.applied_status = applyEmail(row, status, m);
    m.state = "applied";
    return HttpResponse.json(emailOut(m));
  }),
];
