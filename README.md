# Job Finder — Frontend (React + Vite)

Red-and-white themed frontend for the Job Finder FastAPI backend.

## Run it

```bash
npm install
npm run dev
```

Opens on **http://localhost:5173**. The dev server proxies `/api/*` to
`http://localhost:8000` (see `vite.config.js`) — start the FastAPI backend
first (`uvicorn app.main:app --reload --port 8000`).

## Pages

- **Login** (`/login`) — red/white themed sign-in. No backend auth endpoint
  exists yet, so this creates a local session only; wire `LoginPage.jsx`'s
  `handleSubmit` to a real `POST /auth/login` when one exists.
- **Dashboard shell** — vertical left nav:
  - **Run & Results** (home `/`) — runs `POST /api/v1/pipeline/run`
    (search + score together), polls the task, and lists ranked jobs live
    with an **Apply** button per row (opens the job URL and triggers
    `POST /api/v1/apply` to pre-fill LinkedIn Easy Apply where possible).
  - **Keywords** (`/keywords`) — edit search keywords, locations, results
    limit, max posting age.
  - **Skills & Resume** (`/skills`) — skills, career targets, resume
    summary, scoring thresholds — feeds `POST /api/v1/score`.
  - **ATS Targets** (`/ats-targets`) — add/remove Greenhouse / Lever /
    SmartRecruiters / custom company targets — feeds
    `POST /api/v1/company-ats/fetch`.
  - **Providers** (`/providers`) — toggle LinkedIn / Indeed / Naukri on/off
    for the search's `sources` field.
  - Bottom of nav: **profile** (links to `/profile` — applicant info used
    for Easy Apply pre-fill) and **Logout**.

## State

All dynamic pipeline settings (keywords, skills, ATS targets, providers,
resume, thresholds, applicant info) live in `SettingsContext` and persist to
`localStorage`, so they survive refreshes and are assembled into the right
request shape in `HomePage.jsx`'s `buildPipelinePayload()` before calling
the API. No settings are hardcoded — every field maps 1:1 to a request
field on the backend.

## Notes

- Update `vite.config.js`'s proxy target if your backend runs somewhere
  other than `localhost:8000`.
- Auth is a local-only stub — add real auth before deploying publicly.
- `npm run build` produces a static `dist/` you can serve behind any
  static host (Nginx, Vercel, S3+CloudFront, etc).
