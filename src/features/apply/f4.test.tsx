/**
 * F4 screens against the MSW mocks: the four job-card buttons, the prep
 * dialog (Manual and Email apply), an Auto apply run from card to review to
 * submitted with a screenshot, Fast apply's hand-off, the Apply Center tabs
 * and nav badge, the answer bank and apply settings with the risk notice.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { mockDb } from "../../mocks/data";
import { f4Db, settingsFor } from "../../mocks/f4State";
import { renderApp, signIn } from "../../test/renderApp";

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

function allowLevel2() {
  Object.assign(settingsFor("u_demo"), { level: 2, risk_accepted_at: "2026-10-19T08:00:00Z" });
}

async function tick(times = 2, ms = 3100) {
  for (let i = 0; i < times; i += 1) await vi.advanceTimersByTimeAsync(ms);
}

describe("Job card apply buttons", () => {
  it("Email apply shows the draft, what the fact check removed, and records 'emailed'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const brightline = card("LLM Application Developer");
      await user.click(within(brightline).getByRole("button", { name: "Email apply" }));
      const dialog = await screen.findByRole("dialog", { name: /Email apply/ });
      expect(within(dialog).getByText(/this takes 10–40 seconds/)).toBeInTheDocument();
      await tick(2, 2100);
      expect(
        await within(dialog).findByText("careers@brightlinehealth.example"),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("link", { name: "Open in my email app" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^mailto:careers@brightlinehealth\.example\?subject=/),
      );
      expect(
        within(dialog).getByText(/Removed because it isn't in your resume/),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("Skill not in your resume: Kubernetes")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "I sent it" }));
      await waitFor(() => expect(within(brightline).getByText("Applied")).toBeInTheDocument());
      expect(mockDb.applications[0]).toMatchObject({
        company: "Brightline Health",
        status: "emailed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("Not interested in the manual dialog hides the job", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      await user.click(
        within(card("Software Engineer II, Data")).getByRole("button", { name: "Apply manually" }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("link", { name: "Open job page" }));
      await user.click(within(dialog).getByRole("button", { name: "Not interested" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("link", { name: "Software Engineer II, Data" }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("Auto apply without level 2 points to Apply settings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const gh = card("AI Engineer (LLM apps)");
      await user.click(within(gh).getByRole("button", { name: "Auto apply" }));
      expect(await within(gh).findByText(/Accept the auto-apply risk notice/)).toBeInTheDocument();
      expect(within(gh).getByRole("link", { name: "Open Apply settings" })).toHaveAttribute(
        "href",
        "/apply?tab=settings",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("Fast apply hands the LinkedIn form to the user and never says Submitted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const li = card("Senior Python Engineer");
      await user.click(within(li).getByRole("button", { name: "Fast apply" }));
      await tick(3);
      expect(await within(li).findByText("Needs you — finish on the job page")).toBeInTheDocument();
      expect(within(li).getByText(/click Submit yourself/)).toBeInTheDocument();
      expect(within(li).queryByText("Submitted")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Auto apply run", () => {
  it("goes from the card to review, answers, approval, submitted and a screenshot", async () => {
    allowLevel2();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const gh = card("AI Engineer (LLM apps)");
      await user.click(within(gh).getByRole("button", { name: "Auto apply" }));
      await tick(3);
      const open = await within(gh).findByRole("link", { name: "Open — it needs you" });
      await user.click(open);

      expect(
        await screen.findByRole("heading", { name: "AI Engineer (LLM apps)" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Needs your input")).toBeInTheDocument();
      const why = screen.getByLabelText("Why do you want to join us? *");
      expect(screen.getAllByText("Needs your answer").length).toBeGreaterThan(0);
      expect(screen.getByText("AI draft — check it")).toBeInTheDocument();
      expect(screen.getByText("Private (EEO) — never sent to AI")).toBeInTheDocument();

      await user.type(why, "Your mission.");
      await user.click(screen.getByRole("button", { name: "Save answers" }));
      expect(await screen.findByText(/Answers saved/)).toBeInTheDocument();
      await user.click(
        await screen.findByRole("button", { name: "Approve 1 AI answer and submit" }),
      );
      expect(await screen.findByText("Submitting")).toBeInTheDocument();
      await tick(3);
      expect(await screen.findByText(/^Submitted\. Thank you for applying/)).toBeInTheDocument();
      expect(await screen.findByRole("img", { name: "Confirmation page" })).toBeInTheDocument();
      const run = [...f4Db.runs.values()][0]!;
      expect(run.state).toBe("submitted");
    } finally {
      vi.useRealTimers();
    }
  }, 20000);
});

describe("Apply Center", () => {
  it("lists runs that need you, with a nav count, and cancels one", async () => {
    allowLevel2();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      await user.click(
        within(card("AI Engineer (LLM apps)")).getByRole("button", { name: "Auto apply" }),
      );
      await tick(3);
      await within(card("AI Engineer (LLM apps)")).findByRole("link", {
        name: "Open — it needs you",
      });

      await user.click(screen.getByRole("link", { name: /Apply Center/ }));
      expect(
        await screen.findByRole("tab", { name: "Needs you", selected: true }),
      ).toBeInTheDocument();
      const row = (await screen.findByText("Answer the questions it couldn't")).closest("li")!;
      expect(within(row).getByRole("link", { name: "AI Engineer (LLM apps)" })).toBeInTheDocument();
      expect(await screen.findByLabelText("1 needs you")).toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Cancel" }));
      expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
      await user.click(screen.getByRole("tab", { name: "History" }));
      expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answer bank: AI drafts first, approve, edit and add", async () => {
    renderApp("/apply?tab=answers");
    const user = await signIn();
    const draft = (
      await screen.findByText("How many years of Python experience do you have?")
    ).closest("li")!;
    expect(within(draft).getByText("AI draft — check it")).toBeInTheDocument();
    await user.click(within(draft).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(within(draft).getByText("Approved")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Question"), "What is your notice period?");
    await user.type(screen.getByLabelText("Your answer"), "30 days");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(await screen.findByText("What is your notice period?")).toBeInTheDocument();
  });

  it("settings: level 2 needs the risk notice; pause; hours", async () => {
    renderApp("/apply?tab=settings");
    const user = await signIn();
    await user.click(await screen.findByRole("radio", { name: /Review & submit/ }));
    const dialog = await screen.findByRole("dialog", {
      name: /Before you turn on Review & submit/,
    });
    expect(within(dialog).getByText(/can't be taken back/)).toBeInTheDocument();
    const turnOn = within(dialog).getByRole("button", { name: "Turn on Review & submit" });
    expect(turnOn).toBeDisabled();
    await user.click(within(dialog).getByLabelText("I understand and accept this"));
    await user.click(turnOn);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Review & submit/ })).toBeChecked(),
    );
    expect(settingsFor("u_demo").risk_accepted_at).not.toBeNull();
    expect(screen.getByRole("radio", { name: /Full auto/ })).toBeDisabled();

    await user.click(screen.getByLabelText(/Pause auto apply/));
    expect(await screen.findByText("Paused.")).toBeInTheDocument();
    expect(settingsFor("u_demo").paused).toBe(true);

    await user.selectOptions(screen.getByLabelText("From"), "9");
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(settingsFor("u_demo").hours_start).toBe(9));
  });
});
