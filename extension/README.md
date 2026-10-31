# Job Finder capture (browser extension)

Saves the jobs on the **Naukri, Foundit, Glassdoor, LinkedIn or Indeed** page you are looking at into
Job Finder AI. Plan: backend `docs/plans/P8a-browser-extension.md` (E1).

- One button at the bottom right: **Save N jobs to Job Finder**. "Save automatically" is per site and off
  by default.
- It reads only what the page already shows (job cards, JSON-LD). It never clicks, scrolls, opens tabs,
  solves captchas, or reads cookies or other sites. Only title, company, place, posted and the job link
  (plus the description on a job's own page) are sent.
- Saved jobs appear in your next Job Search as the source **"Saved from your browser"**.

## Install (no store needed)

1. Download this folder (or the zip from the app) and unzip it.
2. Chrome: open `chrome://extensions` · Edge: `edge://extensions`.
3. Turn on **Developer mode**, click **Load unpacked**, pick this `extension` folder.
4. In Job Finder: **Settings → Browser extension → Get a code**. Click the extension icon, type the 6 digits,
   **Connect**.

To disconnect: the extension's **Disconnect** button forgets it in this browser; **Settings → Browser
extension → Disconnect** removes it from your account.

## Files

| File            | Job                                                                                 |
| --------------- | ----------------------------------------------------------------------------------- |
| `manifest.json` | Manifest V3: the job sites it runs on, the Job Finder API host                      |
| `content.js`    | The on-page button; loads `src/reader.js`                                           |
| `src/reader.js` | Reads jobs from a page (pure functions, tested in `src/reader.test.js` with Vitest) |
| `background.js` | The only part that calls the API: pairing, saves; keeps the capture-only token      |
| `popup.*`       | Connect with the code, saved counts, auto-save switches, disconnect                 |

## Publishing

Edge Add-ons is free; the Chrome Web Store needs a one-time US$5 developer account. Zip the folder
contents (manifest at the zip root) to upload.
