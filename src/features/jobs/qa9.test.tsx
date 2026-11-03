/** QA9: strong and possible matches in their own groups, jobs per source, and why the prefilter stopped jobs. */
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";

const job = (id: string, title: string, score: number, group: "strong" | "possible") => ({
  id,
  source: "Indeed",
  title,
  company: `${title} Co`,
  location: "Pune",
  url: `https://indeed.example/${id}`,
  description: "Build things",
  posted: "",
  keyword_score: 40,
  llm_score: score,
  llm_reason: "Fits",
  auto_apply_capable: false,
  created_at: "2026-11-02T08:15:00Z",
  match_group: group,
});

const finishedWith = (jobs: object[], extra: object = {}) =>
  server.use(
    http.get(`${API}/pipeline/:runId`, () =>
      HttpResponse.json({
        user_id: "u_demo",
        status: "completed",
        total_keywords: 1,
        keywords_completed: 1,
        error: "",
        created_at: "2026-11-02T08:15:00Z",
        ...extra,
      }),
    ),
    http.get(`${API}/pipeline/:runId/jobs`, () =>
      HttpResponse.json({ run_status: "completed", jobs, next_offset: jobs.length }),
    ),
  );

const search = async () => {
  renderApp("/jobs");
  const user = await signIn();
  await user.click(await screen.findByRole("button", { name: "Run search" }));
};

describe("Search results in two groups", () => {
  it("shows strong matches first, then possible matches, and counts both", async () => {
    finishedWith([
      job("p", "Possible Role", 60, "possible"),
      job("s1", "Strong Role", 85, "strong"),
      job("s2", "Other Strong Role", 72, "strong"),
    ]);
    await search();
    const strong = await screen.findByRole("heading", { name: /Strong matches/ });
    const possible = screen.getByRole("heading", { name: /Possible matches/ });
    expect(
      strong.compareDocumentPosition(possible) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(strong).getByText("2")).toBeInTheDocument();
    expect(within(possible).getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/3 new matching jobs \(2 strong, 1 possible\)/)).toBeInTheDocument();
  });

  it("has no group headings when every job is a strong match", async () => {
    finishedWith([job("s1", "Strong Role", 85, "strong")]);
    await search();
    await screen.findByText("Strong Role");
    expect(screen.queryByRole("heading", { name: /Strong matches/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Possible matches/ })).not.toBeInTheDocument();
  });
});

describe("What a search tells the user about its jobs", () => {
  it("lists jobs found and shown per source, most shown first", async () => {
    finishedWith([job("s1", "Strong Role", 85, "strong")], {
      sources: {
        LinkedIn: { raw: 25, kept: 1 },
        Indeed: { raw: 80, kept: 6 },
        Adzuna: { raw: 4, kept: 0 },
      },
    });
    await search();
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Indeed806", "LinkedIn251", "Adzuna40"]);
  });

  it("names jobs the prefilter stopped when a search shows nothing", async () => {
    finishedWith([], {
      counts: {
        raw: 7,
        seen: 0,
        low_score: 0,
        handled: 0,
        prefiltered: 7,
        filtered: 0,
        blocked: 0,
        unscored: 0,
        kept: 0,
      },
    });
    await search();
    expect(
      await screen.findByText("7 jobs that matched neither your titles nor your skills"),
    ).toBeInTheDocument();
  });
});
