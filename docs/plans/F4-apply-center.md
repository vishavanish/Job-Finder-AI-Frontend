# F4 — Apply Center: four apply buttons, prep pack, review queue, answer bank, apply settings (draft for approval)

Status: **approved 2026-10-19 (all eight defaults) and built** on frontend `dev`, plus `GET /apply/runs?job_id=` on backend `dev`. `npm run check` green (112 tests); checked in the browser against the mocks (search → Auto apply → answer → approve → submitted with screenshot; risk notice; nav count).

Deviations:

- Job cards read one shared "recent runs" list (a single request for the whole feed) rather than one `?job_id=` call per card. The filter exists on the backend and in `applyApi.listRuns` for later screens.
- Building the mocks showed the backend still reported Auto apply as "coming with the apply engine" for Greenhouse/Lever; `apply_options` now enables it (backend fix in the same change).
- A run that changes state refreshes the run lists and the nav count at once, not only on the 60 s poll.
  Inputs:

- `docs/frontend-prompt.md` §6.3 (job card buttons), §6.4 (Apply Center), §8 (F4 row).
- `docs/frontend-audit.md` open items: B1 (`POST /apply/{id}/close` doesn't exist), B3 (finding the application after Auto apply by scanning URLs).
- Backend on `dev`: P4a `5ea2c76` (apply options, prep pack, answer bank, Email apply status) and P4b `3b4431b` (apply engine, settings, review flow, proofs). Plan: `job_finder_api/docs/plans/P4-apply-center.md`.

Builds on F3 (`0a1aa3a`).

---

## 1. Goal and acceptance criteria

Every P4 backend feature gets a screen, and the job card stops guessing what works.

1. **Job card — four buttons**, driven only by the backend's `apply_options` (the reasons come from the server, so the UI never decides on its own):

   | Button             | Click                                                                                                                                                                     | Card afterwards                                                                                            |
   | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
   | **Apply manually** | Opens the **prep dialog** (tailored resume + cover letter) with **Open job page**. When the user comes back: _Did you apply?_ **Yes** / **Not yet** / **Not interested**. | Yes → `Submitted` (manual). Not interested → hidden.                                                       |
   | **Fast apply**     | LinkedIn Easy Apply only (local runs). Starts a `fast` run: "A LinkedIn window opens on this PC with the first step filled — check it and click Submit yourself."         | `Prefilled — finish in the LinkedIn window`, then **I submitted it**.                                      |
   | **Auto apply**     | Greenhouse / Lever. Starts an `auto` run; nothing is sent yet.                                                                                                            | Live run status (`Reading the form…`, `Needs your answer`, `Ready to review` → link to the review screen). |
   | **Email apply**    | Prep dialog with the **email draft**: to, subject, body (copy buttons), **Open in my email app** (`mailto:`), tailored resume download.                                   | **I sent it** → `Emailed`.                                                                                 |

   A disabled button keeps its tooltip and `aria-describedby` reason (e.g. "Auto apply works on Greenhouse and Lever job pages only"). Levels, caps and the risk notice are checked when the user clicks; refusals show the server's message with a link to Apply settings.

2. **Prep dialog** (Manual and Email apply):
   - Builds the pack from `POST /apply/prep`, then polls `GET /apply/prep/{id}` (it takes 10–40 s), with a progress line in the activity tray.
   - Shows the tailored resume (download DOCX) and the cover letter (copy).
   - Shows **"Removed because it isn't in your resume"** with the fact check's `dropped` list, so the user sees what the AI tried to add.
   - **Regenerate** button. A partial pack (e.g. the cover letter failed) shows what worked plus the error.
   - **Open job page** works at once — the user never has to wait for the pack.

3. **Apply Center** (`/apply`), tabs:
   - **Needs you** (default): runs in `awaiting_input`, `awaiting_review` or `needs_user`, newest first, each with the next step in plain words.
   - **In progress**: `queued`, `preparing`, `submitting`, with live status and **Cancel**.
   - **History**: submitted, done, cancelled, failed.
   - **Answer bank**: saved screening answers. **AI drafts** are listed first with **Approve** / edit / delete; the user can add their own.
   - **Settings**:
     - level **Assist** / **Review & submit** (and **Full auto** shown disabled as "later");
     - the **risk notice**, accepted in a dialog before level 2 turns on;
     - "Your account allows level 1 — ask an admin" when the entitlement caps it;
     - apply hours and time zone;
     - the **pause** switch;
     - today's usage against the caps (auto submits, per platform, Fast apply, company cooldown).

4. **Run review screen** (`/apply/runs/:id`):
   - Every form question with its answer and a **source badge**: _From your profile_, _Private (EEO)_, _Saved answer_, _AI draft — check it_, _Your answer_, **Needs your answer**.
   - Inputs match the question type (text, long text, the field's own options for selects/radios).
   - **Save answers** → `POST /apply/runs/{id}/answer`.
   - Files: which upload gets the tailored resume / cover letter (with download).
   - **Approve and submit** is enabled only in `awaiting_review`. It says "Submits within about a minute — this can't be undone" and shows outside-hours / cap refusals as messages, not errors.
   - **Cancel**.
   - **Hand-off** for `needs_user`:
     - the server's reason ("This form has an 'I am human' captcha…");
     - **Open job page**, **Copy all answers**;
     - **I submitted it** / **I didn't apply** → `POST /apply/runs/{id}/done`.
     - Never a "try again anyway".
   - **Screenshots**: confirmation or where it stopped, loaded with auth as images (owner-only, not cached).
   - The screen polls every 3 s while the run is active and stops when it finishes or the tab is hidden.

5. **Status wording** everywhere (card, Apply Center, Applications list) keeps **Opened**, **Prefilled** and **Submitted** apart. Labels are added for `prefilled`, `needs_user` ("Needs you — finish on the job page"), `emailed`, `done`, `preparing` and `submitting`.

6. **Nav:** **Apply Center** in Workspace, with a count badge of runs that need the user (refreshed every 60 s and after any apply action).

7. **Cleanup:**
   - The F3 `startAutoApply` (legacy `POST /apply`) and `closeApplyBrowser` (B1) are removed.
   - The card's own gate (`useAutoApplyGate`, `auto_apply_capable`) is replaced by `apply_options`.
   - B3 closes, because a run carries its `application_id`.

8. Every new screen has loading / empty / error / disabled-with-reason states, works with the keyboard and on a phone, and announces run state changes politely (`aria-live`).
   - MSW mocks for every endpoint below (`npm run dev:mocks` runs a full fake run: queued → awaiting_input → review → submitted).
   - Tests for each screen.
   - `npm run check` green.

---

## 2. Backend endpoints used (all on backend `dev`)

| Screen       | Endpoints                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job card     | feed / `GET /jobs` `apply_options`, `GET /apply/options/{job_id}`, `POST /apply/runs`, `POST /applications/manual` (`via`), `POST /jobs/{id}/hide` |
| Prep dialog  | `POST /apply/prep`, `GET /apply/prep/{id}`, `GET /resumes/{id}/file`                                                                               |
| Apply Center | `GET /apply/runs?state=`, `GET/PUT /apply/settings`                                                                                                |
| Run review   | `GET /apply/runs/{id}`, `…/answer`, `…/approve`, `…/cancel`, `…/done`, `…/proofs`, `…/proofs/{proof_id}`                                           |
| Answer bank  | `GET/POST/PUT/DELETE /answer-bank`, `POST /answer-bank/{id}/approve`                                                                               |

**One small backend addition** (backend `dev`, own commit, with a test): `GET /apply/runs?job_id=`. The job card needs to show a job's current run without listing every run. Then refresh the OpenAPI snapshot and types (`npm run api:snapshot && npm run gen:api`).

---

## 3. Design

- **Folder:** `src/features/apply/` (TSX):
  - `applyApi.ts` (typed calls + query keys);
  - `ApplyCenterPage.tsx` (tabs);
  - `RunReviewPage.tsx`;
  - `PrepDialog.tsx`;
  - `AnswerBankPanel.tsx`;
  - `ApplySettingsPanel.tsx`;
  - `RiskNoticeDialog.tsx`;
  - `useApplyRun(runId)` (polling hook);
  - `apply.css`.
- **Job card:**
  - `JobCard.tsx` gets an `ApplyButtons` component fed by `job.apply_options`.
  - On a phone, the buttons that work stay visible and the disabled ones move under **More ways to apply** (still with their reasons).
- **Server state:** TanStack Query as in F3.
  - Run and pack queries poll with `refetchInterval` only while active; they pause when the tab is hidden.
  - Mutations invalidate the run, the runs lists, the nav badge and `/jobs`.
- **Activity tray:**
  - prep packs and active runs appear there with their state;
  - clicking one opens the review screen.
- **Files and screenshots:**
  - downloaded through the authenticated API client as blobs, shown with object URLs that are revoked on unmount;
  - never put in `localStorage` or the query cache.
- **Safe rendering:** form labels, AI answers, cover letters and the server's messages are plain text — never `dangerouslySetInnerHTML`.
  - EEO answers show only on the review screen, with a "private — never sent to AI" note.
- **No new dependencies.**

---

## 4. Steps

1. Backend: `job_id` filter on `GET /apply/runs` + test. Refresh the OpenAPI snapshot and generated types.
2. `applyApi.ts`, query keys, status labels (`status.ts`), MSW handlers with a scripted fake run and pack.
3. Job card `ApplyButtons` (four buttons, reasons, run status chip) + prep dialog (Manual and Email flows, "Did you apply?", "I sent it").
4. Apply Center page: tabs, lists, cancel, nav item with badge.
5. Run review screen: fields with sources, answers, approve, hand-off, done, screenshots, polling.
6. Answer bank panel; Apply settings panel with the risk notice dialog, level gate, hours, pause, usage.
7. Remove legacy auto-apply code (B1, B3, `useAutoApplyGate`); Applications page status labels.
8. Tests, `npm run check`, audit + README status, this plan's status line.

---

## 5. Risks

| Risk                                              | Mitigation                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Users approve without reading AI drafts           | Drafts are badged "AI draft — check it" and counted in the approve button ("Approve 2 AI answers and submit") |
| Polling cost with many runs                       | Poll only the open run (3 s) and the badge (60 s); lists refetch on focus                                     |
| Fast apply buttons on a deployed site             | The server already reports `fast: unavailable` in production; the UI just shows that reason                   |
| A prep pack takes long or fails on free AI quotas | The job page opens at once; partial packs show what worked; Regenerate retries                                |
| Screenshots hold personal data                    | Fetched with auth on demand, object URLs revoked, no caching                                                  |

---

## 6. Owner decisions needed before building

1. **Routes:** `/apply` (tabs: Needs you, In progress, History, Answer bank, Settings) and `/apply/runs/:id` for the review screen; nav item **Apply Center** with a "needs you" count. _Recommended: yes._
2. **All four buttons on every job card**, enabled or disabled purely by the backend's `apply_options` (with its reason). On a phone, disabled ones fold under **More ways to apply**. _Recommended: yes._
3. **Prep pack starts when the Manual / Email dialog opens** (uses free AI models; cached per job), rather than waiting for a separate "Prepare" click. The job page can be opened without waiting. _Recommended: yes._
4. **Full auto (level 3)** shown in Settings as disabled "coming later", so the levels are clear. _Recommended: yes._
5. **Polling:** the open run every 3 s while active, the nav badge every 60 s. _Recommended: yes._
6. **Backend addition:** `GET /apply/runs?job_id=` (tiny, on backend `dev`). _Recommended: yes._
7. **Screenshots shown inline** on the review screen (loaded with auth, never cached). _Recommended: yes._
8. **Remove the old Auto apply path** (`POST /apply`, the F3 gate, the missing close endpoint) from the frontend now; the backend keeps `POST /apply` for one release. _Recommended: yes._
