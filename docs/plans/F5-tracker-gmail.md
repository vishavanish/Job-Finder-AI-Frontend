# F5 — Tracker & Gmail: tracker, timeline, Gmail panel, needs-review inbox, dashboard (draft for approval)

Status: **approved 2026-10-20 (all nine defaults) and built** on frontend `dev`, plus the timeline-email addition on backend `dev` (uncommitted). `npm run check` green; checked in the browser against the mocks (Dashboard → Tracker table/kanban → rejected application's timeline with its email → review confirm → Gmail reconnect banner → disconnect → Job sources).

Deviations:

- The connect button follows only `https://accounts.google.com/` URLs to Google, or an in-app path (the mocks use `/tracker?gmail=connected`); anything else is refused as "an unexpected sign-in address".
- The privacy note is the app's own wording; the server's `reading` text says the same, so it isn't repeated.
- The review count shows in the nav and on the tab ("Needs review (2)"); the Dashboard also shows the Apply Center's waiting runs.

Inputs:

- `docs/frontend-prompt.md` §6.2 (Dashboard), §6.5 (Application tracker), §6.8 (Providers), §8 (F5 row: "Every automatic status change shows its source and evidence").
- Backend on `dev`: P5 `17f3d3a` (not pushed). `job_finder_api/CLAUDE.md` §6.11 and `job_finder_api/docs/plans/P5-tracker-gmail.md`.
- Legacy screen being replaced: `src/pages/ApplicationsPage.jsx` (`/applications`).

Builds on F4 (`cb54857`).

---

## 1. Goal and acceptance criteria

Every P5 backend feature gets a screen, and the user can see **why** each application has its status.

1. **Tracker** (`/tracker`), replacing the legacy Applications page (`/applications` redirects):
   - **Summary cards** from `GET /applications/stats`: applied, this week, in interviews, offers, rejected, emails to review. Each card links to the filtered list behind it.
   - **Table** and **kanban** views, switchable (the choice is remembered on this device).
     - Table: role, company, source, applied on, status, how it changed (source badge), last update.
     - Kanban columns by stage: _In progress_ (opened, prefilled, needs you…), _Applied_ (submitted, emailed, done), _Acknowledged_, _Assessment_, _Interview_, _Offer_ (offer, accepted), _Closed_ (rejected, declined, withdrawn, no reply). Cards are links to the detail page; there is no drag-and-drop (decision 3).
   - **Filters:** status, company, source, applied since; **search** over role and company. Filters live in the URL (`?status=interview&company=acme`), so the dashboard and summary cards can link to them and Back works.
   - States: loading skeletons, empty ("No applications yet — find jobs"), no matches ("Clear filters"), error with retry.

2. **Application detail** (`/tracker/:id`):
   - Header: role, company, source, applied date, current status, **Open job page**.
   - **Vertical timeline** from `GET /applications/{id}/events`, oldest first, each step with:
     - its status label (Opened / Prefilled / Submitted always distinct — `src/components/status.ts`);
     - its **source** badge: _Apply engine_, _You_ (manual), _From an email_ (email_parser);
     - its **note** (rejection notes are the backend's formal template text, shown as plain text);
     - for email steps, **the email that caused it**: sender, subject, received date (and a Gmail link / snippet if decision 7 is taken).
   - **Change status** (`PATCH /applications/{id}`) with the full list: opened, submitted, emailed, acknowledged, assessment, interview, offer, accepted, declined, rejected, withdrawn, no reply (ghosted). Moving to a **closed** status (accepted, declined, withdrawn, rejected) asks first, because email tracking never changes a closed application afterwards.
   - **Apply run link**: when one of the user's apply runs has this `application_id`, a link to its review screen (answers and screenshots live there).
   - States: loading, not found (404 → "This application doesn't exist or isn't yours"), error, timeline empty.

3. **Gmail panel** (tab on `/tracker`):
   - **Connect Gmail** → `GET /gmail/connect` → `window.location.assign(auth_url)`. Google redirects back to `/tracker?gmail=connected` or `?gmail=error&reason=expired|denied|scope|failed`; the page opens the Gmail tab and shows:
     - connected: "Gmail connected. The first check looks at the last 30 days and takes a minute or two.";
     - expired: "The connection took too long — try again.";
     - denied: "You cancelled on Google's screen. Nothing was connected.";
     - scope: "Google didn't grant read access to your mailbox. Try again and tick the Gmail box.";
     - failed / anything else: "Couldn't connect Gmail. Try again in a minute.";
     - the query string is then removed (`replace`), so a refresh doesn't show it again.
   - **Accounts** (`GET /gmail/accounts`): address, status (_Active_ / _Needs reconnect_ with **Reconnect** / _Paused_), last checked, next check, last error. Up to 3 (the server's `gmail_limit` 409 message is shown as is).
   - **Check now** (`POST /gmail/accounts/{id}/sync`): shows the server's message ("Checking your inbox…"); the 429 rate limit shows "You've checked a lot this hour — it also checks on its own every 15 minutes". The accounts, review list and stats refresh every 15 s for 2 minutes afterwards.
   - **Disconnect** (`DELETE`), confirm dialog:
     > Disconnect _you@gmail.com_? Job Finder stops reading this mailbox and Google access is revoked. Deleted: the job emails found in it (sender, subject, date, snippet) and the jobs read from its job-alert emails. Kept: your applications and their status history.
   - **Privacy note** (always visible, plain words): read-only access; only job-related emails are looked at; the app stores the sender, subject, date and a short snippet, never the full email; email data is removed after 180 days (alert jobs after 30). The account's own `reading` text from the server is used where it exists.
   - **Not configured** (`configured: false`): "Gmail tracking isn't set up on this server yet — an admin needs to add the Google OAuth client." Connect is disabled with that reason; existing accounts (none) aren't listed.
   - **Entitlement** `gmail_tracking` off: Connect and Check now disabled with "Gmail tracking is off for your account — ask an admin."

4. **Needs-review inbox** (tab on `/tracker`, with a count): `GET /gmail/review`.
   - Each email: subject, sender, date, snippet, the AI's reading (category + confidence, company, role, summary).
   - **Suggestions** with their match scores ("Acme Corp — Backend Engineer · 72").
   - Actions (`POST /gmail/review/{id}/resolve`):
     - **Confirm** — top suggestion with the AI's category ("Mark Acme Corp — Backend Engineer as Rejected"); hidden when there are no suggestions.
     - **Change** — pick an application (the suggestions first, then a searchable list of all) and what the email means (acknowledgement, assessment, interview, offer, rejection), then **Save**.
     - **Ignore** — "Not about my applications".
   - After a resolve: the email leaves the list, the stats, the application and its timeline refresh; the result says which status was applied (or "noted on the timeline" when the status didn't move forward).
   - Empty: "Nothing to review. Emails the tracker is unsure about appear here." Without Gmail: "Connect Gmail to track replies automatically" with a link to the Gmail tab.

5. **Dashboard** (`/`, decision 1):
   - **Funnel**: applied → acknowledged → assessment → interview → offer, as bars with counts, plus **rejected** separately. A note: "Counts every application that got at least this far."
   - **This week** (applied in the last 7 days) and total.
   - **Needs you**: "N emails need review" (→ review tab) and the Apply Center's waiting runs (existing count → `/apply`).
   - **Recent changes**: the 5 most recently updated applications with their status (→ detail).
   - **Quick actions**: Find jobs, Apply Center, Connect Gmail (only when no account is connected).
   - Every number is a link. Empty state for a new user: "Start with a search" → `/jobs`.

6. **Job sources page:** the **Job alert emails** source (`email_alerts`) gets its own "Your inbox" group. When it's unavailable, the backend's reason ("connect Gmail to read your job-alert emails") is followed by a **Connect Gmail** link to `/tracker?tab=gmail`.

7. **Nav:** _Dashboard_ first in Workspace; _Applications_ becomes **Tracker** (`/tracker`) with a count badge of emails to review (refreshed every 60 s and after resolve / sync).

8. Every screen has loading / empty / error / disabled-with-reason states, works with the keyboard and on a phone (the table becomes stacked rows; kanban scrolls sideways inside its own box), and status changes are announced politely (`aria-live`).
   - MSW mocks for every endpoint below, including the connect redirect (the mock `auth_url` points back to `/tracker?gmail=connected`).
   - Tests for each screen. `npm run check` green.

---

## 2. Backend endpoints used (all on backend `dev`)

| Screen       | Endpoints                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Dashboard    | `GET /applications/stats`, `GET /applications?limit=` (recent), apply waiting count (F4)                            |
| Tracker      | `GET /applications?status=&company=&source=&since=&limit=&offset=`, `GET /applications/stats`                       |
| Detail       | `GET /applications/{id}`, `GET /applications/{id}/events`, `PATCH /applications/{id}`, `GET /apply/runs` (run link) |
| Gmail panel  | `GET /gmail/connect`, `GET /gmail/accounts`, `POST /gmail/accounts/{id}/sync`, `DELETE /gmail/accounts/{id}`        |
| Review inbox | `GET /gmail/review`, `POST /gmail/review/{id}/resolve`, `GET /applications` (application picker)                    |
| Job sources  | existing `GET /providers` (`email_alerts` row with `available` / `reason`)                                          |

No backend change is needed for the screens. **One optional addition** (decision 7): the timeline's `email` object has only sender, subject and date, so the frontend can't link to the email itself. Adding `id`, `snippet`, `category` and `gmail_url` (`https://mail.google.com/mail/u/<address>/#all/<message_id>`) to it is a few lines plus a test on backend `dev`, uncommitted unless you ask.

Then refresh the OpenAPI snapshot (`app.openapi()` dumped from the backend with `..\venv\Scripts\python.exe`) and `npm run gen:api`.

Known API limits the UI works with:

- `GET /applications` has no text search and returns newest first. The tracker loads up to 500 with the server-side filters and searches role/company on the client; "Showing the latest 500" appears when there are more.
- The funnel counts "reached at least this stage" (a rejected application that had an interview counts as an interview). The list behind a funnel number shows applications **currently** at that stage, so it can be shorter; the note says so.
- Resume version used isn't recorded per application yet; the detail page doesn't show it (listed as an open item).

---

## 3. Design

- **Folder:** `src/features/tracker/` (TSX):
  - `trackerApi.ts` (typed calls + query keys: applications, stats, timeline, gmail accounts, review);
  - `TrackerPage.tsx` (summary cards + tabs: **Applications** · **Needs review (n)** · **Gmail**, `?tab=`);
  - `ApplicationsTable.tsx`, `ApplicationsKanban.tsx`, `TrackerFilters.tsx`, `stages.ts` (status → kanban stage, source labels);
  - `ApplicationDetailPage.tsx`, `Timeline.tsx`, `StatusChangeForm.tsx`;
  - `GmailPanel.tsx`, `ReviewInbox.tsx`, `ResolveDialog.tsx`;
  - `tracker.css`.
- `src/features/dashboard/DashboardPage.tsx` + `dashboard.css`.
- **Server state:** TanStack Query as in F3/F4. Resolve / status change / disconnect invalidate applications, stats, the timeline, review and the nav badge. Short polling only after **Check now** (15 s for 2 min) and for the nav badge (60 s); paused when the tab is hidden.
- **Connect flow:** a full-page navigation to Google (not a popup — fewer blockers, works on phones). The return query is read once on `/tracker`, shown in a dismissible status banner, then removed from the URL.
- **Status wording:** reuse `statusLabel` / `StatusBadge`; add labels for `ghosted` ("No reply", exists), `acknowledged`, `assessment`, `interview`, `offer`, `accepted`, `declined`, `withdrawn` where the default casing isn't enough. Source labels in `stages.ts`.
- **Safe rendering:** email subjects, snippets, senders, AI summaries and notes are plain text — never `dangerouslySetInnerHTML`. Links to Gmail open in a new tab with `rel="noopener noreferrer"`, and only `https://mail.google.com/` URLs are rendered as links.
- **Kanban:** CSS grid with one column per stage, horizontal scroll in its own region, each column a labelled list (`aria-labelledby`), counts in headers. Memoized; with 500 items it stays light without virtualisation.
- **View choice** (table / kanban) in `localStorage` via `src/lib/storage.ts` (not sensitive).
- **Legacy cleanup:** delete `src/pages/ApplicationsPage.jsx`; `/applications` → `<Navigate to="/tracker" replace />` keeping the query.
- **No new dependencies.**

---

## 4. Steps

1. Refresh the OpenAPI snapshot and generated types (plus the optional timeline-email addition, decision 7).
2. `trackerApi.ts`, `stages.ts`, status labels; MSW mocks `src/mocks/f5.ts` + `f5State.ts` (applications with timelines incl. an email-driven rejection, two Gmail accounts — one needing reconnect, review emails with suggestions, stats computed from the state), registered in `src/mocks/all.ts`, reset in `src/test/setup.ts`.
3. Tracker page: summary cards, filters in the URL, search, table + kanban, view switch; `/applications` redirect; nav item + badge.
4. Application detail: timeline with sources, notes and emails; status change with the closed-status confirm; apply run link.
5. Gmail panel: connect + return banners, accounts, Check now, Disconnect dialog, privacy note, not-configured and entitlement states.
6. Needs-review inbox: list, Confirm / Change / Ignore, application picker.
7. Dashboard at `/`; Job sources "Your inbox" group with the Connect Gmail link.
8. Tests (`src/features/tracker/f5.test.tsx`), `npm run check`, browser check with the `frontend-mocks` preview, `docs/frontend-audit.md`, this plan's status line.

---

## 5. Risks

| Risk                                                    | Mitigation                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A user trusts a wrong automatic change                  | Every email step shows its source and the email (sender, subject, date); status is one click to correct                |
| A manual "rejected" by mistake freezes tracking         | Closed statuses ask first and say email tracking stops changing it                                                     |
| Funnel numbers and the filtered list differ             | Note under the funnel; the list title says "currently at this stage"                                                   |
| Large histories (hundreds of applications)              | Server filters + 500 cap with a visible note; memoized rows                                                            |
| Google OAuth "testing" mode limits (restricted scope)   | Not a UI problem; the not-configured state and server error messages cover a misconfigured server                      |
| The mock connect flow hides real redirect problems      | All four `reason` values are tested; the real flow is checked by the owner once the OAuth client exists                |
| A full reload in the mock preview resets the mock state | Browser checks navigate with in-app links; the connect mock returns to `/tracker?gmail=connected` without losing state |

---

## 6. Owner decisions needed before building

1. **`/` opens the Dashboard** (spec §6 route table); Jobs stays one click away in the nav. _Recommended: yes._
2. **One Tracker page with tabs** — Applications · Needs review (n) · Gmail — at `/tracker?tab=`, detail at `/tracker/:id`; nav **Applications → Tracker** with a review-count badge; `/applications` redirects. _Recommended: yes._
3. **Kanban is read-only** (cards link to the detail page, status changes happen there) — no drag-and-drop, so nothing changes by accident and it stays keyboard friendly. _Recommended: yes._
4. **Confirm before a closed status** (accepted, declined, withdrawn, rejected), because the backend then never lets an email change it. _Recommended: yes._
5. **Connect by full-page redirect** (not a popup), with the four return outcomes shown as a banner on the Gmail tab. _Recommended: yes._
6. **Polling:** after Check now, refresh accounts / review / stats every 15 s for 2 minutes; the nav badge every 60 s. _Recommended: yes._
7. **Small backend addition:** add `id`, `snippet`, `category` and `gmail_url` to the timeline's `email` object, so each email-driven step can link to the email in Gmail (spec §6.5 "with a link to the email that triggered it"). Without it the timeline shows sender, subject and date only. _Recommended: yes (backend `dev`, with a test, left uncommitted)._
8. **Tracker loads up to 500 applications** with server filters and searches on the client (the API has no text search). _Recommended: yes._
9. **Delete the legacy `ApplicationsPage.jsx`** now that the tracker covers it. _Recommended: yes._
