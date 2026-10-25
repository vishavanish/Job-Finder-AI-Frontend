/**
 * QA4 Target companies against the MSW mocks: follow from Browse, follow by
 * name (known and still being looked up), new roles with "mark as seen",
 * suggestions, alert settings and the nav name.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { f6Db } from "../../mocks/f6State";
import { qa4Db } from "../../mocks/qa4";
import { renderApp, signIn } from "../../test/renderApp";

function card(name: string): HTMLElement {
  return screen
    .getByRole("heading", { name: new RegExp(`^${name}`), level: 3 })
    .closest("li.ats-company") as HTMLElement;
}

describe("Target companies", () => {
  it("is called Target companies and starts on My companies", async () => {
    renderApp("/ats-targets");
    await signIn();
    expect(
      await screen.findByRole("heading", { name: "Target companies", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "My companies" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByText(/Follow the companies you'd love to work for/),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Target companies" })).toBeInTheDocument();
  });

  it("follows a company from Browse and lists it under My companies", async () => {
    renderApp("/ats-targets?q=data+engineer&platform=greenhouse");
    const user = await signIn();
    await screen.findByText(/companies ·/);
    await user.click(within(card("Nimbus AI")).getByRole("button", { name: "Follow Nimbus AI" }));
    expect(
      await within(card("Nimbus AI")).findByRole("button", { name: "Unfollow Nimbus AI" }),
    ).toHaveTextContent("★ Following");

    await user.click(screen.getByRole("tab", { name: "My companies" }));
    expect(await screen.findByText(/Following/, { selector: "p" })).toHaveTextContent(
      "Following 1 of 50 companies",
    );
    expect(card("Nimbus AI")).toBeInTheDocument();
  });

  it("follows by name: a known company at once, an unknown one while we look", async () => {
    renderApp("/ats-targets");
    const user = await signIn();
    const input = await screen.findByLabelText("Company name");
    await user.type(input, "Nimbus AI");
    await user.click(screen.getByRole("button", { name: "Follow" }));
    expect(await screen.findByText("Following Nimbus AI.")).toBeInTheDocument();
    await user.type(input, "Initech");
    await user.click(screen.getByRole("button", { name: "Follow" }));
    expect(await screen.findByText(/Looking for Initech's career page/)).toBeInTheDocument();
    await waitFor(() => expect(within(card("Initech")).getByText(/Looking for its career page/)));
  });

  it("shows new roles at followed companies and marks them seen", async () => {
    const company = f6Db.companies.find((c) => c.name === "Nimbus AI")!;
    qa4Db.follows.u_demo = [
      {
        id: "f1",
        company_id: company.id,
        name: company.name,
        status: "following",
        followed_at: "2026-10-25T10:00:00Z",
      },
    ];
    qa4Db.newRoles.u_demo = [
      {
        id: "h1",
        job_id: "j1",
        title: "Staff Data Engineer",
        location: "Bengaluru",
        remote: false,
        url: "https://jobs.example/nimbus/1",
        company_id: company.id,
        company: company.name,
        platform: company.platform,
        posted_at: "2026-10-25T08:00:00Z",
        found_at: "2026-10-25T09:00:00Z",
        seen: false,
      },
    ];
    renderApp("/ats-targets");
    const user = await signIn();
    const box = (await screen.findByRole("heading", { name: "New at your companies" })).closest(
      ".ats-new-box",
    ) as HTMLElement;
    expect(within(box).getByText(/Staff Data Engineer/)).toBeInTheDocument();
    expect(within(card("Nimbus AI")).getByText("1 new")).toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "Mark it as seen" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New at your companies" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("suggests companies to follow", async () => {
    renderApp("/ats-targets?tab=suggested");
    const user = await signIn();
    const first = (await screen.findAllByRole("button", { name: /^Follow / }))[0]!;
    const label = first.getAttribute("aria-label")!;
    await user.click(first);
    // Followed companies leave the suggestions and show up under My companies.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument(),
    );
    expect(qa4Db.follows.u_demo).toHaveLength(1);
  });

  it("saves alert settings", async () => {
    renderApp("/ats-targets");
    const user = await signIn();
    await user.click(await screen.findByText("Alerts and what counts as a match"));
    await user.selectOptions(screen.getByLabelText("Tell me about new roles"), "instant");
    await user.type(screen.getByLabelText(/^Job titles/), "SRE, Platform Engineer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(qa4Db.settings.u_demo).toEqual({
      alert_mode: "instant",
      titles: ["SRE", "Platform Engineer"],
      places: [],
    });
  });
});
