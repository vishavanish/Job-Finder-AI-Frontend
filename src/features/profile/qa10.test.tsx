/** QA10: resume check on Profile › Resume, and keyword fit in the prep dialog. */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { f3Db, mockCheck } from "../../mocks/f3State";
import { renderApp, signIn } from "../../test/renderApp";

function row(name: RegExp) {
  return screen.getByText(name).closest("li.resume-row") as HTMLElement;
}

describe("Resume check", () => {
  it("shows the band, the findings with fixes, and what a reader sees", async () => {
    renderApp("/profile");
    const user = await signIn();
    const badge = await screen.findByRole("button", { name: /Resume check: Needs fixes · 80/ });
    expect(badge).toHaveAttribute("aria-expanded", "false");
    await user.click(badge);
    const panel = await screen.findByRole("region", { name: /How a resume reader sees v1/ });
    expect(within(panel).getByText("Two columns or a sidebar")).toBeInTheDocument();
    expect(within(panel).getByText(/How to fix: Use one column/)).toBeInTheDocument();
    expect(within(panel).getByText(/There is no official ATS score/)).toBeInTheDocument();
    // Needs fixes is not hard to read: no plain copy offered
    expect(
      within(panel).queryByRole("button", { name: "Make a plain copy" }),
    ).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "See what a resume reader sees" }));
    expect(within(panel).getByLabelText("Text in the order a reader gets it")).toHaveTextContent(
      /FastAPI\s+Jan 2022 - Present/,
    );

    // Check again: the mock's worker finishes by the next list request (a PDF comes back hard to read).
    await user.click(within(panel).getByRole("button", { name: "Check again" }));
    await screen.findByRole("button", { name: /Resume check: Hard to read/ }, { timeout: 8000 });
  }, 20000);

  it("a hard-to-read reviewed resume gets a plain copy, which can be downloaded", async () => {
    f3Db.resumes.u_demo![0]!.ats_check = mockCheck("hard_to_read");
    renderApp("/profile");
    const user = await signIn();
    await user.click(
      await screen.findByRole("button", { name: /Resume check: Hard to read · 35/ }),
    );
    const panel = await screen.findByRole("region", { name: /How a resume reader sees v1/ });
    expect(within(panel).getByText(/only in the page header or footer/)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Make a plain copy" }));

    expect(await screen.findByText(/Made Main - plain\.docx/)).toBeInTheDocument();
    const copy = row(/Plain copy of Main/);
    expect(
      within(copy).getByRole("button", { name: /Resume check: Good · 100/ }),
    ).toBeInTheDocument();
    expect(within(copy).getByRole("button", { name: "Download version 2" })).toBeInTheDocument();
    expect(f3Db.resumes.u_demo!.find((r) => r.version === 2)?.parent_id).toBe("r_demo_1");
  }, 20000);

  it("an unreviewed hard-to-read resume asks for the review first", async () => {
    Object.assign(f3Db.resumes.u_demo![0]!, {
      ats_check: mockCheck("hard_to_read"),
      parse_status: "parsed",
    });
    renderApp("/profile");
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: /Resume check: Hard to read/ }));
    const panel = await screen.findByRole("region", { name: /How a resume reader sees/ });
    expect(
      within(panel).queryByRole("button", { name: "Make a plain copy" }),
    ).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Review what we read first" }));
    expect(
      await screen.findByRole("heading", { name: /Review what the AI read/ }),
    ).toBeInTheDocument();
  }, 20000);
});

describe("Keyword fit in the prep dialog", () => {
  it("shows found and missing skills, then before → after with the tailored resume", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp("/jobs");
      const user = await signIn();
      await user.click(await screen.findByRole("button", { name: "Run search" }));
      for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(2100);
      await screen.findByText(/Search finished/);
      const card = screen
        .getByRole("link", { name: "Software Engineer II, Data" })
        .closest("li.job-card") as HTMLElement;
      await user.click(within(card).getByRole("button", { name: "Apply manually" }));
      const dialog = await screen.findByRole("dialog");
      const fit = await within(dialog).findByRole("region", { name: "Keyword fit" });
      expect(within(fit).getByText(/Around 75% of the job's keywords/)).toBeInTheDocument();
      expect(within(fit).getByText("kubernetes")).toBeInTheDocument();
      expect(within(fit).getByText(/Add these only if you really have them/)).toBeInTheDocument();
      expect(
        within(fit).getByText(/Bachelor's degree — your resume shows one/),
      ).toBeInTheDocument();
      await waitFor(() => expect(within(fit).getByText("64% → 78%")).toBeInTheDocument(), {
        timeout: 10000,
      });
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});
