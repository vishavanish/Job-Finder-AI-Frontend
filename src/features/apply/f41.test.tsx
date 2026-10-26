/**
 * F4.1 against the MSW mocks: the AI form reader on a job card (chip, the
 * inline opt-in with its notice), a three-page run (page journey, a question
 * half-way, "Reading the next page…", screenshots in a lightbox, AI help),
 * test mode (copy answers + "I submitted it", never Approve), submit when
 * test mode is off, and the settings card. Plus the new kit pieces.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { PageJourney, ProgressRing, StatePill } from "../../components/KitExtras";
import { f4Db, settingsFor } from "../../mocks/f4State";
import { renderApp, signIn } from "../../test/renderApp";

const GENERIC_JOB = "Full-stack Engineer (React/FastAPI)";

async function runSearch() {
  const user = await signIn();
  await user.click(await screen.findByRole("button", { name: "Run search" }));
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2100);
  await screen.findByText(/Search finished/);
  return user;
}

function card(title: string) {
  return screen.getByRole("link", { name: title }).closest("li.job-card") as HTMLElement;
}

async function tick(times = 2, ms = 3100) {
  for (let i = 0; i < times; i += 1) await vi.advanceTimersByTimeAsync(ms);
}

function allowLevel2(extra: Partial<ReturnType<typeof settingsFor>> = {}) {
  Object.assign(settingsFor("u_demo"), {
    level: 2,
    risk_accepted_at: "2026-10-19T08:00:00Z",
    ...extra,
  });
}

describe("Kit pieces", () => {
  it("state pill, progress ring and page journey say what they show in text", () => {
    render(
      <>
        <StatePill status="awaiting_input" />
        <ProgressRing used={2} max={5} label="AI form reader" />
        <PageJourney
          label="Form pages"
          nodes={[
            { key: "1", label: "Page 1", state: "done" },
            { key: "2", label: "Page 2", state: "current" },
            { key: "s", label: "Submit", state: "todo" },
          ]}
        />
      </>,
    );
    expect(screen.getByText("Needs your input").closest(".kit-state")).toHaveAttribute(
      "data-group",
      "attention",
    );
    expect(
      screen.getByRole("img", { name: "AI form reader: 2 of 5 used today" }),
    ).toBeInTheDocument();
    const journey = screen.getByRole("list", { name: "Form pages" });
    expect(within(journey).getByText(/Page 1/)).toHaveTextContent("Page 1 — read");
    expect(within(journey).getByText(/Page 2/)).toHaveTextContent("Page 2 — reading now");
    expect(within(journey).getByText(/Submit/)).toHaveTextContent("Submit — not yet");
  });
});

describe("AI form reader on a job card", () => {
  it("shows the chip and turns the reader on inline, notice first, then starts the run", async () => {
    allowLevel2();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const job = card(GENERIC_JOB);
      expect(within(job).getByText("AI form reader")).toBeInTheDocument();
      await user.click(within(job).getByRole("button", { name: "Auto apply" }));
      const optIn = await within(job).findByRole("group", { name: /Turn on the AI form reader/ });
      expect(within(optIn).getByText(/never signs in or creates accounts/i)).toBeInTheDocument();
      const turnOn = within(optIn).getByRole("button", { name: "Turn on and apply" });
      expect(turnOn).toBeDisabled();
      await user.click(within(optIn).getByLabelText("I understand and accept this"));
      await user.click(turnOn);
      await waitFor(() => expect(settingsFor("u_demo").allow_generic).toBe(true));
      await tick(3);
      expect(
        await within(job).findByRole("link", { name: "Open — it needs you" }),
      ).toBeInTheDocument();
      expect([...f4Db.runs.values()][0]).toMatchObject({ adapter: "generic" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Three-page AI form reader run", () => {
  async function openRun() {
    renderApp("/jobs");
    const user = await runSearch();
    const job = card(GENERIC_JOB);
    await user.click(within(job).getByRole("button", { name: "Auto apply" }));
    await tick(3);
    await user.click(await within(job).findByRole("link", { name: "Open — it needs you" }));
    expect(await screen.findByRole("heading", { name: GENERIC_JOB })).toBeInTheDocument();
    return user;
  }

  it("walks the pages, asks half-way, and in test mode hands Submit to you", async () => {
    allowLevel2({ allow_generic: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = await openRun();
      const journey = screen.getByRole("list", { name: "Form pages" });
      expect(within(journey).getByText(/Page 1/)).toHaveTextContent("— read");
      expect(within(journey).getByText(/Page 2/)).toHaveTextContent("— read");
      expect(screen.getByText("We read 2 pages of this form")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Answer 1 question below" })).toBeInTheDocument();

      await user.type(screen.getByLabelText("Why Tessellate? *"), "Your design system.");
      await user.click(screen.getByRole("button", { name: "Save answers" }));
      expect(await screen.findByText("Reading the next page…")).toBeInTheDocument();
      await tick(5);
      expect(await screen.findByText("We read 3 pages of this form")).toBeInTheDocument();

      // Page groups, AI help and the screenshots.
      expect(screen.getByRole("heading", { name: "Page 3" })).toBeInTheDocument();
      expect(screen.getByText(/Looked at the page/)).toHaveTextContent(
        "Looked at the page 3 times",
      );
      await user.click(await screen.findByRole("button", { name: "Open Page 2" }));
      const box = await screen.findByRole("dialog", { name: "Page 2" });
      expect(within(box).getByRole("img", { name: "Page 2" })).toBeInTheDocument();
      await user.click(within(box).getByRole("button", { name: "Close" }));

      // Test mode: no Approve; copy + open the job page, then say what happened.
      expect(screen.getByText("Test mode")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Copy answers & open the job page" }));
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("jobs.ashbyhq.com"),
        "_blank",
        "noopener,noreferrer",
      );
      await user.click(screen.getByRole("button", { name: "I submitted it" }));
      expect(await screen.findByText("Submitted by you")).toBeInTheDocument();
      expect([...f4Db.runs.values()][0]!.state).toBe("done");
    } finally {
      open.mockRestore();
      vi.useRealTimers();
    }
  }, 30000);

  it("submits after approval when test mode is off", async () => {
    allowLevel2({ allow_generic: true });
    f4Db.genericSubmit = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = await openRun();
      await user.type(screen.getByLabelText("Why Tessellate? *"), "Your design system.");
      await user.click(screen.getByRole("button", { name: "Save answers" }));
      await tick(5);
      await user.click(
        await screen.findByRole("button", { name: "Approve 1 AI answer and submit" }),
      );
      await tick(3);
      expect(await screen.findByText(/We'll track replies/)).toBeInTheDocument();
      expect(await screen.findByRole("img", { name: "Confirmation page" })).toBeInTheDocument();
      expect([...f4Db.runs.values()][0]!.state).toBe("submitted");
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});

describe("Apply settings: AI form reader card", () => {
  it("needs level 2, shows its notice, and says when it is in test mode", async () => {
    renderApp("/apply?tab=settings");
    await signIn();
    const reader = await screen.findByRole("switch", { name: /Use the AI form reader/ });
    expect(reader).toBeDisabled();
    expect(screen.getByText(/Turn on Review & submit first/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Sites it covers" })).toHaveTextContent(
      "SmartRecruiters",
    );
    expect(screen.getByText("Test mode — you press Submit")).toBeInTheDocument();
  });

  it("turns on after the notice is accepted", async () => {
    allowLevel2();
    renderApp("/apply?tab=settings");
    const user = await signIn();
    await user.click(await screen.findByRole("switch", { name: /Use the AI form reader/ }));
    const dialog = await screen.findByRole("dialog", { name: "Turn on the AI form reader?" });
    expect(
      within(dialog).getByText(/less reliable than the Greenhouse and Lever/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("I understand and accept this"));
    await user.click(within(dialog).getByRole("button", { name: "Turn on the AI form reader" }));
    expect(await screen.findByText("AI form reader is on.")).toBeInTheDocument();
    expect(settingsFor("u_demo").allow_generic).toBe(true);
    expect(screen.getByRole("switch", { name: /Use the AI form reader/ })).toBeChecked();
  });
});
