# Job Finder — Frontend

React 18 + Vite + React Router. TypeScript is being adopted file by file (new code is
`.ts`/`.tsx`, older screens are still `.jsx`). Backend: the FastAPI app in
[Job-Finder-AI-Backend](https://github.com/vishavanish/Job-Finder-AI-Backend).

- Spec: [docs/frontend-prompt.md](docs/frontend-prompt.md)
- Current state, known problems, mocked endpoints and migration plan:
  [docs/frontend-audit.md](docs/frontend-audit.md)

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, /api proxied to http://127.0.0.1:8000
npm run dev:mocks    # no backend needed: every API call is answered by MSW
```

Mock sign-in: `demo@jobfinder.test` or `admin@jobfinder.test`, password `password123`
(or OTP code `123456`). `disabled@jobfinder.test` signs in and is then locked out, to
show the disabled-account flow.

## Configuration

| Variable               | Where                                 | Meaning                                                                                                           |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | `.env.development`, `.env.production` | Backend origin without `/api/v1`. Empty = same origin (dev proxy). Production: `https://jobfinderai.duckdns.org`. |
| `VITE_USE_MOCKS`       | `.env.mocks`                          | `true` serves the API from `src/mocks`.                                                                           |
| `DEV_API_PROXY_TARGET` | `.env.development`                    | Where the dev proxy sends `/api`. Not exposed to the browser.                                                     |

Override per machine in `.env.local` (git-ignored). Never put secrets in `VITE_*`
variables: they end up in the public bundle.

## Checks (same as CI)

```bash
npm run check        # lint, format check, type-check, tests, build
```

Individually: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
`npm run build`.

## API types

Types are generated from the backend's OpenAPI schema, committed as a snapshot in
`openapi/backend-openapi.json`:

```bash
npm run api:snapshot   # fetch from a running backend (OPENAPI_URL to override)
npm run gen:api        # regenerate src/lib/api/schema.d.ts
```

## Auth

The access token is kept in memory only. On a page reload the app calls
`POST /api/v1/auth/refresh`, which uses the backend's httpOnly `jf_refresh` cookie.
On a 401 the client refreshes once and retries; on `403 account_disabled` it signs
the user out with a message. See `src/lib/api/client.ts`.
