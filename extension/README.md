# Job Finder (browser extension)

Saves the jobs on the **Naukri, Foundit, Glassdoor, LinkedIn or Indeed** page you are looking at into
Job Finder AI, and fills **LinkedIn Easy Apply** when you start Fast apply in the app. Plans: backend
`docs/plans/P8a-browser-extension.md` (E1, saving jobs) and `docs/plans/P8b-fast-apply-extension.md`
(E3a, Fast apply).

- One button at the bottom right: **Save N jobs to Job Finder**. "Save automatically" is per site and off
  by default.
- It reads only what the page already shows (job cards, JSON-LD). It never clicks, scrolls, opens tabs,
  solves captchas, or reads cookies or other sites. Only title, company, place, posted and the job link
  (plus the description on a job's own page) are sent.
- Saved jobs appear in your next Job Search as the source **"Saved from your browser"**.

## Fast apply (LinkedIn Easy Apply)

1. In Job Finder click **Fast apply** on a LinkedIn job (accept the one-time notice). The job opens in a new tab.
2. The extension clicks **Easy Apply** once, then fills each page as it appears from your profile and saved
   answers. Questions it can't answer show in a small panel at the bottom left; your answer is saved for
   next time. A required resume upload gets your Job Finder resume (the tailored one when it's ready).
3. **You** check each page and click **Next** and **Submit**. The extension never clicks them.
4. When LinkedIn says the application was sent, the job is marked applied in Job Finder.

It does nothing on a LinkedIn job you didn't start Fast apply for. Turn it off in Job Finder → Apply
settings → Fast apply.

## Fill this form (any site)

On any application form — Workday after you sign in, Naukri, a company's own form — click the extension
icon → **Fill this form**, or press **Alt+Shift+F**. It fills what Job Finder knows (profile, saved answers,
your resume for a required upload) and asks the rest in the panel; you check and submit. Press it again on
each new page. It only runs on the tab where you press it (the browser's "active tab" permission). Search-style dropdowns (Greenhouse, location pickers) are listed in the panel for you to pick — typed text there would not count.

When an Auto apply run stops for you (a sign-in page, a captcha, test mode), **Open and fill in my
browser** on the run's page opens the form; Fill this form then uses that run's answers, and the run is
marked applied when the page says the application was received.

## Install (no store needed)

1. Download this folder (or the zip from the app) and unzip it.
2. Chrome: open `chrome://extensions` · Edge: `edge://extensions`.
3. Turn on **Developer mode**, click **Load unpacked**, pick this `extension` folder.
4. In Job Finder: **Settings → Browser extension → Get a code**. Click the extension icon, type the 6 digits,
   **Connect**.

To disconnect: the extension's **Disconnect** button forgets it in this browser; **Settings → Browser
extension → Disconnect** removes it from your account.

## Files

| File                                 | Job                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `manifest.json`                      | Manifest V3: the job sites it runs on, the Job Finder API host                      |
| `content.js`                         | The on-page button; loads `src/reader.js`                                           |
| `assist.js`                          | Fast apply panel on LinkedIn job pages; loads `src/linkedin_apply.js`               |
| `src/linkedin_apply.js`              | Opens Easy Apply once, fills each page, reports LinkedIn's confirmation (tested)    |
| `fill_page.js`, `src/page_fill.js`   | Fill this form: injected on the button / shortcut; finds the main form (tested)     |
| `src/fill_core.js`, `src/panel.js`   | One page's filling (shared), the on-page panel                                      |
| `src/formreader.js`, `src/filler.js` | Read form fields (port of the backend's reader) and fill them like a person would   |
| `src/reader.js`                      | Reads jobs from a page (pure functions, tested in `src/reader.test.js` with Vitest) |
| `background.js`                      | The only part that calls the API: pairing, saves; keeps the capture-only token      |
| `popup.*`                            | Connect with the code, saved counts, auto-save switches, disconnect                 |

## Publishing

Edge Add-ons is free; the Chrome Web Store needs a one-time US$5 developer account. Zip the folder
contents (manifest at the zip root) to upload.
