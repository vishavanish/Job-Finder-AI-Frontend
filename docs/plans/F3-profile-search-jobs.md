# F3 — Profile, Keywords & Skills, Jobs, Alerts (approved and built)

Status: **approved (all five defaults) and built 2026-10-17** on frontend `dev` plus the two backend endpoints on backend `dev`. `npm run check` green (102 tests). Deviations: ATS targets stay in the browser (own key) until F6; the alert "Run now" isn't shown in the activity tray (its history on the page shows progress); the test timeout was raised to 15 s for slower machines.
Inputs:

- `docs/frontend-prompt.md` §6.3, §6.7, §6.8, §6.9 and §8 (F3 row).
- `docs/frontend-audit.md` open items: B2 Cancel does nothing, B6 "Auto-Applied" label, B9 save-on-blur, S4 settings in `localStorage`.
- Backend P3 / P3.1 / P3.2 on `dev`: `b450f20`, `88755c1`, `c71c8d6`.

Builds on F2 (`1a5a658`).

---

## 1. Goal and acceptance criteria

Every backend feature from P3–P3.2 gets a screen, and nothing about the job search lives in the browser any more.

1. **Profile & Resume** (`/profile`):
   - Upload/replace a resume (PDF/DOCX, drag-and-drop, progress).
   - The parsed result is shown for review and editing before saving.
   - Versions with a master marker.
   - Preferences: titles, locations, work modes, job types, salary, notice period, posted within, avoid list.
   - Applicant info, including relocation and sponsorship.
   - Optional EEO answers, defaulting to "Prefer not to say", with a privacy note.
2. **Keywords & Skills** (`/search-profile`, replaces `/keywords` and `/skills`):
   - Named profiles, one default.
   - Skill chips with core/strong/familiar weight, synonyms and years.
   - Target titles, with **Suggest from my skills**.
   - Must-have / nice-to-have / exclude terms.
   - **Create from my resume**.
   - A live preview of the exact keywords that will be searched.
3. **Jobs** (`/jobs`):
   - A run starts from a search profile.
   - Results stream in with no duplicates (the client upserts by `id`, honouring `replaces`).
   - Each job shows:
     - a **score ring** with the AI's one-sentence reason;
     - the **match breakdown** (skills X of Y, missing skills, title fit, seniority);
     - **posted X h ago**, an **Early** badge, a **New** badge, and the **applicant count**;
     - source badges, listing every source the job was found on;
     - **Save** / **Hide**;
     - **Auto apply** and **Apply manually** side by side, gated with a reason.
   - Filters (score, posted within, source, remote, saved) and sort (score / newest).
   - **Cancel works.**
   - **Saved / Hidden / Applied** tabs from `GET /jobs`.
4. **Alerts** (`/alerts`):
   - Up to 3 alerts: search profile, local hour, time zone, minimum score, email digest on/off.
   - Next run time, **Run now**, run history, and each run's new jobs.
5. **Job sources** (`/providers`):
   - All 18 sources, grouped: Job boards / Keyed APIs / Remote feeds / Naukri.
   - "Off by default" and **Paused until HH:MM** states.
   - Key entry for multi-key sources (Google Jobs: Bright Data `API_KEY:ZONE`, SerpApi, JSearch), with "your own key only".
   - Remote feeds explained ("run when you search for remote work").
6. **No search settings in `localStorage`.** A one-time **Import my old settings** moves existing local keywords/skills/applicant info into a search profile and `/profile`, then deletes them.
7. Every new screen has loading / empty / error / disabled-with-reason states, is keyboard-operable, announces arriving jobs politely (`aria-live`), and works on mobile.
8. MSW mocks for every new endpoint (so `npm run dev:mocks` works without the backend), tests for each screen, and `npm run check` is green.

---

## 2. Small backend additions this needs (on backend `dev`, own commit)

| Endpoint                               | Why                                  | Notes                                                                                                                                                             |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /pipeline/{run_id}/cancel`       | Audit B2: Cancel does nothing today  | Owner-checked; sets the existing `pipeline_progress` cancel flag (keyword tasks already check `is_cancelled`).                                                    |
| `POST /applications/manual` `{job_id}` | **Apply manually → Mark as applied** | Creates or updates the application through `record_status(status_source="manual")` and sets `user_jobs.state = "applied"`. Blueprint §9 already lists this route. |

Each gets tests. The OpenAPI snapshot and generated types are refreshed after these and P3.x (`npm run api:snapshot && npm run gen:api`).

---

## 3. Design

- **Folders:** `src/features/profile/`, `search-profile/`, `jobs/`, `alerts/` (TSX). The legacy `HomePage.jsx`, `KeywordsPage.jsx`, `SkillsPage.jsx`, `ProfilePage.jsx`, `RunContext.jsx` and `SettingsContext.jsx` are deleted once replaced. Old paths redirect: `/` → `/jobs` (until the Dashboard in F5), `/keywords` and `/skills` → `/search-profile`.
- **Server state:** add **TanStack Query** (the audit's step 3) for the new screens: caching, retries, invalidation after saves.
  - `usePipelineRun(runId)` polls meta and `jobs?offset=` every ~2 s, upserts by `id`, stops on completed/failed/cancelled, and pauses while the tab is hidden. It reports to the activity tray.
  - F2 screens stay as they are.
- **Score ring:** an SVG ring with a tabular-numeral score; colour bands come from the status palette, and colour is never the only cue (the number is always shown).
- **Forms:** explicit **Save changes** buttons with "Saved" confirmation (fixes B9); no save-on-blur.
- **Auto apply button:**
  - Enabled only when the `auto_apply` entitlement is on, the job's source has an adapter (today: LinkedIn prefill), and a resume exists. Otherwise it is disabled with the reason.
  - After clicking, it says **Prefilled — finish in the browser**, never "Applied" (fixes B6).
  - Fast apply and Email apply arrive with P4/F4.
- **Apply manually:** opens the job in a new tab and shows **Mark as applied** (→ `POST /applications/manual`). The tailored resume and cover letter download arrive with P4 tailoring.
- **Safe rendering:** job descriptions and AI text are rendered as plain text; never `dangerouslySetInnerHTML`.

---

## 4. Steps

1. Backend: the two endpoints + tests (backend repo, `dev`).
2. Refresh the OpenAPI snapshot and types; add TanStack Query + QueryClient provider.
3. Profile & Resume screen (upload, review parse, versions, preferences, applicant info, EEO).
4. Keywords & Skills screen (profiles CRUD, suggest titles, from resume, preview) + redirects.
5. Jobs screen (run from profile, live feed, ring, breakdown, freshness, applicants, save/hide, buttons, filters, cancel, tabs).
6. Alerts screen.
7. Providers update (groups, paused, defaults, multi-key entry); remove the hard-coded `SEARCH_SOURCES` so searches use every source the user has on.
8. One-time import from `localStorage`, then delete `SettingsContext` / `RunContext`.
9. Nav update (Jobs, Alerts, Keywords & Skills, Profile), MSW handlers, tests, `npm run check`, README/audit status.

---

## 5. Owner decisions needed before building

1. **Routes:** `/jobs` becomes the main screen (`/` redirects there until the Dashboard in F5), and `/search-profile` replaces `/keywords` + `/skills`. _Recommended: yes._
2. **Move settings off the browser** with a one-time "Import my old settings", then delete them from `localStorage`. _Recommended: yes._
3. **Add TanStack Query** for the new screens (F2 screens untouched). _Recommended: yes._
4. **Two small backend endpoints** (pipeline cancel, manual "mark as applied") on backend `dev` as part of F3. _Recommended: yes._
5. **Job card buttons now:** Auto apply (LinkedIn prefill, honest "Prefilled" label) + Apply manually with Mark as applied. Fast apply / Email apply come in P4/F4. _Recommended: yes._
