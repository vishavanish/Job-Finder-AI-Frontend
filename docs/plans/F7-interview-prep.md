# F7 — Interview Prep: Practice mode, Live Copilot web client, history, story bank

Status: **approved 2026-10-20 (all defaults) and built** on frontend `dev` against the real backend P7 contract (types regenerated from its OpenAPI; backend P7a `3294b39`, P7b `8e20a3c`). `npm run check` green (157 tests). Checked in the browser against the mocks (hub, practice by typing with the mic blocked, report, copilot off-state, notice, setup); live audio capture couldn't be exercised in the Browser pane.

Deviations from this plan, following the real P7 API:

- No hand-written types: the backend existed, so types come from the regenerated OpenAPI snapshot.
- `question.detected` carries `qtype` (not `type`); the client also handles `question.updated` and `answer.cancelled` reasons `restarted` / `regenerating` (both clear the answer).
- Mic-only copilot audio goes up on the `mixed` channel; "That was me" marks the user's speaker.
- Copilot asks for tab/mic access before creating the session (browsers only open the tab-share picker right after the click).
- In Practice the mic is held back while the interviewer speaks unless the user clearly talks over it (barge-in), so the browser's own voice is never sent as the answer.
- After a reconnect, an answer that was still streaming when the connection dropped keeps the text already shown, marked interrupted.
- Any closed socket stops the mic, not only `session.ended`.
  Inputs:

- `docs/frontend-prompt.md` §6.10 (Interview Prep), §7 (Live Copilot client: screen, audio capture, `useCopilotSocket`, overlay), §8 (F7 row: "Mic enabled once → continuous question/answer cards; reconnect works; no audio stored client-side").
- Backend plan `job_finder_api/docs/plans/P7-voice-prep.md` (**planned, not built**): its §2.6 (socket auth, binary frames, Practice events), §2.7 (acknowledgement) and §2.9 (endpoints) are the contract this plan builds against, plus CLAUDE.md §7.10 (copilot events, transparency rules).
- Today: `access.ts` already names `voice_prep` / `live_copilot`; `features/models/tasks.ts` lists `interview_chat` / `interview_eval`; `nav.ts` has no Interview item yet. No WebSocket code exists in the app.

Builds on F6 (`d75370f`).

---

## 1. Goal and acceptance criteria

1. **Interview Prep hub** (`/interview`, entitlement `voice_prep`): start a Practice session, recent sessions with scores, progress per skill area, "drill your weak questions", links to Live Copilot, Story bank and History.
2. **Practice setup → session → report:**
   - setup: job (from saved/applied jobs) or typed role, interview type, difficulty, length; the provider line from `GET /voice/providers` ("Free mode: browser voice, replies in about 1.5 s");
   - session (`/interview/practice/:id`): mic permission asked once; **live captions** for both sides (`aria-live="polite"`), a clear **Listening / Thinking / Speaking** indicator, mic level meter, **Pause**, **Repeat question**, **Skip**, **End**; barge-in (speaking over the interviewer stops its voice); browser TTS speaks sentence by sentence, or server audio plays when a paid voice is active;
   - report (`/interview/sessions/:id`): overall + per-answer scores, STAR parts present, filler words and pace, strengths, improvements, model answer (plain text), full transcript; "Feedback is being prepared" state while `pending`.
3. **Live Copilot** (`/interview/copilot`, entitlement `live_copilot`, off by default):
   - **first-use acknowledgement** dialog with the server's text and version; cannot be skipped or dismissed; **I understand** → `POST /voice/copilot/acknowledge`; shown again whenever the version changes;
   - setup: job/profile, answer style (bullets / short script / STAR), length, language, audio source (**Tab audio + mic** or **Mic only**), which hotkeys are active;
   - one **Start** → status chip (_Listening / Paused / Reconnecting / Ended_), a visible pulsing listening indicator, mic + tab level meters, a **feed of question cards**;
   - card: live question transcript, answer streaming into the same card, **Shorter · Expand · Regenerate · Copy · Dismiss**, "not sure" tag, "interrupted" mark; newest highlighted, older collapsed but scrollable; follow-ups threaded inside the parent;
   - controls: **Pause/Resume**, **Stop**, **Answer this**, **Send screenshot** (paste or pick an image), panel opacity/position;
   - after Stop: transcript, Q&A list, summary, weak topics, **Practice these questions** (creates a Practice session seeded with them).
4. **Audio capture (web):** mic via `getUserMedia` (echo cancellation on); tab audio via `getDisplayMedia({ video: true, audio: true })`, video track stopped at once; separate `interviewer` / `user` channels; **AudioWorklet** → 16 kHz mono PCM16, 40 ms binary frames with the P7 header; **bounded send queue** (≤ 2 s, drop oldest). No tab audio (Firefox/Safari, or the user didn't tick "Share tab audio") → **mic-only** `mixed` channel with a notice that detection is less precise.
5. **`useCopilotSocket` / `useVoiceSocket`:** first-message auth with the stream token, reconnect with backoff (fresh token via `POST /voice/sessions/{id}/token`), resume without losing visible cards, `answer.delta` buffered in a ref and flushed once per animation frame.
6. **Floating panel:** in-page draggable panel + **Document Picture-in-Picture** window where supported (Chrome/Edge), so the cards can sit beside the call. Always shows the listening indicator and a one-click Stop.
7. **History** (`/interview/history`): Practice and Copilot sessions (mode filter), date, duration, score, cost; open, delete one, **Delete all voice data** (confirmation spelling out the consequence); retention note ("Transcripts are kept 90 days, encrypted. Audio is never recorded.").
8. **Story bank** (`/interview/stories`): list/add/edit/delete STAR stories with skill tags; **Draft from my resume** (task + activity tray) → drafts shown as _Needs your review_ until approved. Linked from Profile and resume.
9. **No audio stored client-side:** no `MediaRecorder`, no Blob/IndexedDB/localStorage of audio or transcripts; tracks stopped and the worklet closed on Stop, unmount and route change. A test asserts it.
10. **Transparency (non-negotiable):** no hide-from-screen-share, stealth, click-through-invisible or detection-evasion option anywhere; opacity has a floor (40 %) so the panel never becomes invisible; the browser's own "sharing this tab" bar is never suppressed.
11. States everywhere: loading, empty, error with retry, permission denied (mic / tab audio, with how to fix), unsupported browser, entitlement off (`RequireFeature` with the reason), acknowledgement missing, cost cap reached, provider error (`retryable`), offline/reconnecting. Keyboard operable; works at phone width (Practice fully; Copilot shows a "best on desktop" note but works).
12. MSW mocks for every REST endpoint **and the two WebSockets** (MSW `ws` link with scripted scenarios); tests per screen; `npm run check` green.

---

## 2. Backend endpoints used (backend P7 — planned, not built)

| Screen           | Endpoints                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub / setup      | `GET /voice/providers`, `GET/PUT /voice/settings`, `GET /voice/progress`, `GET /voice/history?limit=5`, existing `GET /jobs?state=saved            | applied` |
| Start            | `POST /voice/sessions` → `{session, stream_token}`, `POST /voice/sessions/{id}/token` (reconnect)                                                  |
| Practice         | `WS /voice/sessions/{id}/stream`                                                                                                                   |
| Copilot          | `POST /voice/copilot/acknowledge`, `WS /voice/copilot/{id}/stream`                                                                                 |
| Report / history | `GET /voice/sessions/{id}`, `GET /voice/sessions/{id}/feedback`, `GET /voice/history`, `DELETE /voice/sessions/{id}`, `DELETE /voice/history`      |
| Story bank       | `GET/POST /story-bank`, `PUT/DELETE /story-bank/{id}`, `POST /story-bank/draft-from-resume` (+ `GET /tasks/{id}`), `POST /story-bank/{id}/approve` |
| Admin            | `GET /admin/voice/health` (admin page — decision 9)                                                                                                |

**Contract details the mocks assume** (the backend should match; otherwise the frontend adjusts when P7 lands):

1. Binary audio frame: byte 0 channel (0 interviewer, 1 user, 2 mixed), bytes 1–4 uint32 little-endian ms since start, then PCM16 LE.
2. `question.detected` carries `parent_id` for follow-ups and `type`; `answer.done` carries `not_sure`; `answer.cancelled.reason` ∈ `interrupted | dismissed | provider_error | restarted`.
3. On reconnect the server sends `session.resumed {turns[]}` before new events.
4. `GET /voice/providers` → `{stt:{name,tier,streaming}, tts:{name,tier,kind:"browser"|"server"}, llm:{fast,strong}, expected_first_word_ms, diarization}`.
5. Close codes `4401 / 4402 / 4403 / 4409 / 4429` map to the messages in §3.

When P7 lands: refresh the OpenAPI snapshot, regenerate types, replace the hand-written types, and re-check the socket events against the real server.

---

## 3. Design

- **Folder:** `src/features/interview/` (shared later by the desktop shell — prompt §7.4):
  - `voiceApi.ts` (typed REST calls + query keys);
  - `audio/` — `captureWorklet.ts` (AudioWorklet processor, loaded as a module URL), `resample.ts` (pure 48 k → 16 k downsampler + PCM16 encode, unit-tested), `useAudioCapture({mic, tab})` (permissions, tracks, levels, cleanup), `frames.ts` (header encode), `sendQueue.ts` (bounded, drop-oldest);
  - `socket/` — `useVoiceSocket` (auth, reconnect with backoff 0.5 → 8 s, heartbeats, close-code mapping), `copilotReducer.ts` (cards keyed by `question_id`, threads, states), `practiceReducer.ts`, `useRafBuffer` (delta batching);
  - `tts/` — `browserSpeaker.ts` (`speechSynthesis`, sentence queue, cancel on barge-in), `audioPlayer.ts` (server TTS chunks via `AudioContext`);
  - pages: `InterviewHubPage`, `PracticeSetup`, `PracticeSessionPage`, `SessionReportPage`, `CopilotPage` (setup + session), `CopilotAckDialog`, `QuestionCard`, `CopilotPanel` (in-page draggable + PiP host), `HistoryPage`, `StoryBankPage`, `ProgressChart` (plain SVG);
  - `interview.css`.
- **Routes:** `/interview`, `/interview/practice/:id`, `/interview/sessions/:id`, `/interview/copilot`, `/interview/history`, `/interview/stories`. Nav: **Interview prep** in _Workspace_ (feature `voice_prep`); Copilot is a tab inside it, gated by `live_copilot` with the reason.
- **Server state:** TanStack Query for REST; socket state in reducers (not the query cache). Ending a session invalidates history/progress; the report polls feedback every 3 s while `pending` (stops when hidden, max 2 min).
- **Document PiP:** `documentPictureInPicture.requestWindow()` on a user click; the panel is rendered into it with a React portal and copied stylesheets; falls back to the in-page panel. Same component either way.
- **Hotkeys (in-page only):** `Alt+Shift+A` answer this, `Alt+Shift+P` pause/resume, `Alt+Shift+S` stop, `Alt+Shift+H` collapse/expand the panel (never hide the listening indicator). Global hotkeys need the desktop shell.
- **Local storage:** only panel position/opacity/collapsed and last-used setup choices (try/catch). Never tokens, transcripts or audio.
- **Safe rendering:** questions, answers, model answers and feedback as plain text (answers keep line breaks and numbered points; no Markdown HTML). Copy uses the Clipboard API with plain text.
- **Captions and a11y:** captions are always on in Practice; streaming regions are `aria-live="polite"` with throttled announcements; reduced motion turns off the pulse animation but keeps a static "Listening" label.
- **No new dependencies.** MSW 2.15 already includes WebSocket mocking.

---

## 4. Steps

1. Hand-written types for the P7 contract (§2) in `lib/api/types.ts`, marked "until P7 is in the OpenAPI snapshot".
2. `voiceApi.ts`; MSW mocks `src/mocks/f7.ts` + `f7State.ts`: providers (free and paid variants), settings + ack version, sessions/history/feedback/progress, story bank + draft task, and **WebSocket scenarios** — Practice (question → answer → follow-up → end), Copilot (question → deltas → done; speculative restart; new question interrupts; follow-up thread; small talk ignored; not-sure; cost cap; provider error; drop + resume).
3. Audio layer: resampler, frame encoder, bounded queue (unit tests), worklet, `useAudioCapture` with tab-audio detection and mic-only fallback; level meters.
4. `useVoiceSocket` + reducers + rAF buffer; close-code and error mapping; reconnect/resume.
5. Practice: setup, session (captions, indicator, barge-in, browser TTS / server audio), report; hub with progress and recent sessions.
6. Copilot: acknowledgement dialog, setup, session feed, cards and actions, controls, hotkeys, screenshot paste/pick, in-page panel + Document PiP, after-Stop summary → "Practice these questions".
7. History (filter, delete one / all), story bank (CRUD, draft from resume, approve), Profile link; nav item; admin voice health page.
   - **AI models settings:** add labels for the new voice tasks in `features/models/tasks.ts` (`copilot_answer` "Live Copilot answers", `copilot_expand` "Live Copilot expand", `question_gate` "Question detection", `stt` "Speech to text", `tts` "Interview voice"), so users and admins can pick models per task — including the OpenRouter fallback and, later, OpenAI (ChatGPT) models, which appear from `GET /models` with no frontend change. The provider line in Practice/Copilot setup names the active provider and says when a fallback (e.g. OpenRouter) answered.
8. Tests (`src/features/interview/f7.test.tsx` + unit tests): gates and reasons, ack cannot be skipped and re-shows on version change, Start → cards loop from the mock socket, interrupted card, follow-up threading, reconnect keeps cards, cost-cap message, Stop releases tracks and closes the worklet, **no `MediaRecorder` / storage writes of audio or transcripts**, no stealth option in settings, opacity floor. `npm run check`, browser check with the `frontend-mocks` preview (mic permission in the pane), `docs/frontend-audit.md` (mocked endpoints + contract details), this plan's status line.

---

## 5. Risks

| Risk                                                                          | Mitigation                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P7 isn't built; socket details may change                                     | Hand-written types in one place; mocks follow P7 §2.6 + the five details in §2; refresh when P7 lands            |
| Tab audio only works in Chromium and only if the user ticks "Share tab audio" | Detect a missing audio track → explain in one line + mic-only fallback; setup shows browser support              |
| Echo: speakers feed the interviewer into the mic                              | `echoCancellation: true`; the setup recommends headphones; the server only answers the interviewer/mixed channel |
| Streaming re-renders make the feed janky                                      | Deltas buffered per animation frame; collapsed cards memoized; one highlighted card                              |
| Mic or worklet left running after leaving the page                            | One owner hook with cleanup on Stop/unmount/route change/`pagehide`; test checks tracks are stopped              |
| jsdom has no AudioWorklet / getDisplayMedia                                   | Pure functions tested directly; capture hook mocked in screen tests; real capture checked in the browser         |
| Users expect it to work hidden in a shared screen                             | Not built, by rule; the panel is plainly visible; the acknowledgement explains responsibility                    |
| Document PiP unsupported (Firefox/Safari)                                     | In-page panel is the default; PiP is an extra button only where supported                                        |

---

## 6. Owner decisions needed before building

1. **Build F7 against MSW mocks** (REST + WebSocket) that follow P7 §2.6/§2.9, right after P7 is approved, and switch to generated types when P7 is built. _Recommended: yes (same approach as F6)._
2. **Routes and nav:** `/interview` hub with tabs _Practice · Live Copilot · History · Story bank_; nav item **Interview prep** in _Workspace_. _Recommended: yes._
3. **Story bank lives in Interview prep** (`/interview/stories`) with a link from Profile and resume. _Recommended: yes — it is used by Practice and Copilot._
4. **Web overlay = in-page draggable panel + Document Picture-in-Picture**; the **Tauri desktop shell is F7.1** (with backend P7.1), reusing `features/interview`. _Recommended: yes._
5. **Audio source default:** _Tab audio + mic_ in Chrome/Edge, _Mic only_ elsewhere, with the precision notice; headphones recommended in setup. _Recommended: yes._
6. **Practice voice:** browser speech by default with a voice picker; server voices only when the backend says a paid TTS is active. _Recommended: yes._
7. **Hotkeys in-page only** (`Alt+Shift+A/P/S/H`); global hotkeys wait for the desktop shell. _Recommended: yes._
8. **Copilot screenshot = paste or pick an image** ("Send screenshot"); no automatic screen capture on web. _Recommended: yes (matches P7 decision 11)._
9. **Admin voice health page** (`/admin/voice`: sessions, p50/p95 per stage and provider, errors, spend) in F7. _Recommended: yes — it is how the latency targets are watched._
10. **Panel opacity floor of 40 %** and no option to hide the listening indicator. _Recommended: yes (transparency rules)._
11. **Progress charts in plain SVG**, no chart library. _Recommended: yes._
