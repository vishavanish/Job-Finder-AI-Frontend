# Frontend audit and migration plan

Phase F0 of [frontend-prompt.md](frontend-prompt.md). Written 2026-10-15 against `main`
at `da3a8de` plus the owner's uncommitted `API_URL` change. Backend contracts were read
from `job_finder_api/CLAUDE.md` (the spec calls it `PROJECT.md`) §6.1, §6.4, §7.1, §7.11, §9
and the OpenAPI schema of backend branch `phase-1-identity` at `b5c4eea`.

Contents: [1 Stack](#1-stack) · [2 Baseline run](#2-baseline-run) ·
[3 Screens](#3-screen-inventory) · [4 API calls](#4-api-calls) · [5 Problems](#5-problems) ·
[6 What F0 changed](#6-what-f0-changed) · [7 Mocked endpoints](#7-mocked-endpoints) ·
[8 Contract gaps](#8-contract-gaps-proposed-for-projectmd) · [9 Migration plan](#9-migration-plan) ·
[10 Not verified](#10-not-verified)

---

## 1. Stack

| Concern       | Found before F0                                                           | After F0                                                                                                |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Build         | Vite 5.4, `@vitejs/plugin-react` 4                                        | Vite 8.3, plugin-react 6 (see 2.3 for why)                                                              |
| Language      | Plain JS/JSX, no `tsconfig`                                               | TypeScript 5.9 `strict`, `allowJs` so `.jsx` screens keep working. New code is `.ts/.tsx`.              |
| UI            | React 18.3                                                                | unchanged                                                                                               |
| Routing       | react-router-dom 6.26, `BrowserRouter`, all routes eager                  | unchanged (v7 upgrade and lazy routes are later steps)                                                  |
| Server state  | Hand-written polling in `RunContext` and pages                            | unchanged; TanStack Query arrives with the first rebuilt screen (step 3)                                |
| Client state  | Three React contexts: Auth, Settings (persisted to `localStorage`), Run   | Auth rewritten in TS; added Theme and Activity contexts                                                 |
| HTTP          | axios instance, `API_URL` constant edited by hand per environment         | one `fetch` client (`src/lib/api/client.ts`); axios removed                                             |
| Auth storage  | JWT and user JSON in `localStorage`                                       | access token in memory; refresh via httpOnly cookie                                                     |
| Styling       | One 776-line `src/index.css`, red/white palette, emoji icons, system font | design tokens (`src/styles/tokens.css`), light + dark, IBM Plex Sans/Mono self-hosted, inline SVG icons |
| Components    | `ChipEditor` only                                                         | + `Icon`, `StatusBadge`, app shell, activity tray                                                       |
| Tests         | none                                                                      | Vitest 5 + React Testing Library + MSW 2 (50 tests)                                                     |
| Lint / format | none                                                                      | ESLint 9 (typescript-eslint, react-hooks, jsx-a11y), Prettier 3                                         |
| CI            | none (Vercel builds on push)                                              | GitHub Actions: lint, format, type-check, generated-types drift, tests, build, bundle size summary      |
| Env           | none (`vite.config.js` proxy only)                                        | `.env.development`, `.env.production`, `.env.mocks`, `.env.example`                                     |
| Deploy        | Vercel, SPA rewrite in `vercel.json`                                      | unchanged                                                                                               |

Folder layout now follows spec §4 where new code lives (`src/app`, `src/lib`, `src/styles`,
`src/mocks`, `src/components`). The old `src/pages` and `src/context` stay where they are
until each screen is rebuilt in `src/features/<name>/`.

## 2. Baseline run

Run on Windows 11, Node 24.16, npm 11.13, before any change.

### 2.1 `npm install`

Worked (dependencies were already present). `npm audit`: **6 vulnerabilities, 3 high**
(axios, source-map-js, vite/esbuild) and 3 moderate (react-router / react-router-dom).

### 2.2 `npm run dev`

Started in ~430 ms, served the app, no console errors on load. The app then needs the
backend on `127.0.0.1:8000` (owner's local edit) or the production URL; without one, every
call fails.

### 2.3 `npm run build`

Worked in 2.4 s: JS 245.7 kB (80.8 kB gzip), CSS 10.8 kB. No warnings.

After F0: JS 212.2 kB (67.9 kB gzip) — axios is gone; CSS 24.6 kB; fonts add four woff2
files (~86 kB, latin subset only, cached). `npm audit`: **2 moderate** (react-router-dom 6,
fixed only by v7 — see step 4 of the plan; the open-redirect part is mitigated by
`safeRedirectPath`).

Why Vite moved from 5 to 8: adding a test runner on Vite 5 means Vitest 3, whose current
releases carry two critical advisories (tinypool prototype pollution, `@vitest/mocker` path
traversal) plus Vite's own high-severity dev-server advisories. Vitest 5 needs Vite ≥ 6.4.
The config is small, the build output and dev server behave the same, and all checks pass.

## 3. Screen inventory

| Route           | File                                                         | What it does                                                                                                                                                                                                                                                                                    | Data                                                    |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `/login`        | `pages/LoginPage.jsx`                                        | Email + password sign-in and register toggle                                                                                                                                                                                                                                                    | `POST /auth/login`, `/auth/register`                    |
| `/`             | `pages/HomePage.jsx` + `context/RunContext.jsx`              | "Run job search": streams results (`POST /pipeline/run/stream`, then `GET /pipeline/{run_id}/jobs?offset=N` every 2 s), shows score, reason, source; per job **Apply** (opens URL) and **Auto-Apply** (LinkedIn only: `POST /apply`, polls the task), Cancel apply, Mark as applied; Cancel run | Settings context                                        |
| `/applications` | `pages/ApplicationsPage.jsx`                                 | Paginated history (20/page) with status, source, View, Mark applied                                                                                                                                                                                                                             | `GET /applications`, `PATCH /applications/{id}`         |
| `/keywords`     | `pages/KeywordsPage.jsx`                                     | Keywords and locations (chips), results per keyword, max age                                                                                                                                                                                                                                    | `localStorage` only                                     |
| `/skills`       | `pages/SkillsPage.jsx`                                       | Skills, career targets, resume summary, scoring thresholds                                                                                                                                                                                                                                      | `localStorage` only                                     |
| `/ats-targets`  | `pages/AtsTargetsPage.jsx`                                   | Add/remove company ATS targets (platform + slug / custom URL)                                                                                                                                                                                                                                   | `localStorage` only — nothing calls `company-ats/fetch` |
| `/providers`    | `pages/ProvidersPage.jsx`                                    | LinkedIn / Indeed / Naukri switches                                                                                                                                                                                                                                                             | `localStorage` only                                     |
| `/profile`      | `pages/ProfilePage.jsx`                                      | Account name/email (read-only), applicant info for Easy Apply, Logout                                                                                                                                                                                                                           | `localStorage`                                          |
| layout          | `pages/DashboardLayout.jsx` → replaced by `app/AppShell.tsx` | Sidebar nav, profile link, Logout                                                                                                                                                                                                                                                               | —                                                       |

## 4. API calls

All under `/api/v1`. "main" = exists on backend `main` (what production runs). "P1" = only on
`phase-1-identity`.

| Helper (`src/api/client.ts`)                   | Endpoint                                       | Used by                                                       | Backend                |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `loginUser`                                    | `POST /auth/login`                             | AuthContext                                                   | main                   |
| `registerUser`                                 | `POST /auth/register`                          | AuthContext                                                   | main                   |
| — (lib client)                                 | `POST /auth/refresh`                           | AuthContext bootstrap, 401 retry                              | P1                     |
| — (lib client)                                 | `POST /auth/logout`                            | sign out                                                      | P1                     |
| `startPipelineStream`                          | `POST /pipeline/run/stream`                    | RunContext.runStream                                          | main                   |
| `getPipelineRunJobs`                           | `GET /pipeline/{run_id}/jobs?offset=`          | RunContext.runStream                                          | main                   |
| `getPipelineRun`                               | `GET /pipeline/{run_id}`                       | unused                                                        | main                   |
| `runPipeline`                                  | `POST /pipeline/run`                           | RunContext.run (unused path)                                  | main                   |
| `startApply`                                   | `POST /apply`                                  | HomePage                                                      | main                   |
| `getTask` / `pollTask`                         | `GET /tasks/{id}`                              | HomePage, RunContext                                          | main                   |
| `cancelTask`                                   | `POST /tasks/{id}/cancel`                      | HomePage, RunContext                                          | main                   |
| `closeApplyBrowser`                            | `POST /apply/{id}/close`                       | RunContext (not wired to UI)                                  | **missing on backend** |
| `listApplications`                             | `GET /applications`                            | ApplicationsPage, HomePage                                    | main                   |
| `getApplication`                               | `GET /applications/{id}`                       | unused                                                        | main                   |
| `updateApplicationStatus`                      | `PATCH /applications/{id}`                     | ApplicationsPage, HomePage                                    | main                   |
| `startSearch`, `startScore`, `fetchCompanyAts` | `POST /search`, `/score`, `/company-ats/fetch` | unused                                                        | main                   |
| ~~`health`~~                                   | ~~`GET /api/v1/health`~~                       | removed: unused, and the backend serves `/health` at the root | —                      |

## 5. Problems

Status: **fixed** = done in F0; otherwise the plan step that fixes it.

### 5.1 Security and privacy

| #   | Problem                                                                                                                                                                                                                                                    | Status                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| S1  | Access JWT (7-day) stored in `localStorage` — readable by any injected script                                                                                                                                                                              | **fixed**: memory only; old keys deleted on startup (`purgeLegacySessionStorage`)                                    |
| S2  | User object stored in `localStorage`                                                                                                                                                                                                                       | **fixed**                                                                                                            |
| S3  | API URL switched by editing source (`client.js`), easy to ship the localhost URL                                                                                                                                                                           | **fixed**: `VITE_API_BASE_URL`                                                                                       |
| S4  | Applicant info (name, email, phone), resume summary and search settings stored in `localStorage` by `SettingsContext`; also shared between accounts on the same browser                                                                                    | **fixed** in F3: on the server; one-time import, then deleted (ATS targets stay local until F6)                      |
| S5  | Post-login redirect took `location.state.from` as-is; react-router 6 has an open-redirect advisory (GHSA-wrjc-x8rr-h8h6)                                                                                                                                   | **mitigated**: `safeRedirectPath`; full fix with react-router 7 (step 4)                                             |
| S6  | 3 high-severity npm advisories                                                                                                                                                                                                                             | **fixed**; 2 moderate remain (S5)                                                                                    |
| S7  | No Content-Security-Policy or other security headers on Vercel                                                                                                                                                                                             | step 9                                                                                                               |
| S8  | Refresh cookie is `SameSite=None` on `jobfinderai.duckdns.org` while the app is on `*.vercel.app` → it is a **third-party cookie**. Safari (ITP) and browsers with third-party cookies blocked will drop it, so those users are signed out on every reload | step 8: serve the API same-site (Vercel rewrite `/api/*` → backend, `VITE_API_BASE_URL` empty)                       |
| S9  | Rotating refresh token + reuse detection: two tabs refreshing at once with the same cookie would look like theft and revoke every session                                                                                                                  | **fixed** in the client: single-flight per tab + Web Lock across tabs. Backend grace window still worth adding (8.7) |

### 5.2 Bugs

| #   | Problem                                                                                                                                                                                                | Status                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| B1  | `POST /apply/{id}/close` is called but not implemented on the backend                                                                                                                                  | open — 8.3                                                      |
| B2  | Cancel on a streaming run calls `POST /tasks/{run_id}/cancel`; a run id is not a task id, so since backend P0 it returns 404, and HomePage only logs to the console — **Cancel silently does nothing** | **fixed** in F3 (`POST /pipeline/{run_id}/cancel`, Stop search) |
| B3  | After Auto-Apply, HomePage finds the application id by scanning the first 20 applications for the URL; misses older rows and duplicates by alias URL                                                   | open — 8.5, F4                                                  |
| B4  | Streaming loop stopped only on `completed`/`failed`; a `cancelled` run (e.g. user disabled by admin) was polled forever                                                                                | **fixed**                                                       |
| B5  | Errors whose `detail` is an object (e.g. `account_disabled`) were put straight into React state → React throws "Objects are not valid as a React child"                                                | **fixed**: `errorMessage()`                                     |
| B6  | "✓ Auto-Applied" label appears as soon as the apply task is dispatched, though the flow only opens/prefills and never submits                                                                          | **fixed** in F3: "Prefilled — finish in the browser"            |
| B7  | Old README says auth is a local stub                                                                                                                                                                   | **fixed** (README rewritten)                                    |
| B8  | `RunContext.run()` (non-streaming) and several helpers are dead code                                                                                                                                   | open — removed when RunContext is replaced (step 3)             |
| B9  | Keyword/skill/threshold inputs save on blur with no confirmation; a number field cleared to empty silently saves the default                                                                           | **fixed** in F3: explicit Save changes + "Saved"                |

### 5.3 Duplicated code

- Error-message extraction (`err.authError || err.rateLimitError || err?.response?.data?.detail || err.message`) repeated 12 times → **fixed**: one `errorMessage()`.
- Three polling loops (`pollTask`, the stream loop in RunContext, per-job apply polling in HomePage), no backoff, no pause when the tab is hidden → step 3 (`useTaskPolling`, `usePipelineRun`).
- Apply state kept twice: RunContext (`applyTaskId`, `applyStatus`) and HomePage (five per-URL maps) → F4.
- Status coloring in two ad-hoc functions (`scoreClass`, `statusTone`) → **fixed** for Applications with `StatusBadge`; scores get the score ring in F3.
- Sign-out in the sidebar and on Profile → Profile's button goes away in F3.

### 5.4 Accessibility

| Problem                                                                                  | Status                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Inputs had `outline: none`; focus visible only as a border tint                          | **fixed**: global `:focus-visible` ring                                                     |
| Emoji nav icons read aloud; no landmarks; no skip link                                   | **fixed** in the shell                                                                      |
| Toggle switches: zero-size checkbox, no visible focus                                    | **fixed** (input covers the slider; focus ring) — accessible name still missing (F2)        |
| `<label>` elements not linked to inputs on Login, Keywords, Skills, Profile, ATS targets | open — each screen's rebuild (lint rule is relaxed for legacy files only)                   |
| Run progress and arriving jobs not announced                                             | partly fixed: activity tray announces finished/failed work politely; feed `aria-live` in F3 |
| Login error not announced                                                                | **fixed** (`role="alert"`)                                                                  |
| Raw backend statuses shown (`easy_apply_form_filled_awaiting_review`)                    | **fixed** on Applications (`StatusBadge` with icon + sentence-case label)                   |
| Tables: no captions, empty action header, horizontal scroll on mobile                    | F3/F5 rebuilds                                                                              |
| `autoFocus` on login, all-caps tracked labels                                            | caps **fixed** in CSS; autofocus revisited in F1                                            |

### 5.5 Missing states

No screen has skeletons, an error state with retry, an offline state, or disabled-with-reason
controls (Auto-Apply is hidden, not disabled with a reason, when a job has no adapter).
"Run a search to see matches" is shown even after a run that found nothing. These land per
screen in F1–F5 (spec §5.4); the shell already has an empty state for the activity tray and a
"Checking your session…" state while the session is restored.

### 5.6 Design

Red was both the brand color and the meaning of "Rejected/Failed", and decorative gradients,
orbs and uppercase labels went against spec §3. F0 replaced the palette with tokens (plum accent,
which is not a status hue) and removed the decoration via CSS; the screens' markup is unchanged.

## 6. What F0 changed

- **Audit**: this file.
- **Design tokens** (`src/styles/tokens.css`): 5 named base colors + graphite neutral scale,
  semantic surface/text/accent tokens, the spec §3 status palette (neutral, active, attention,
  progress, positive, negative, muted — fg/bg/border each), spacing, 5 radii, 4 elevations, type
  scale, motion (zeroed under `prefers-reduced-motion`), light and dark themes. Theme follows the
  system by default; the top-bar button cycles System → Light → Dark (remembered per browser;
  applied before first paint).
- **App shell** (`src/app/AppShell.tsx`): sidebar (grouped nav, account, sign out), top bar
  (location, activity tray, theme), mobile drawer with focus trap, skip link, focus moved to the
  content on navigation, page titles. Existing screens render unchanged inside it; their CSS now
  reads the tokens (`src/styles/screens.css`).
- **Activity tray** (`src/app/ActivityTray.tsx`, `activity.tsx`): lists streaming searches and
  Auto-Apply tasks with status, progress text and a link back; announces when something
  finishes.
- **API client** (`src/lib/api/client.ts`): base URL from `VITE_API_BASE_URL`; Bearer token
  from memory; `credentials: "include"`; on 401 one shared refresh (`POST /auth/refresh`) and
  one retry; on refresh failure the session ends ("Your session has ended…"); on 403
  `account_disabled` the user is signed out and the backend's message is shown on the sign-in
  screen; errors parsed from both `{code, message, details}` and FastAPI `{detail}` shapes;
  `Retry-After` exposed. `src/api/client.ts` keeps the old helper names for the existing screens.
  The owner's local `API_URL = "http://127.0.0.1:8000"` lives on as the dev proxy target
  (`DEV_API_PROXY_TARGET` in `.env.development`); production keeps
  `https://jobfinderai.duckdns.org` via `.env.production`.
- **Types**: `openapi/backend-openapi.json` (snapshot of `phase-1-identity` @ `b5c4eea`, dumped
  from `app.openapi()` without running the server) → `src/lib/api/schema.d.ts` via
  `openapi-typescript`; friendly aliases in `src/lib/api/types.ts`. The streaming pipeline routes
  have no response models, so those types are hand-written there (8.2). CI fails if the generated
  file drifts from the snapshot.
- **MSW** behind `VITE_USE_MOCKS=true` (`npm run dev:mocks`); the same handlers back the tests.
  The mock chunk and `mockServiceWorker.js` are left out of normal builds.
- **Quality**: ESLint (incl. a rule blocking direct `localStorage`/`sessionStorage` use outside
  `src/lib/storage.ts`), Prettier, `tsc --noEmit`, Vitest + RTL, `.github/workflows/ci.yml`,
  `.gitattributes` (LF everywhere, so Windows checkouts pass the format check).

## 7. Mocked endpoints

`VITE_USE_MOCKS=true` answers **every** call the app makes, so mock mode works with no backend.
Handlers: `src/mocks/handlers.ts`; data: `src/mocks/data.ts`.

| Endpoint                                                                     | Why mocked                               | Mock behavior                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST /auth/otp/request`                                                     | P1 only                                  | 202 + neutral message; 429 `otp_cooldown` + `Retry-After` within 60 s                         |
| `POST /auth/otp/verify`                                                      | P1 only                                  | code `123456`; else 400 `otp_invalid` (+`attempts_left`), `otp_locked` after 5, `otp_expired` |
| `POST /auth/google`                                                          | P1 only                                  | any non-empty `id_token` signs in the demo user                                               |
| `POST /auth/refresh`                                                         | P1 only                                  | succeeds while a mock session exists (user id kept in `sessionStorage`, mock only — no token) |
| `POST /auth/logout`                                                          | P1 only                                  | 204, ends mock session                                                                        |
| `GET /auth/me`                                                               | P1 only                                  | user + `entitlements` per feature (`enabled, max_level, quota_per_day, quota_remaining`)      |
| `GET /auth/me/entitlements`                                                  | P1 only                                  | list form with `source`, `used_today`                                                         |
| `POST /auth/login`, `POST /auth/register`                                    | on main; mocked so tokens are consistent | password `password123`; 409 on duplicate email                                                |
| `POST /pipeline/run/stream`, `GET /pipeline/{id}`, `GET /pipeline/{id}/jobs` | on main; mocked for offline UI work      | 6 sample jobs, 2 released per poll, then `completed`                                          |
| `POST /apply`, `GET /tasks/{id}`, `POST /tasks/{id}/cancel`                  | on main                                  | task completes on the 3rd poll; cancel of an unknown id → 404 like the backend                |
| `GET /applications`, `GET/PATCH /applications/{id}`                          | on main                                  | 6 seeded rows covering every status group                                                     |

Any authenticated mock request returns 401 without a valid mock token and 403
`account_disabled` for `disabled@jobfinder.test`.

F1 added the admin endpoints (backend `routes/admin.py`), same shapes and rules: `GET/POST
/admin/users`, `GET/PATCH /admin/users/{id}`, `POST /admin/users/{id}/enable|disable|revoke-sessions`,
`GET /admin/features`, `GET /admin/users/{id}/entitlements`, `PUT/DELETE
/admin/users/{id}/entitlements/{feature}`. Admins see everyone; `manager@jobfinder.test` sees only
`demo@jobfinder.test` (their team), can't add people or change roles.

F2 added the P2 endpoints (backend `routes/models.py`, `providers.py`, `admin_ai.py`) in
`src/mocks/ai.ts` (state and access rules in `src/mocks/aiState.ts`): `GET /models`,
`PUT /models/preferences`, `GET/POST/DELETE /keys`, `GET /usage`, `GET /providers`,
`PUT /providers/settings`, `/admin/models` (+ `/test`, `/defaults`), `/admin/keys`,
`/admin/providers`, `/admin/usage`, `/admin/users/{id}/usage`. `POST /pipeline/run/stream` applies
the source rules and returns `skipped_sources`. Seed: Gemini, Groq, Hugging Face (paused) free;
Claude Opus 5.5 paid; platform keys for gemini/groq/anthropic.

F3 added the P3–P3.2 and F3 endpoints in `src/mocks/f3.ts` (state in `src/mocks/f3State.ts`):
`GET/PUT /profile` (incl. sealed `eeo`), `GET/PUT /preferences`, `/resumes` (upload → `pending` →
`parsed` on the next list poll; review, master, re-parse, delete), `/search-profiles` (+
`/from-resume`, `/suggest-titles`), `GET /jobs?state=`, `POST /jobs/{id}/save|hide|seen`,
`POST /applications/manual`, `/alerts` (+ `/run-now`, `/runs`, `/runs/{id}/jobs`) and
`POST /pipeline/{id}/cancel`. The pipeline mock runs a search profile (404 for someone else's, 422
`resume_required` without a resume), returns jobs with match breakdown, freshness and applicant
count, skips jobs already seen unless `include_seen`, and appends one `replaces: true` entry.
The source list mirrors the backend's 18 sources (defaults, multi-key Google Jobs). Under jsdom an
uploaded file arrives named "blob"; the mock names it from its content type.

## 8. Contract gaps (proposed for PROJECT.md)

Not edited in the backend repo; listed here for the backend owner.

1. **Error body.** §9 promises `{code, message, details}`; the backend sends FastAPI
   `{detail: string}`, `{detail: {code, message}}` (account_disabled) and `{detail: [...]}` (422).
   The client accepts all of them. Proposal: one exception handler that emits the contract shape.
2. **Pipeline response models.** `POST /pipeline/run/stream`, `GET /pipeline/{id}` and
   `GET /pipeline/{id}/jobs` have no `response_model`, so OpenAPI types them as `unknown`.
3. **`POST /apply/{id}/close`** is called by the frontend but does not exist. Either add it or
   the frontend drops it (F4 replaces this flow with apply runs).
4. **Run cancel.** Add `POST /pipeline/{run_id}/cancel` (revoke the group); the UI has a Cancel
   button that cannot work today.
5. **Apply → application id.** `POST /apply` (or the task result) should return the
   `application_id` so the UI does not search by URL.
6. ~~**OTP errors.**~~ Done in F1 (backend `dev`): `otp_invalid` (with `attempts_left`),
   `otp_expired`, `otp_locked`, `otp_cooldown` (with `retry_after`), `otp_too_many_requests`.
7. **Refresh reuse grace.** Accept the previous refresh token for a few seconds after rotation,
   so a lost response or a slow second tab does not revoke every session (the client already
   serializes refreshes across tabs).
8. **`TaskStatus`** enum is `pending | running | completed | failed`; the UI also sees
   `cancelled`/`revoked` from cancel paths. Add them to the enum.

## 9. Migration plan

Each step ships on its own and leaves the app working. Steps 1–2 are F0.

1. **Foundation (done).** Tokens, shell, activity tray, single API client, generated types,
   MSW, tests, lint, CI. Screens unchanged apart from imports, error messages and status badges.
2. **Release order for the auth change.** The new client keeps tokens in memory, so after a
   reload it needs `POST /auth/refresh`, which only backend Phase 1 has. Against today's
   production backend, sign-in and all calls still work, but **every page reload signs the user
   out**. Recommended order:
   1. deploy backend Phase 1 with `ACCESS_TOKEN_EXPIRE_MINUTES=10080` (old frontend keeps working);
   2. deploy this frontend;
   3. set `ACCESS_TOKEN_EXPIRE_MINUTES=15`.
3. **Server state.** Add TanStack Query; build `useTaskPolling(taskId)` (backoff, cancel, states)
   and `usePipelineRun(runId)` (offset polling every ~2 s, append-only, stop on terminal status,
   pause when hidden). Move HomePage onto them and delete RunContext's loops. Report each
   long-running job to the activity tray from these hooks.
4. **Router.** Upgrade to react-router 7 (clears the remaining advisories) and lazy-load routes.
5. **F1 — Auth and admin.** OTP + Google sign-in screens, `useEntitlement`, `<RequireRole>`,
   Admin Users and Entitlements; Playwright smoke test for sign-in → disabled sign-out.
6. **Screen by screen (F2–F7).** Rebuild each screen in `src/features/<name>/` as TSX with all
   states (§5.4), remove it from `.prettierignore` and the legacy ESLint override, add tests, and
   redirect old paths (`/keywords` + `/skills` → `/search-profile`, `/applications` → `/tracker`).
7. **Settings off the browser.** Move keywords, skills, thresholds, providers and applicant info
   from `SettingsContext`/`localStorage` to the backend (`/preferences`, `/search-profiles`,
   `/profile`, `/providers/settings`); one-time import of existing local values, then delete them.
8. **Same-site API.** Add a Vercel rewrite `/api/:path*` → `https://jobfinderai.duckdns.org/api/:path*`
   and set `VITE_API_BASE_URL` empty in production, so the refresh cookie is first-party (5.1 S8).
   Needs the backend cookie and CORS settings checked for the new origin.
9. **Hardening (F8).** CSP and security headers in `vercel.json`, bundle budget enforced in CI,
   Lighthouse accessibility ≥ 95, keyboard-only pass.

## 10. Not verified

- **Real backend refresh flow.** No backend was running; the refresh/retry, logout and
  disabled-account paths are verified against MSW and unit tests only. Check against
  `phase-1-identity` locally (`npm run dev` with the API on :8000) before release, including the
  `Secure` cookie over `http://localhost` through the dev proxy.
- **Cross-site cookie in production** (5.1 S8) — needs a real deploy to confirm.
- **Vercel build** with Vite 8 — `npm run build` passes locally on Node 24 and CI uses Node 22;
  Vercel's Node version should be ≥ 20.19 (`engines` is set in `package.json`).
- **Screen readers.** Keyboard, focus and roles were checked in tests and the browser; no
  NVDA/VoiceOver pass yet.
- Contrast ratios were chosen to meet WCAG AA by calculation, not measured with a tool.
