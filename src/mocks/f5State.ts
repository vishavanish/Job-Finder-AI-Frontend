/**
 * In-memory state for the F5 mocks (backend P5): each application's status
 * timeline, connected Gmail accounts and the emails found in them (some
 * waiting for review). Applications themselves stay in mockDb.applications.
 * Reset between tests.
 */
import type {
  ApplicationLogEntry,
  EmailEvent,
  GmailAccount,
  TimelineEvent,
  TrackerStats,
} from "../lib/api/types";
import { mockDb } from "./data";

export const READING =
  "Read-only access. Only job-related emails are looked at; the app stores the sender, subject, date and a " +
  "short snippet — never the full email.";

export interface MockEmail extends EmailEvent {
  user_id: string;
  message_id: string;
}

export interface MockAccount extends GmailAccount {
  user_id: string;
}

/** Same ranks as backend email_sync.STATUS_RANK (anything not listed is 0). */
const RANK: Record<string, number> = {
  submitted: 1,
  emailed: 1,
  done: 1,
  acknowledged: 2,
  assessment: 3,
  interview: 4,
  offer: 5,
};
const SENT = new Set([
  "submitted",
  "emailed",
  "done",
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
const CLOSED = new Set(["accepted", "declined", "withdrawn"]);

export const f5Db = {
  /** application id -> its status history, oldest first */
  timelines: {} as Record<string, TimelineEvent[]>,
  accounts: [] as MockAccount[],
  emails: [] as MockEmail[],
  /** Whether the server has a Google OAuth client (GET /gmail/accounts `configured`). */
  configured: true,
};

const at = (day: number, hour = 9) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();

function email(e: Partial<MockEmail> & Pick<MockEmail, "id" | "subject" | "sender">): MockEmail {
  return {
    user_id: "u_demo",
    account_id: "gm_1",
    message_id: `msg_${e.id}`,
    snippet: "",
    received_at: at(15),
    category: null,
    confidence: null,
    company: null,
    role: null,
    summary: null,
    state: "applied",
    application_id: null,
    applied_status: null,
    match_score: null,
    suggestions: [],
    ...e,
  };
}

function seedEmails(): MockEmail[] {
  return [
    email({
      id: "em_rej",
      sender: "Orchard Retail Talent <talent@orchardretail.example>",
      subject: "Your application for Data Engineer",
      snippet: "Thank you for your interest in the Data Engineer role. After careful review…",
      received_at: at(12, 14),
      category: "rejection",
      confidence: 0.94,
      company: "Orchard Retail",
      role: "Data Engineer",
      summary: "Orchard Retail will not move forward with the Data Engineer application.",
      application_id: "app_4",
      applied_status: "rejected",
      match_score: 95,
    }),
    email({
      id: "em_int",
      sender: "Harbor Freight Tech <recruiting@harborfreight.example>",
      subject: "Interview: Backend Developer",
      snippet: "We'd like to invite you to a 45-minute technical interview next week.",
      received_at: at(13, 10),
      category: "interview_invite",
      confidence: 0.91,
      company: "Harbor Freight Tech",
      role: "Backend Developer",
      summary: "Harbor Freight Tech invites you to a technical interview for Backend Developer.",
      application_id: "app_3",
      applied_status: "interview",
      match_score: 100,
    }),
    email({
      id: "em_review_1",
      sender: "no-reply@greenhouse.example",
      subject: "Thanks for applying",
      snippet: "We received your application and our team will review it shortly.",
      received_at: at(16, 8),
      category: "acknowledgement",
      confidence: 0.82,
      company: "Lumen Analytics",
      role: null,
      summary: "Lumen Analytics received your application.",
      state: "needs_review",
      match_score: 55,
      suggestions: [
        {
          application_id: "app_2",
          score: 55,
          title: "AI Engineer (LLM apps)",
          company: "Lumen Analytics",
        },
        {
          application_id: "app_6",
          score: 30,
          title: "Python Developer",
          company: "Quarry Systems",
        },
      ],
    }),
    email({
      id: "em_review_2",
      sender: "Priya at Zephyr <priya@zephyr-talent.example>",
      subject: "Quick chat about a role?",
      snippet: "Hi! I came across your profile and would love to set up a call this week.",
      received_at: at(16, 11),
      category: "interview_invite",
      confidence: 0.64,
      company: "Zephyr",
      summary: "A recruiter at Zephyr asks for a call.",
      state: "needs_review",
    }),
  ];
}

function seedAccounts(): MockAccount[] {
  return [
    {
      id: "gm_1",
      user_id: "u_demo",
      gmail_address: "demo.jobs@gmail.com",
      status: "active",
      last_synced_at: at(16, 12),
      next_sync_at: at(16, 13),
      last_error: null,
      connected_at: at(10),
      reading: READING,
    },
    {
      id: "gm_2",
      user_id: "u_demo",
      gmail_address: "old.inbox@gmail.com",
      status: "needs_reconnect",
      last_synced_at: at(11, 9),
      next_sync_at: null,
      last_error: "Gmail access was revoked or expired — reconnect.",
      connected_at: at(5),
      reading: READING,
    },
  ];
}

const ev = (
  status: string,
  status_source: string,
  created_at: string,
  extra: Partial<TimelineEvent> = {},
): TimelineEvent => ({ status, status_source, created_at, note: null, email: null, ...extra });

function emailRef(id: string): TimelineEvent["email"] {
  const m = seedEmails().find((e) => e.id === id)!;
  return {
    id: m.id,
    sender: m.sender,
    subject: m.subject,
    snippet: m.snippet,
    received_at: m.received_at,
    category: m.category,
    gmail_url: `https://mail.google.com/mail/u/demo.jobs%40gmail.com/#all/${m.message_id}`,
  };
}

function seedTimelines(): Record<string, TimelineEvent[]> {
  return {
    app_1: [
      ev("opened", "apply_engine", at(14, 8)),
      ev("easy_apply_form_filled_awaiting_review", "apply_engine", at(14, 8)),
    ],
    app_2: [
      ev("opened", "apply_engine", at(13, 9)),
      ev("submitted", "apply_engine", at(13, 9), {
        note: "Submitted by Auto apply after your review.",
      }),
    ],
    app_3: [
      ev("opened", "manual", at(12, 9)),
      ev("submitted", "manual", at(12, 10), { note: "marked as applied by the user" }),
      ev("interview", "email_parser", at(13, 10), {
        note: "On 13 Oct 2026, Harbor Freight Tech invited you to an interview for Backend Developer.",
        email: emailRef("em_int"),
      }),
    ],
    app_4: [
      ev("opened", "apply_engine", at(11, 9)),
      ev("submitted", "apply_engine", at(11, 9)),
      ev("rejected", "email_parser", at(12, 14), {
        note:
          "On 12 Oct 2026, Orchard Retail told you it will not move forward with your application for " +
          "Data Engineer.",
        email: emailRef("em_rej"),
      }),
    ],
  };
}

export function resetF5Mock(): void {
  f5Db.timelines = seedTimelines();
  f5Db.accounts = seedAccounts();
  f5Db.emails = seedEmails();
  f5Db.configured = true;
}
resetF5Mock();

/** The stored history, or one step made from the row for applications created elsewhere in the mocks. */
export function timelineFor(row: ApplicationLogEntry): TimelineEvent[] {
  return (f5Db.timelines[row.id] ??= [
    ev(row.status, row.status_source, row.updated_at ?? `${row.date}T09:00:00Z`),
  ]);
}

export function recordStatus(
  row: ApplicationLogEntry,
  status: string,
  source: string,
  extra: Partial<TimelineEvent> = {},
): void {
  timelineFor(row).push(ev(status, source, new Date().toISOString(), extra));
  row.status = status;
  row.status_source = source;
  row.updated_at = new Date().toISOString();
}

/**
 * What an email does to an application (backend apply_to_application): forward only, rejection and offer
 * always apply, closed applications never change. Returns the new status, or null when it was only noted.
 */
export function applyEmail(row: ApplicationLogEntry, status: string, m: MockEmail): string | null {
  const ref = {
    id: m.id,
    sender: m.sender,
    subject: m.subject,
    snippet: m.snippet,
    received_at: m.received_at,
    category: m.category,
    gmail_url: `https://mail.google.com/mail/u/0/#all/${m.message_id}`,
  };
  const moves =
    !CLOSED.has(row.status) &&
    row.status !== "rejected" &&
    (status === "rejected" || status === "offer" || (RANK[status] ?? 0) > (RANK[row.status] ?? 0));
  const company = row.company || "The company";
  if (moves) {
    const note =
      status === "rejected"
        ? `${company} told you it will not move forward with your application for ${row.title}.`
        : null;
    recordStatus(row, status, "email_parser", { note, email: ref });
    return status;
  }
  timelineFor(row).push(
    ev(row.status, "email_parser", new Date().toISOString(), {
      note: `An email about this application (${status}) didn't change its status.`,
      email: ref,
    }),
  );
  return null;
}

export function statsFor(userId: string): TrackerStats {
  const rows = mockDb.applications;
  const sent = rows.filter((r) => SENT.has(r.status));
  const reached = (stage: string) =>
    sent.filter((r) => {
      if (r.status === "accepted" || r.status === "declined") return true;
      const best =
        r.status === "rejected"
          ? Math.max(
              1,
              ...timelineFor(r).map((e) => (e.status === "rejected" ? 0 : (RANK[e.status] ?? 0))),
            )
          : (RANK[r.status] ?? 1);
      return best >= RANK[stage]!;
    }).length;
  const count = (keys: string[]) =>
    keys.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    total: sent.length,
    this_week: sent.filter((r) => new Date(`${r.date}T12:00:00Z`).getTime() >= weekAgo).length,
    funnel: {
      applied: sent.length,
      acknowledged: reached("acknowledged"),
      assessment: reached("assessment"),
      interview: reached("interview"),
      offer: reached("offer"),
    },
    rejected: rows.filter((r) => r.status === "rejected").length,
    by_status: count(rows.map((r) => r.status)),
    by_source: count(sent.map((r) => r.source || "Unknown")),
    needs_review: f5Db.emails.filter((e) => e.user_id === userId && e.state === "needs_review")
      .length,
  };
}
