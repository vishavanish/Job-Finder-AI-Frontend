/**
 * F7 screens against the MSW mocks (backend P7): Practice (setup → typed
 * and spoken answers → closing → feedback report), Live Copilot (notice
 * that can't be skipped, Start once, cards streaming, follow-up threads,
 * interrupt, controls, screenshot, reconnect keeps the cards, Stop →
 * debrief), history and delete, story bank with drafts, admin voice health,
 * and the privacy rules (no audio kept in the browser, no hide option).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { entitlementsFor, mockDb } from "../../mocks/data";
import { f7Db, mockCopilotSay, mockDropSocket } from "../../mocks/f7State";
import { renderApp, signIn } from "../../test/renderApp";

const cap = vi.hoisted(() => ({
  onFrame: null as null | ((channel: number, pcm: Int16Array) => void),
  opts: null as null | Record<string, unknown>,
  stopped: 0,
  fail: null as null | string,
}));

vi.mock("./audio/capture", async (importOriginal) => {
  const real = await importOriginal<typeof import("./audio/capture")>();
  return {
    ...real,
    tabAudioSupported: () => false,
    startCapture: vi.fn(
      async (opts: { onFrame: (c: number, p: Int16Array) => void; copilot?: boolean }) => {
        if (cap.fail) throw new real.CaptureError(cap.fail, "mic_denied");
        cap.onFrame = opts.onFrame;
        cap.opts = opts as unknown as Record<string, unknown>;
        return {
          micChannel: opts.copilot ? "mixed" : "user",
          hasTab: false,
          stop: () => {
            cap.stopped += 1;
            cap.onFrame = null;
          },
        };
      },
    ),
  };
});

const recorder = vi.fn();

beforeEach(() => {
  cap.onFrame = null;
  cap.opts = null;
  cap.stopped = 0;
  cap.fail = null;
  recorder.mockClear();
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = recorder;
});

afterEach(() => {
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
});

function demoId(): string {
  return mockDb.users.find((u) => u.email === "demo@jobfinder.test")!.id;
}

/** The answer box once the interviewer has finished asking. */
async function answerBox(): Promise<HTMLElement> {
  const box = screen.getByLabelText("Or type your answer");
  await waitFor(() => expect(box).toBeEnabled());
  return box;
}

/** "Speaks" for n frames of 40 ms on whatever channel the page's capture uses. */
function talk(frames: number) {
  const pcm = new Int16Array(640).fill(1200);
  for (let i = 0; i < frames; i += 1) cap.onFrame?.(cap.opts?.copilot ? 2 : 1, pcm);
}

describe("Practice", () => {
  it("runs a typed and spoken interview, then shows the feedback report", async () => {
    renderApp("/interview");
    const user = await signIn();
    expect(
      await screen.findByRole("heading", { name: "Interview prep", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Interview prep/ })).toHaveAttribute(
      "href",
      "/interview",
    );
    expect(await screen.findByText(/Free mode: Whisper Large v3 Turbo/)).toBeInTheDocument();
    // Seeded progress and recent sessions.
    expect(await screen.findByText("leadership")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Length"), "3");
    await user.type(screen.getByLabelText("Role"), "Backend Engineer");
    await user.click(screen.getByRole("radio", { name: /Technical Q&A/ }));
    await user.click(screen.getByRole("button", { name: "Start practice" }));

    expect(await screen.findByRole("heading", { name: "Practice interview" })).toBeInTheDocument();
    const start = await screen.findByRole("button", { name: "Start the interview" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    const captions = screen.getByRole("list", { name: "Captions" });
    const shows = (text: string) =>
      waitFor(() => expect(within(captions).getByText(text)).toBeInTheDocument());
    await shows("Hi, thanks for joining. Tell me about a project you led recently.");

    await user.type(await answerBox(), "I led the billing rewrite.");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    await shows("I led the billing rewrite.");
    await shows("What was the hardest decision in that project?");

    // Spoken answer: the mic's frames go up as binary on the user channel.
    await waitFor(() => expect(cap.onFrame).not.toBeNull());
    await answerBox();
    talk(50);
    await shows("I led the billing rewrite with three engineers.");
    expect(f7Db.framesReceived).toBeGreaterThanOrEqual(50);
    await shows("How do you handle disagreement with a teammate?");

    await answerBox();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(
      await screen.findByText(/Finished\. Your feedback is being prepared\./),
    ).toBeInTheDocument();
    expect(cap.stopped).toBeGreaterThan(0); // the mic stops when the session ends
    await user.click(screen.getByRole("link", { name: "See your feedback" }));
    expect(await screen.findByText(/this usually takes under a minute/)).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Good structure; add numbers to your results.",
        {},
        { timeout: 9000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Tell me about a project you led recently/ }),
    ).toBeInTheDocument();
    expect(recorder).not.toHaveBeenCalled();
  });

  it("explains a blocked mic and still takes typed answers", async () => {
    cap.fail = "Microphone access was blocked. Allow it in the address bar, then try again.";
    renderApp("/interview");
    const user = await signIn();
    await user.type(await screen.findByLabelText("Role"), "Analyst");
    await user.click(screen.getByRole("button", { name: "Start practice" }));
    expect(
      await screen.findByText(/Microphone access was blocked.*You can type your answers below/),
    ).toBeInTheDocument();
    const start = await screen.findByRole("button", { name: "Start the interview" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    await screen.findByText(/Tell me about a project you led recently/);
    await user.type(await answerBox(), "Typed.");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() =>
      expect(
        screen.getByText("What was the hardest decision in that project?"),
      ).toBeInTheDocument(),
    );
  });

  it("drills weak questions from a report", async () => {
    renderApp("/interview");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Drill these" }));
    expect(screen.getByText(/Drilling 1 question from earlier sessions/)).toBeInTheDocument();
  });
});

describe("Live Copilot", () => {
  it("is off by default and says why", async () => {
    renderApp("/interview/copilot");
    await signIn();
    expect(await screen.findByText("Live Copilot isn't available")).toBeInTheDocument();
  });

  it("sends the user back when the notice is declined", async () => {
    renderApp("/interview/copilot");
    entitlementsFor(demoId()).live_copilot!.enabled = true;
    const user = await signIn();
    const dialog = await screen.findByRole("dialog", { name: "Before you use Live Copilot" });
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(
      await screen.findByRole("heading", { name: "Interview prep", level: 2 }),
    ).toBeInTheDocument();
  });

  it("turns interviewer questions into cards, threads follow-ups, interrupts, and stops", async () => {
    renderApp("/interview/copilot");
    entitlementsFor(demoId()).live_copilot!.enabled = true;
    const user = await signIn();
    const dialog = await screen.findByRole("dialog", { name: "Before you use Live Copilot" });
    expect(within(dialog).getByText(/prohibit AI assistance/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "I understand" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByRole("radio", { name: /Tab audio \+ mic/ })).toBeDisabled(); // no tab audio in this browser
    expect(screen.getByRole("radio", { name: /Mic only/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Start" }));
    const panel = await screen.findByRole("region", { name: "Live Copilot" });
    expect(await within(panel).findByText("Listening")).toBeInTheDocument();
    expect(cap.opts).toMatchObject({ mic: true, tab: false, copilot: true });

    const cards = within(panel).getByRole("list", { name: "Questions" });
    mockCopilotSay("Tell me about a time you led a project.");
    expect(
      await within(cards).findByText("Tell me about a time you led a project."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(cards).getByText(/Shipped in six weeks/)).toBeInTheDocument(),
    );
    expect(within(panel).getByText("Heard")).toBeInTheDocument();

    mockCopilotSay("Why?");
    await waitFor(() => expect(within(cards).getByText("Why?")).toBeInTheDocument());
    expect(within(cards).getAllByRole("listitem")).toHaveLength(1); // the follow-up sits inside its question's card
    expect(within(cards).getByText("Follow-up")).toBeInTheDocument();

    mockCopilotSay("What is your notice period?", { slow: true });
    await within(cards).findByText("What is your notice period?");
    mockCopilotSay("Tell me about a time you failed.");
    await waitFor(() => expect(within(cards).getByText("interrupted")).toBeInTheDocument());
    await within(cards).findByText("Tell me about a time you failed.");

    // Controls on a card.
    const notice = within(cards)
      .getByText("What is your notice period?")
      .closest("li") as HTMLElement;
    await user.click(within(notice).getByRole("button", { name: "Shorter" }));
    await waitFor(() => expect(within(notice).getByText("- 30 days.")).toBeInTheDocument());
    await user.click(within(notice).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(within(notice).getByText("dismissed")).toBeInTheDocument());

    // Answer this: forces a card for the last thing said.
    mockCopilotSay("We use Kafka a lot here.");
    await user.click(within(panel).getByRole("button", { name: "Answer this" }));
    await waitFor(() =>
      expect(within(cards).getAllByText("We use Kafka a lot here.").length).toBeGreaterThan(0),
    );
    expect(within(cards).getByText("asked by you")).toBeInTheDocument();

    // Transparency: the panel can be made fainter but not invisible, and has no hide option.
    expect(within(panel).getByRole("slider")).toHaveAttribute("min", "40");
    expect(within(panel).queryByRole("button", { name: /hide/i })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Stop" }));
    expect(await screen.findByRole("link", { name: "See the debrief" })).toBeInTheDocument();
    expect(cap.stopped).toBeGreaterThan(0);
    expect(recorder).not.toHaveBeenCalled();
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i)!;
        // Copilot adds panel prefs only (the jf_* keys are the app's theme and the mock session).
        expect(key).toMatch(/^(copilot\.(opacity|pos)|jf_[a-z_]+)$/);
        expect(store.getItem(key)!).not.toMatch(/Tell me about|notice period/);
      }
    }
  });

  it("keeps the cards when the connection drops and comes back", async () => {
    renderApp("/interview/copilot");
    entitlementsFor(demoId()).live_copilot!.enabled = true;
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "I understand" }));
    await user.click(await screen.findByRole("button", { name: "Start" }));
    const panel = await screen.findByRole("region", { name: "Live Copilot" });
    await within(panel).findByText("Listening");
    const cards = within(panel).getByRole("list", { name: "Questions" });
    mockCopilotSay("What is your notice period?");
    await waitFor(() => expect(within(cards).getByText(/negotiable for/)).toBeInTheDocument());
    mockDropSocket();
    expect(await within(panel).findByText("Reconnecting…")).toBeInTheDocument();
    expect(await within(panel).findByText("Listening", {}, { timeout: 5000 })).toBeInTheDocument();
    process.stdout.write(`DBG ${cards.textContent ?? ""} END\n`);
    expect(within(cards).getByText("What is your notice period?")).toBeInTheDocument();
    expect(within(cards).getByText(/negotiable for/)).toBeInTheDocument();
    mockCopilotSay("Why?");
    expect(await within(cards).findByText("Why?")).toBeInTheDocument();
  });

  it("sends a screenshot as one coding question", async () => {
    renderApp("/interview/copilot");
    entitlementsFor(demoId()).live_copilot!.enabled = true;
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "I understand" }));
    await user.click(await screen.findByRole("button", { name: "Start" }));
    const panel = await screen.findByRole("region", { name: "Live Copilot" });
    await within(panel).findByText("Listening");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "problem.png", {
      type: "image/png",
    });
    fireEvent.change(within(panel).getByLabelText("Screenshot file"), {
      target: { files: [file] },
    });
    const cards = within(panel).getByRole("list", { name: "Questions" });
    expect(
      await within(cards).findByText("Solve the problem shown in this screenshot."),
    ).toBeInTheDocument();
    expect(within(cards).getByText("Coding")).toBeInTheDocument();
    await waitFor(() => expect(within(cards).getByText(/two pointers/)).toBeInTheDocument());
  });
});

describe("History, story bank and admin", () => {
  it("lists sessions, opens a copilot debrief, deletes one and then everything", async () => {
    renderApp("/interview/history");
    const user = await signIn();
    const copilot = await screen.findByRole("link", { name: "Live Copilot" });
    expect(screen.getByRole("link", { name: /Behavioral \(STAR\) practice/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Practice" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Live Copilot" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.click(await screen.findByRole("link", { name: "Live Copilot" }));
    void copilot;
    expect(
      await screen.findByText("An HR screening call focused on availability."),
    ).toBeInTheDocument();
    expect(screen.getByText("Weak topics: compensation")).toBeInTheDocument();
    expect(screen.getByText("What are your salary expectations?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete session" }),
    );
    expect(await screen.findByRole("heading", { name: "Interview history" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Live Copilot" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Delete all voice data" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Your story bank stays/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByText("No sessions yet.")).toBeInTheDocument();
  });

  it("reviews drafts, adds a story and drafts more from the resume", async () => {
    renderApp("/interview/stories");
    const user = await signIn();
    const review = await screen.findByRole("heading", { name: "Needs your review (1)" });
    expect(review).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Needs your review/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "In use (2)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add a story" }));
    const dialog = screen.getByRole("dialog", { name: "Add a story" });
    await user.type(within(dialog).getByLabelText("Title"), "Mentoring");
    await user.type(within(dialog).getByLabelText("Action"), "Paired weekly with two juniors.");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Mentoring" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Draft from my resume" }));
    expect(await screen.findByText(/Drafting stories from your resume/)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "API latency fix" }, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs your review (1)" })).toBeInTheDocument();
  });

  it("shows admins the voice health against the latency targets", async () => {
    renderApp("/admin/voice");
    await signIn("admin@jobfinder.test");
    expect(await screen.findByRole("heading", { name: "Voice health" })).toBeInTheDocument();
    expect(await screen.findByText(/First spoken word \(target ≤ 1\.5 s\)/)).toBeInTheDocument();
    expect(screen.getByText("whisper-large-v3-turbo")).toBeInTheDocument();
    expect(screen.getByText("HTTP 429 from speech endpoint")).toBeInTheDocument();
  });
});
