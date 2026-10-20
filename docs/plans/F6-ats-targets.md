# F6 — ATS Targets: title search across company career pages, grouped by company (built)

Status: **approved 2026-10-20 (all defaults; decision 1 = wait for P6) and built** on frontend `dev` against backend P6 (in the backend working tree, uncommitted at the time) with generated types. `npm run check` green; checked in the browser against the mocks (search → grouped results → filters folded on a phone → job details → Apply… with the F4 buttons).

Deviations from this plan, following the real P6 API:

- **Platform filter is multi-select** (`platform` repeats in the query); the API client now sends arrays as repeated keys.
- `POST /ats/jobs/{id}/track` returns only `job_id`; the details dialog then reads `GET /apply/options/{job_id}`. `GET /ats/jobs/{id}` already says `job_id` when the job was tracked before.
- `POST /ats/companies` answers `201` with the company and `created`; a new company's jobs appear after its first crawl, and the dialog says so. Errors (`ats_unsupported`, `ats_private_host`, …) are shown as the server words them.
- Results show **matching and open job counts** (`matching_jobs`, `open_jobs`) and the AI/synonym **expansions** ("also searched: …").
- Job details open in a **dialog** (the shared `Dialog`), not a drawer. **Apply…** is its own step; Save doesn't reveal the apply buttons.
- The admin page also has **platform on/off** (`PATCH /admin/ats/platforms/{platform}`), which P6 added.
- `SettingsContext` and the legacy page are gone; the old targets are kept through the search-profile import (`keepLegacyTargets`) until the one-time F6 import.

Inputs:

- `docs/frontend-prompt.md` §6.6 (ATS Target Discovery), §8 (F6 row: "Grouped results render quickly and honestly state the registry scope").
- Backend plan `job_finder_api/docs/plans/P6-ats-discovery.md` (approved 2026-10-19, **not built yet**): registry, crawler, index, `GET /ats/search` grouped by company, live top-up, `company_ats` pipeline source. Its §3.6 is the API contract this plan builds against.
- Legacy screen being replaced: `src/pages/AtsTargetsPage.jsx` (`/ats-targets`). It keeps a list of platform + slug "targets" in `localStorage` (`job_finder_ats_targets_v1`) that nothing ever searches.

Builds on F5 (`df41f2a`).

---

## 1. Goal and acceptance criteria

The user types a job title and sees every company in the shared registry hiring for it, grouped by company, with honest scope and a way to act on each job.

1. **One prominent input: job title.**
   - Quick picks from the user's search-profile titles (chips under the box), so a search is one click.
   - Enter or **Search** runs it; the query and filters live in the URL (`/ats-targets?q=data+engineer&platform=greenhouse`), so Back, refresh and links work.
2. **Honest scope line** under the box, from the response's `registry`:
   - "Searching **3,142 companies** · **128,400 open jobs** on 13 career-page platforms · refreshed 2 hours ago."
   - **What's covered** opens a small panel from `GET /ats/stats`: companies and jobs per platform, and the sentence "This is every company in our registry, not every company on the internet. Add one that's missing."
3. **Results grouped by company** (page of 25, **Load more**):
   - company card: name, **platform badge** (Greenhouse, Lever, Workday, Recruitee, Ashby, SmartRecruiters, Workable, Personio, Breezy, Teamtailor, Rippling, Gem, Homerun, BambooHR, SuccessFactors, Oracle), careers page link, **N matching jobs**, locations, newest posted date;
   - the **top 3 matching jobs**: title, location, remote badge, posted ("3 days ago"), **Applied** badge when the user already applied;
   - **Show all N jobs** expands the card with `GET /ats/companies/{id}/jobs?q=`.
   - Summary line: "42 companies · 117 jobs match 'data engineer'".
4. **Filters** (in the URL): platform, location (text), remote only, posted within (any / 24 h / 3 / 7 / 14 / 30 days), **hide jobs I applied to** (on by default). Filters re-run the search; **Clear filters** resets them.
5. **Live top-up** when the index has few matches (the response carries `topup_task_id`):
   - a polite progress line "Checking up to 40 more companies live — new results appear as they come in", also listed in the **activity tray**;
   - polls `GET /tasks/{id}` every 2 s (stops after 30 s, when the tab is hidden, or when the task finishes), then re-runs the search and announces "Found 6 more companies" (`aria-live`).
6. **Job actions** (each job row):
   - **Open job page** (new tab, `rel="noopener noreferrer"`);
   - **Details**: a drawer with the full description from `GET /ats/jobs/{id}` (fetched on demand, plain text — never HTML from the career page);
   - **Save** and **Apply…**: `POST /ats/jobs/{id}/track` creates the normal job row once, then Save uses `POST /jobs/{id}/save` and Apply… opens the existing F4 apply buttons (Manual / Auto / Email, with the backend's reasons) for that job. Auto apply then works for Greenhouse and Lever jobs exactly as in Jobs.
7. **Add a company** (dialog): careers page URL, or platform + company slug.
   - `POST /ats/companies`; shows the server's answer ("Added — 37 open jobs", "Already in the registry", "Couldn't find a job board at that address"); rate-limit message for the 10-per-hour cap.
   - Note in the dialog: "Companies you add are shared with everyone — only their public job list is stored."
8. **Your old saved targets:** if `job_finder_ats_targets_v1` holds companies, a one-time card offers **Add these 5 companies to the registry** (one `POST /ats/companies` each, results listed), then the local copy is deleted (decision 6).
9. **States:**
   - before searching: the input, quick picks and the scope line (no empty table);
   - loading: skeleton company cards;
   - no matches: "No companies in the registry are hiring for 'x' right now" + **Add a company** + (when top-up ran) "We also checked N companies live";
   - error with retry; 429 rate limit ("You've searched a lot this minute — try again in a moment");
   - entitlement `ats_discovery` off: the existing `RequireFeature` page with the reason.
10. **Job sources page:** the new `company_ats` source ("Company career pages") gets its own group with a line saying its jobs come from the ATS registry and a link to `/ats-targets`.
11. **Admin** (admin only, `/admin/ats`, decision 7):
    - registry table from `GET /admin/ats/companies` (search, platform filter, active / switched off, jobs, last crawl, last error);
    - switch a company on/off (`PATCH`), **Crawl now** (`POST …/crawl`);
    - health from `GET /admin/ats/health` (index size against the 300k cap, crawl errors, switched-off slugs).
12. Every screen works with the keyboard and on a phone (company cards stack; filters fold into a **Filters** disclosure). MSW mocks for every endpoint below; tests for each screen; `npm run check` green.

---

## 2. Backend endpoints used (backend P6 — planned, not built)

| Screen       | Endpoints                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search       | `GET /ats/search?q=&platform=&location=&remote=&posted_within_days=&hide_applied=&page=` → `{groups[], total_companies, total_jobs, registry, topup_task_id?}` |
| Company jobs | `GET /ats/companies/{id}/jobs?q=`                                                                                                                              |
| Job details  | `GET /ats/jobs/{id}`, `POST /ats/jobs/{id}/track`, then existing `POST /jobs/{id}/save`, `GET /apply/options/{job_id}`, the F4 apply calls                     |
| Scope        | `GET /ats/stats`                                                                                                                                               |
| Add company  | `POST /ats/companies`                                                                                                                                          |
| Top-up       | existing `GET /tasks/{id}`                                                                                                                                     |
| Admin        | `GET/PATCH /admin/ats/companies`, `POST /admin/ats/companies/{id}/crawl`, `GET /admin/ats/health`                                                              |
| Quick picks  | existing `GET /search-profiles`                                                                                                                                |

**Contract details P6 §3.6 leaves open** — the mocks assume these; the backend should return them (or the frontend adjusts when P6 lands):

1. Each job in `groups[].jobs` carries `id`, `title`, `location`, `remote`, `posted_at`, `url` and **`applied`** (bool), so the Applied badge works without a second call.
2. Each group carries `company_id`, `name`, `platform`, `careers_url`, `match_count`, `locations[]`, `newest_posted_at`.
3. `POST /ats/companies` answers `201 {company, status: "added" | "exists", job_count}` after the probe, or `422 {code: "ats_not_found"}`; if the probe has to be asynchronous, `202 {task_id}` and the dialog polls.
4. `POST /ats/jobs/{id}/track` returns the canonical job (`UserJobOut`, with `apply_options`).
5. `GET /tasks/{id}` for the top-up task ends with `{status: "completed", result: {companies_checked, jobs_added}}`.

When P6 lands: refresh the OpenAPI snapshot, regenerate types, replace the hand-written types in `lib/api/types.ts` with the generated ones, and fix any field that differs.

---

## 3. Design

- **Folder:** `src/features/ats/` (TSX):
  - `atsApi.ts` (typed calls + query keys);
  - `AtsTargetsPage.tsx` (input, quick picks, scope line, filters, results, load more);
  - `CompanyCard.tsx` (top jobs, expand to all jobs), `AtsJobRow.tsx` (actions);
  - `JobDetailsDrawer.tsx` (full description, Save, Apply…);
  - `AddCompanyDialog.tsx`, `LegacyTargetsCard.tsx`, `CoverageDetails.tsx` (`/ats/stats`);
  - `useTopUp(taskId)` (poll `/tasks/{id}`, activity tray entry);
  - `platforms.ts` (labels and badge text);
  - `ats.css`.
- `src/features/admin/AdminAtsPage.tsx` + nav item **ATS registry** under _AI & sources_ (admin only).
- **Server state:** TanStack Query. The search is keyed by `(q, filters, page)`; pages are combined with `useInfiniteQuery`; results are kept for 10 minutes like the backend cache. Tracking a job invalidates `/jobs` and the job's apply options.
- **Apply reuse:** the drawer renders the existing `ApplyButtons` (F4) for the tracked job, so Manual / Auto / Email apply, the prep dialog and the reasons behave exactly as on the Jobs page.
- **Safe rendering:** company names, titles, locations and descriptions are plain text. Descriptions come as text from the backend; if a platform returns HTML, the backend strips it — the frontend never uses `dangerouslySetInnerHTML`. Careers links render only for `http(s)` URLs.
- **Legacy cleanup:** delete `src/pages/AtsTargetsPage.jsx`; `SettingsContext.jsx` keeps only the read of `job_finder_ats_targets_v1` used by the one-time import, then the context itself goes (it holds nothing else).
- **No new dependencies.**

---

## 4. Steps

1. Hand-written types for the P6 contract (§2) in `lib/api/types.ts`, clearly marked "until P6 is in the OpenAPI snapshot".
2. `atsApi.ts`, `platforms.ts`; MSW mocks `src/mocks/f6.ts` + `f6State.ts` (≈ 40 companies over 13 platforms, ≈ 200 jobs, synonyms for a few titles, a top-up task that adds 3 companies after 2 polls, add-company outcomes, admin data), registered in `src/mocks/all.ts` and reset in `src/test/setup.ts`. The pipeline mock gets the `company_ats` source.
3. ATS Targets page: input, quick picks, scope line + coverage panel, filters in the URL, grouped results, load more, all states.
4. Company card expand, job rows, details drawer, track → Save / Apply… with the F4 buttons.
5. Live top-up hook + activity tray entry.
6. Add company dialog; legacy targets import card; remove the legacy page and the settings context.
7. Job sources "Company career pages" group; admin ATS registry page.
8. Tests (`src/features/ats/f6.test.tsx`), `npm run check`, browser check with the `frontend-mocks` preview, `docs/frontend-audit.md` (mocked endpoints + contract details), this plan's status line.

---

## 5. Risks

| Risk                                                        | Mitigation                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| P6 isn't built, so the contract may change                  | Hand-written types in one place, mocks follow §2, a short list of assumptions (§2) for the backend; refresh types when P6 lands |
| The "< 3 s" target can only be proven with the real index   | F6 shows skeletons at once and keeps results 10 min; speed is checked in the browser against the real API after P6              |
| Users read the results as "every company on the internet"   | Scope line on every search + coverage panel + empty state that says what was searched                                           |
| Top-up polling never ends or runs in the background forever | 30 s cap, stops when hidden or finished, one task at a time                                                                     |
| Career-page HTML in descriptions                            | Plain text only; links limited to http(s)                                                                                       |
| A user adds junk or internal URLs                           | The backend's SSRF guard and probe decide; the dialog only shows the server's answer; rate limit message for the cap            |
| Many companies on a phone                                   | Cards stack, top 3 jobs only until expanded, filters folded                                                                     |

---

## 6. Owner decisions needed before building

1. **Build F6 now against MSW mocks** that follow P6 §3.6 (plus the five details in §2), and switch to generated types when backend P6 is built — rather than waiting for P6. _Recommended: yes (same approach the prompt allows; the screens are ready when the backend is)._
2. **Route and nav:** keep `/ats-targets` and the nav label **ATS targets** (under Search setup → move to **Workspace**, next to Jobs, since it's a search screen now). _Recommended: yes, move it to Workspace._
3. **Filters and query in the URL**, page of 25 companies with **Load more** (no numbered pages). _Recommended: yes._
4. **"Hide jobs I applied to" on by default.** _Recommended: yes._
5. **Job actions: Open, Details, Save, Apply…** — Save and Apply… first call `POST /ats/jobs/{id}/track`, then reuse the Jobs page behaviour and the F4 apply buttons. _Recommended: yes._
6. **One-time import of the old local targets** into the shared registry (the user clicks to confirm; then the local copy is deleted and `SettingsContext` goes). _Recommended: yes._
7. **Admin ATS registry page** (`/admin/ats`: companies, on/off, crawl now, health) in F6, rather than later. _Recommended: yes — admins need it to keep the registry healthy._
8. **Live top-up shown in the activity tray** and polled for up to 30 s. _Recommended: yes._
9. **Quick picks from search-profile titles** under the input. _Recommended: yes._
