/**
 * QA1 quick wins against the MSW mocks: the last search comes back after
 * leaving Jobs (§4), the AI-busy banner (§3), Auto apply only looks primary
 * when it works and "Mark as applied" is on the card (§5), Job sources only
 * says "will run" for what a search runs (§6), and a failed prep pack shows a
 * short message with the detail folded (§7).
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { aiDb } from "../../mocks/aiState";
import { mockDb } from "../../mocks/data";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
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

describe("Jobs keeps the last search (§4)", () => {
  it("shows the finished search again after visiting another page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      expect(screen.getByRole("link", { name: "LLM Application Developer" })).toBeInTheDocument();

      const nav = screen.getByRole("navigation", { name: "Main" });
      await user.click(within(nav).getByRole("link", { name: /^Tracker/ }));
      await screen.findByRole("heading", { name: "Tracker", level: 2 });
      await user.click(within(nav).getByRole("link", { name: "Jobs" }));
      await vi.advanceTimersByTimeAsync(2100);

      expect(await screen.findByText(/Showing your last search, started at/)).toBeInTheDocument();
      expect(
        await screen.findByRole("link", { name: "LLM Application Developer" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Run a search to see matching jobs here.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when a run from a link has expired", async () => {
    renderApp("/jobs?run=gone-run");
    await signIn();
    expect(await screen.findByText(/Your last search has expired/)).toBeInTheDocument();
    expect(screen.queryByText(/Lost contact with the search/)).toBeNull();
  });
});

describe("AI busy banner (§3)", () => {
  it("appears on Jobs when every scoring model is paused for a passing reason", async () => {
    for (const m of aiDb.models) Object.assign(m, { paused: true, pause_reason: "rate_limit" });
    renderApp("/jobs");
    await signIn();
    expect(await screen.findByText(/The AI models are busy right now/)).toBeInTheDocument();
  });

  it("says an admin must fix it when every model is set up wrong", async () => {
    for (const m of aiDb.models) Object.assign(m, { paused: true, pause_reason: "broken" });
    renderApp("/interview");
    await signIn();
    expect(
      await screen.findByText(/aren't set up correctly right now, so practice interviews/),
    ).toBeInTheDocument();
  });

  it("stays away while one model still works", async () => {
    renderApp("/jobs");
    await signIn();
    await screen.findByRole("button", { name: "Run search" });
    expect(screen.queryByText(/The AI models are busy/)).toBeNull();
  });
});

describe("Job card apply buttons (§5, §7)", () => {
  it("Auto apply is not styled as the main button when it can't be used", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      await runSearch();
      const blocked = screen
        .getAllByRole("button", { name: "Auto apply" })
        .filter((b) => (b as HTMLButtonElement).disabled);
      expect(blocked.length).toBeGreaterThan(0);
      for (const b of blocked) expect(b).not.toHaveClass("btn-apply");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Mark as applied on the card records the application", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      const job = card("LLM Application Developer");
      await user.click(within(job).getByRole("button", { name: "Mark as applied" }));
      await waitFor(() => expect(within(job).getByText("Applied")).toBeInTheDocument());
      expect(within(job).queryByRole("button", { name: "Mark as applied" })).toBeNull();
      expect(mockDb.applications.some((a) => a.company === "Brightline Health")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed prep pack shows one short message, the detail folded, and Try again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await runSearch();
      server.use(
        http.get(`${API}/apply/prep/:id`, ({ params }) =>
          HttpResponse.json({
            id: String(params.id),
            job_id: "x",
            status: "failed",
            tailored_resume_id: null,
            cover_letter: null,
            email_to: null,
            email_subject: null,
            email_body: null,
            mailto: null,
            dropped: [],
            error:
              "The AI models are busy right now, so the tailored resume and cover letter weren't written. Try again in a few minutes.",
            error_detail: "Tailored resume: No AI model could run 'resume_tailor': Groq: busy",
            updated_at: "2026-10-25T10:00:00Z",
          }),
        ),
      );
      const job = card("LLM Application Developer");
      await user.click(within(job).getByRole("button", { name: "Apply manually" }));
      const dialog = await screen.findByRole("dialog");
      await vi.advanceTimersByTimeAsync(2100);
      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent(/weren't written\. Try again in a few minutes\./);
      expect(within(dialog).getAllByText(/AI models are busy/)).toHaveLength(1);
      expect(within(alert).getByText("Details")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Job sources (§6)", () => {
  it("paste-in Naukri and Naukri via Apify don't say they will run", async () => {
    renderApp("/providers");
    await signIn();
    expect(
      await screen.findByText("Won't run: you paste these jobs in; searches don't fetch them."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Won't run: (searches from Jobs don't use it yet|needs an? Apify API key)\./,
      ),
    ).toBeInTheDocument();
  });
});
