# Job Finder AI — Frontend & UI Prompt

> Give this file to an AI coding agent together with **(1) the frontend repository** (`Job-Finder-AI-Frontend`) and **(2) `PROJECT.md`** (backend architecture and API contracts). This file covers only the frontend and UI. `PROJECT.md` stays the source of truth for features, API paths, roles and entitlements.

---

## 1. Your role and goal

You are the **lead frontend engineer and UI designer** for Job Finder AI: an AI workspace that finds jobs, ranks them against the user's resume, applies (automatically or manually from the same screen), tracks every application including Gmail replies, and prepares the user for interviews by voice, including a live interview copilot.

Your goal: **evolve the existing frontend into a polished, accessible, production-grade application that exposes every feature in `PROJECT.md`**, without breaking what already works.

---

## 2. Step 0 — Discover before changing anything

The existing code was not described in detail, so **do not assume**. Before writing code:

1. Inspect the repo: `package.json`, build tool (expected Vite + React), router, state management, data fetching, API client, auth/token storage, styling system, component library, tests, lint config, env files, folder structure.
2. Run it (`npm install`, `npm run dev`, `npm run build`) and note what works, what errors, what is slow.
3. Walk every existing screen and list its features: search form, streaming job results (polls `GET /pipeline/{run_id}/jobs?offset=N` about every 2 s), scoring, applications list, apply flow, auth.
4. Write **`docs/frontend-audit.md`** with: stack found, screen inventory, API calls used, problems (bugs, duplicated code, a11y gaps, missing states, security issues such as tokens in `localStorage`), and a **migration plan** that keeps the app working after every step.
5. **Keep the existing framework and any library already in use** unless it blocks a requirement. The defaults in Section 4 apply only where nothing exists yet.

Do not start Section 6 screens until the audit is written.

---

## 3. Design direction

**Subject:** a job seeker's working tool, used for long sessions during a stressful process. **Primary job of the UI:** make the next action obvious and make progress visible.

**Principles**
- **Calm, dense, readable.** A workspace, not a marketing page. Information first; decoration only when it carries meaning.
- **Color is information.** One consistent status palette across the whole app (see below). Do not use color for decoration that competes with status.
- **Spend boldness in one place:** the **live job feed** (jobs arriving in real time, score rings filling, duplicates quietly merged) and, in interview mode, the **question → answer feed**. Everything else stays quiet and disciplined.
- **Avoid the generic look.** No identical rounded cards on everything, no gradient washes, no all-caps tracked eyebrow labels above every heading, no `01 / 02 / 03` numbering unless content is truly sequential, no `→` on every button, no single accented word in headlines. Vary radius and elevation by hierarchy.
- **Typography:** one or two typefaces chosen deliberately (not the default stack), tabular numerals for scores, counts and dates, line length under 80 characters, sentence case everywhere.
- **Motion:** only motion that answers a user action (expanding, confirming, a job arriving). No fade-up on every section. Respect `prefers-reduced-motion`.
- **Quality floor:** responsive down to mobile, visible keyboard focus, WCAG AA contrast, light and dark themes via design tokens.

**Design tokens first.** Before building screens, define and commit (CSS variables or Tailwind theme): 4–6 named base colors, neutral scale, the status palette, spacing scale, radius scale (at least two values), elevation scale, type scale. Review the plan against the brief and replace anything that looks like a default.

**Status palette (used for badges, timeline dots, kanban columns, charts)**

| Status group | Meaning | Treatment |
|--------------|---------|-----------|
| Neutral | Discovered, Saved, Queued | Grey |
| Active | Preparing, Submitting, Awaiting input/review | Blue / amber for "needs you" |
| Progress | Submitted, Acknowledged, Assessment | Teal |
| Positive | Interview, Offer, Accepted | Green |
| Negative | Rejected, Failed | Red (Failed has a retry action, Rejected does not) |
| Muted | Withdrawn, Declined, Hidden | Light grey |

Always pair color with an icon or text label, never color alone.

**Copy rules.** Write from the user's point of view in plain language. Buttons say exactly what happens ("Auto apply", "Apply manually", "Save changes"); the confirmation uses the same verb ("Saved"). Errors say what went wrong and how to fix it, never vaguely and never with an apology. Empty states tell the user the next action. Explain **why** a control is disabled ("Auto apply needs a resume — add one in Profile").

---

## 4. Technical standards

Use these **only where the repo has nothing equivalent**:

| Concern | Default |
|---------|---------|
| Language | TypeScript, `strict: true` (migrate file by file) |
| Routing | React Router with route-level code splitting |
| Server state | TanStack Query (caching, retries, polling) |
| Client state | Zustand or React context for small UI state only |
| Forms | react-hook-form + zod schemas |
| Styling | Tailwind CSS driven by the design tokens, plus accessible primitives (Radix UI / shadcn/ui) |
| API client | Types generated from the FastAPI OpenAPI schema (`openapi-typescript`) + one small fetch wrapper |
| Tables / long lists | TanStack Table; virtualize lists above ~100 rows |
| Charts | Recharts or similar, using the status palette |
| Mocks | MSW so UI work is not blocked by unfinished backend phases (`VITE_USE_MOCKS=true`) |
| Tests | Vitest + React Testing Library; Playwright for end-to-end |
| Quality | ESLint + Prettier + type-check in CI |

**Folder structure (feature-based)**
```
src/
  app/            router, providers, layout shell, guards
  components/     shared UI primitives (Button, Badge, Dialog, DataTable, EmptyState, ...)
  features/
    auth/ dashboard/ jobs/ apply/ tracker/ ats-targets/
    profile/ search-profile/ providers/ interview/ settings/ admin/
  lib/            api client, auth, ws, audio, utils
  styles/         tokens, global css
  mocks/          MSW handlers
```

---

## 5. Cross-cutting requirements

### 5.1 API layer and auth
- One API client: base URL from `VITE_API_BASE_URL`, attaches `Authorization: Bearer <access token>`, parses the shared error body `{code, message, details}`, and on `401` runs **one** token refresh then retries.
- **Token storage:** access token in memory; refresh token in an httpOnly cookie set by the backend. Never put tokens or API keys in `localStorage`/`sessionStorage`.
- No secrets in `VITE_*` variables. Provider/model/BYOK keys are sent to the backend once and shown masked afterwards (last 4 characters); the backend never returns them.
- `GET /auth/me` returns `role` and **entitlements**, for example `{ role, entitlements: { auto_apply: { enabled, max_level, quota_remaining }, live_copilot: {...}, ... } }`. If the backend does not return this yet, add the field to the contract in `PROJECT.md` and mock it.

### 5.2 Access control in the UI
- `useEntitlement("auto_apply")` and `<RequireRole roles={["admin","manager"]}>` hide or disable features **with a reason**. This is for UX only; the backend enforces every rule.
- A disabled user is signed out on the next request that returns `403 account_disabled` with a clear message.

### 5.3 Long-running work
- `useTaskPolling(taskId)` for `/tasks/{id}` with backoff, cancel button (`POST /tasks/{id}/cancel`), and clear states: pending, running (with progress text), completed, failed (with error text).
- `usePipelineRun(runId)` polls run meta and `jobs?offset=<count already held>` about every 2 s, appends only new jobs, stops when the run is completed or failed, and pauses when the tab is hidden.
- A global **activity tray** lists running tasks, apply runs and imports so the user can leave a page and come back.

### 5.4 Every screen has all states
Loading (skeletons that match layout), empty (with next action), error (with retry), partial data, offline, and disabled-with-reason. No screen ships without them.

### 5.5 Safe rendering
Render AI-generated text as sanitized Markdown or plain text. Never use `dangerouslySetInnerHTML` with model output or scraped job descriptions.

### 5.6 Accessibility and performance
Keyboard operable everywhere, focus trapped in dialogs and restored on close, `aria-live` regions for streaming content (politely), captions for any audio feature, reduced motion honored. Route-level code splitting, memoized heavy lists, images lazy-loaded, bundle budget tracked in CI.

---

## 6. Screens to build or upgrade

Routes and access (see `PROJECT.md` for the backing endpoints).

| Route | Screen | Access |
|-------|--------|--------|
| `/login`, `/register` | Sign in / create account | public |
| `/` | Dashboard | signed in |
| `/jobs` | Jobs (live feed) | `job_search` |
| `/apply` | Apply Center | signed in (buttons gated by `auto_apply`) |
| `/tracker`, `/tracker/:id` | Application tracker and detail | signed in |
| `/ats-targets` | ATS Target Discovery | `ats_discovery` |
| `/profile` | Profile & Resume | signed in |
| `/search-profile` | Keywords & Skills | signed in |
| `/providers` | Job sources and free-tools mode | signed in |
| `/interview`, `/interview/copilot`, `/interview/history` | Interview Prep, Live Copilot, history | `voice_prep` / `live_copilot` |
| `/settings` | Models, keys, Gmail, privacy, notifications | signed in |
| `/admin/*` | Admin console | `manager` / `admin` |

### 6.1 Auth
- **Continue with Google** button and an **email OTP** flow: enter email → 6-digit code input (auto-advance, paste support, 60 s resend countdown, attempts-left message) → signed in.
- Neutral wording on request ("If this address can sign in, a code is on its way") so accounts cannot be enumerated.
- Clear states for expired code, too many attempts, disabled account.

### 6.2 Dashboard
Funnel (applied → acknowledged → interview → offer, with rejected shown separately), counts for today and this week, pending reviews ("2 applications need you"), new unique matches, recent status changes, and quick actions. Every number links to the filtered list behind it.

### 6.3 Jobs (live feed)
- Search runs from the saved **search profile** (Section 6.9); show source toggles and a "Free tools only" indicator.
- Results **stream in** as scored. Each job row/card: title, company, location, posted time, source badge, **score ring (0–100) with the AI's one-sentence reason**, skills matched/missing.
- Each job shows **two buttons side by side: `Auto apply` and `Apply manually`.**
  - *Auto apply* is disabled with a reason when the platform has no adapter, the entitlement is off, or no resume exists. Clicking it queues an apply run at the user's autopilot level.
  - *Apply manually* opens the job in a new tab and offers the tailored resume/cover letter to download or copy, plus **Mark as applied**.
- Save, hide, and "applied" states; seen jobs are not shown as new again. Duplicates are already merged by the backend (LinkedIn copy kept), so never render the same job twice.
- Filters: score range, posted within, source, remote, applied/saved. Sort by score or recency. Virtualized list.

### 6.4 Apply Center
- **Autopilot level control** (Assist / Review & submit / Full auto) with a plain explanation of each, the user's daily caps, and the **risk notice** that must be accepted before levels 2–3.
- **Active runs** with live step status (preparing, filling, waiting for you, submitting, done) and cancel.
- **Review queue:** runs that need input or approval. A review screen shows each filled field next to its source (profile, answer bank, AI-written, needs your answer), lets the user edit, then **Approve and submit** or **Skip**. Captcha, login or OTP stops show a "Continue in browser" hand-off, never a bypass.
- **Answer bank** editor for screening questions the user has approved.
- Clear distinction everywhere between **Opened**, **Prefilled** and **Submitted**.

### 6.5 Application tracker
- Summary cards, table and **kanban** views (switchable), filters (status, company, source, date), search.
- **Detail page:** vertical **timeline** of events (opened → filled → submitted → email received → rejected …) with the source of each (`apply_engine`, `manual`, `email_parser`), resume version used, notes, screenshots, manual status change.
- **Gmail panel:** connect/disconnect accounts, last sync time, what is being read (plain-language privacy note).
- **Needs-review inbox:** emails the matcher was unsure about, with the suggested application and status, and *Confirm / Change / Ignore*.
- Rejections show the **formal AI note** with a link to the email that triggered it, so the user can verify every automatic change.

### 6.6 ATS Target Discovery
One prominent input: **job title**. Results grouped **by company**: name, platform badge (Workday, Greenhouse, Lever, Recruitee), number of matching jobs, top matches, location, posted date, link to apply. Filters: platform, location/remote, posted within, hide already applied. Show registry size and "last refreshed" so the scope is honest. Cold-cache searches show progress.

### 6.7 Profile & Resume
Upload or replace a resume (PDF/DOCX, drag-and-drop, progress), see the **parsed profile** in an editable form with a clear "review before saving" step, resume **versions** with a master marker, job preferences (titles, locations, remote, job types, posted-within, avoid list), applicant info used for forms, and the story bank used by interview features.

### 6.8 Providers
List every job source with tier (free / free key / paid / bring-your-own-key), risk note, health badge and enable switch. A top-level **"Free tools only"** switch disables paid sources and explains what changes. Inline key entry for sources that need one (masked after saving).

### 6.9 Keywords & Skills (one combined editor)
Skill chips with weight (core / strong / familiar), synonyms and optional years; target titles; **must-have / nice-to-have / exclude** terms; a **Suggest from my skills** action; several named profiles ("Backend", "AI Engineer"). A live preview shows the exact keywords that will be searched.

### 6.10 Interview Prep
**Practice mode**
- Setup: choose a job (or role), interview type, difficulty and length.
- Session: voice conversation with live captions, a clear listening/speaking indicator, mic level meter, pause and end.
- Report: per-answer and overall scores, STAR structure, filler words and pace, strengths, improvements, model answers, progress over time.

**Live Copilot** (details in Section 7)

### 6.11 Settings
- **AI models:** enabled models grouped *Free* and *Paid*, choose one per task (scoring, resume tailoring, form answers, email reading, interview), bring-your-own-key entry.
- Gmail connections, notification preferences, data export, **delete my data**, retention settings.

### 6.12 Admin console
Pages: **Users** (search, invite, enable/disable, role), **Managers** (team assignment), **Entitlements** (per-user service toggles and quotas, bulk apply a plan), **AI models** (add/edit, free/paid, defaults per task, test connection, health, spend), **Providers**, **Feature flags and kill switches**, **Audit log**, **System health**. Destructive actions need confirmation with the consequence spelled out ("Disabling Priya signs her out and cancels her 2 running tasks"). Managers see only their team and cannot exceed their own limits.

---

## 7. Live Copilot client

The experience: **the user enables the mic once, then questions and answers continue in a loop until they stop.** Backend contract: `WS /voice/copilot/{id}/stream` in `PROJECT.md`, Section 7.10.

### 7.1 Screen
- **Setup:** pick job/profile, answer style (bullets / short script / STAR), length, language, audio sources, hotkeys. First use shows the **acknowledgement** that some employers prohibit AI assistance in interviews and the user is responsible for the rules of each interview. It cannot be skipped.
- **Session:** a single **Start** button, then a status chip (*Listening / Paused / Reconnecting*), a visible listening indicator, a mic level meter, and a **feed of question cards**.
- **Question card:** question text (live transcript), the answer **streaming into the same card**, and *Shorter · Expand · Regenerate · Copy · Dismiss*. A "not sure" tag appears when the answer is weakly grounded. The newest card is highlighted; older cards collapse but remain scrollable. A follow-up appears inside its parent card's thread.
- **Controls:** Pause/Resume, Stop, **Answer this** (forces an answer to the last thing said), opacity and position of the floating panel.
- Behavior when a new question arrives mid-answer: the old stream stops, its card is marked "interrupted", the new card takes over.
- After **Stop**: transcript, list of Q&A, summary, weak topics, and a button to practice those questions.

### 7.2 Audio capture (web)
- Request mic with `getUserMedia`; request **tab audio** with `getDisplayMedia({ video: true, audio: true })` for browser-based calls (the video track is dropped immediately). Send the two sources as separate channels labeled `interviewer` and `user`. If tab audio is unavailable, fall back to mic only and tell the user detection will be less precise.
- Use an **AudioWorklet** to downsample to **16 kHz mono 16-bit PCM** and send **20–100 ms frames** as binary WebSocket messages with a timestamp and channel label.
- Keep a **bounded send queue**: if the socket stalls, drop the oldest frames instead of building lag.

### 7.3 WebSocket client (`useCopilotSocket`)
- Authenticates with a short-lived token, **reconnects with backoff**, and resumes the session on reconnect; shows *Reconnecting* without losing the visible cards.
- Handles events: `status`, `transcript.partial`, `transcript.final`, `question.detected`, `answer.delta`, `answer.done`, `answer.cancelled`, `error`. Sends `control` messages (`pause`, `resume`, `stop`, `answer_now`, `expand`, `regenerate`, `dismiss`) and `screenshot` only after the user presses the screenshot hotkey.
- Append `answer.delta` chunks in a ref/buffer and flush to React state at most every animation frame to keep streaming smooth.

### 7.4 Floating overlay
- In the browser: an in-page draggable panel, plus the **Document Picture-in-Picture** window where supported, so the answers can sit beside the call.
- A true always-on-top overlay, system-audio loopback and global hotkeys need the **desktop shell** (Tauri preferred, Electron acceptable) as a separate package that reuses the same React feature module. Do not duplicate logic: the web app and the desktop app share `features/interview`.
- **Never add** any hide-from-screen-share, stealth, or detection-evasion behavior. The overlay is always visible to the user, shows the listening indicator, and can be stopped with one click.

---

## 8. Frontend phases (aligned with `PROJECT.md` Section 15)

Work one phase at a time. Each phase ends with the app building, tests passing, and a short summary.

| Phase | Scope | Acceptance criteria |
|-------|-------|--------------------|
| **F0 — Audit & foundation** | Audit doc, design tokens, app shell (sidebar + top bar + activity tray), API client with refresh, generated types, MSW, test and CI setup | Existing screens still work; tokens applied to the shell; `npm run build`, lint, type-check and tests pass |
| **F1 — Auth & Admin shell** | Google + OTP flows, role and entitlement guards, Admin Users and Entitlements | Disabled user is signed out with a clear message; guards show reasons |
| **F2 — Models & Providers** | Settings > AI models, Providers page with Free-only switch, BYOK entry, Admin models/providers | Switching Free-only changes which sources run; keys never visible after saving |
| **F3 — Profile, Keywords & Skills, Jobs** | Resume upload/parse/versions, preferences, combined editor, upgraded live feed with score rings, Auto/Manual buttons | Jobs stream in with no duplicates; buttons gate correctly |
| **F4 — Apply Center** | Autopilot levels, active runs, review queue, answer bank, risk notice | Level 2 review → approve → status updates in the tracker |
| **F5 — Tracker & Gmail** | Table/kanban, timeline, Gmail panel, needs-review inbox, rejection notes | Every automatic status change shows its source and evidence |
| **F6 — ATS Targets** | Title search, grouped companies, filters | Grouped results render quickly and honestly state the registry scope |
| **F7 — Interview Prep & Copilot** | Practice mode, Live Copilot web client, history; desktop shell package | Mic enabled once → continuous question/answer cards; reconnect works; no audio stored client-side |
| **F8 — Polish** | Accessibility audit, performance budget, i18n, PWA, empty-state and copy pass | Keyboard-only run-through passes; Lighthouse accessibility ≥ 95 |

If a backend endpoint for a phase does not exist yet, build against MSW mocks that follow `PROJECT.md`, and list every mocked endpoint in `docs/frontend-audit.md` so backend work can match it.

---

## 9. How to deliver

- Output **complete, runnable files**, not pseudocode and not partial diffs. When editing an existing file, return the full updated file.
- Give single, copy-pasteable commands where possible (`npm install && npm run dev`).
- After each phase, report: files added/changed, what to run, what was mocked, what you could not verify, and the next step.
- Update `docs/frontend-audit.md` and, if a contract changed, propose the change to `PROJECT.md` rather than silently diverging.

---

## 10. Definition of done (every task)

1. Matches this document and `PROJECT.md`, or the document is updated in the same change.
2. Loading, empty, error, offline and disabled-with-reason states exist.
3. Keyboard accessible, visible focus, AA contrast, light and dark themes verified.
4. Types are strict; lint and type-check pass; tests added for logic and critical flows.
5. No secrets, tokens or personal data in logs, storage, URLs or the bundle.
6. Works at mobile width.
7. Copy follows the rules in Section 3.

## 11. Do-not list

- Do not rewrite working screens wholesale; migrate step by step and keep the app runnable.
- Do not add a dependency without a stated reason, and do not add a second library for something already covered.
- Do not store tokens or API keys in browser storage, and do not call AI or job providers directly from the browser.
- Do not hardcode model names, provider names or feature lists; read them from the API.
- Do not rely on the UI for security; the backend enforces roles and entitlements.
- Do not render model output or scraped HTML unsanitized.
- Do not show the same job twice, and do not label something "Submitted" unless the backend says it was.
- Do not build hide-from-screen-share, stealth, or detection-evasion features for the copilot.
- Do not use the generic look listed in Section 3.
