/** QA2 §1: jobs shown while they are scored, removed when they score too low, run timings. */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { StreamedJob } from "../../lib/api/types";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";
import { timingSummary, upsertJobs } from "./usePipelineRun";

const job = (id: string, extra: Partial<StreamedJob> = {}): StreamedJob => ({
  id,
  source: "Indeed",
  title: `Job ${id}`,
  company: "Co",
  location: "Pune",
  url: `https://indeed.example/${id}`,
  description: "",
  posted: "",
  keyword_score: 50,
  llm_score: null,
  llm_reason: "",
  auto_apply_capable: false,
  created_at: "2026-10-25T10:00:00Z",
  ...extra,
});

describe("feed entries", () => {
  it("a scored copy replaces the scoring one and a removed entry drops the job", () => {
    let feed = upsertJobs([], [job("a", { scoring: true }), job("b", { scoring: true })]);
    expect(feed.map((j) => j.id)).toEqual(["a", "b"]);
    feed = upsertJobs(feed, [
      job("a", { scoring: false, llm_score: 88, replaces: true }),
      { id: "b", replaces: true, removed: true } as StreamedJob,
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ id: "a", scoring: false, llm_score: 88 });
  });

  it("summarises where a search spent its time", () => {
    expect(timingSummary({ Scoring: 12.4, "LinkedIn + Indeed": 38, RemoteOK: 0.3 })).toBe(
      "LinkedIn + Indeed 38 s · Scoring 12 s",
    );
    expect(timingSummary(undefined)).toBe("");
  });
});

describe("Jobs page while scoring", () => {
  it("shows a job right away with 'Scoring…' instead of a score", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      server.use(
        http.get(`${API}/pipeline/:runId/jobs`, ({ request }) => {
          const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
          const jobs =
            offset === 0 ? [job("early-1", { title: "Python Developer", scoring: true })] : [];
          return HttpResponse.json({
            run_status: "running",
            jobs,
            next_offset: offset + jobs.length,
          });
        }),
      );
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));
      await vi.advanceTimersByTimeAsync(2100);
      const card = (await screen.findByRole("link", { name: "Python Developer" })).closest(
        "li.job-card",
      ) as HTMLElement;
      expect(within(card).getByText("Scoring against your resume…")).toBeInTheDocument();
      expect(within(card).getByRole("img", { name: "Scoring" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Prep dialog steps (§2)", () => {
  it("shows which part is ready and how long packs usually take", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));
      for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2100);
      await screen.findByText(/Search finished/);
      server.use(
        http.get(`${API}/apply/prep/:id`, ({ params }) =>
          HttpResponse.json({
            id: String(params.id),
            job_id: "x",
            status: "pending",
            dropped: [],
            steps: { resume: "done", cover_letter: "running" },
            typical_seconds: 25,
            updated_at: "2026-10-25T10:00:00Z",
          }),
        ),
      );
      const card = screen
        .getByRole("link", { name: "LLM Application Developer" })
        .closest("li.job-card") as HTMLElement;
      await user.click(within(card).getByRole("button", { name: "Apply manually" }));
      const dialog = await screen.findByRole("dialog");
      await vi.advanceTimersByTimeAsync(2100);
      expect(
        await within(dialog).findByText(/this usually takes about 25 seconds/),
      ).toBeInTheDocument();
      expect(
        within(dialog)
          .getByText(/Tailored resume/)
          .closest("li"),
      ).toHaveClass("is-done");
      expect(
        within(dialog)
          .getByText(/Cover letter/)
          .closest("li"),
      ).toHaveClass("is-running");
    } finally {
      vi.useRealTimers();
    }
  });
});
