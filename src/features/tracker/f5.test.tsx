/**
 * F5 screens against the MSW mocks: the tracker (summary cards, filters,
 * search, table and kanban, the /applications redirect), the application
 * timeline with sources, notes and the email behind each change, the manual
 * status change, the Gmail panel (connect and its return outcomes, accounts,
 * Check now, Disconnect, not configured), the needs-review inbox and the
 * Dashboard.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { mockDb } from "../../mocks/data";
import { f5Db } from "../../mocks/f5State";
import { renderApp, signIn } from "../../test/renderApp";

const app = (id: string) => mockDb.applications.find((a) => a.id === id)!;

describe("Tracker", () => {
  it("shows summary cards and the table, filters by status and searches", async () => {
    renderApp("/tracker");
    const user = await signIn();
    expect(await screen.findByRole("heading", { name: "Tracker", level: 2 })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Applications" });
    expect(within(table).getAllByRole("row")).toHaveLength(7); // header + 6
    // Opened / Prefilled / Submitted stay distinct
    expect(within(table).getByText("Opened")).toBeInTheDocument();
    expect(within(table).getByText("Prefilled, awaiting review")).toBeInTheDocument();
    expect(within(table).getByText("Submitted")).toBeInTheDocument();
    const rejectedCard = screen.getByRole("link", { name: /Rejected/ });
    expect(rejectedCard).toHaveAttribute("href", "/tracker?status=rejected");
    expect(within(rejectedCard).getByText("1")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "interview");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    expect(screen.getByRole("link", { name: "Backend Developer" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await user.type(screen.getByLabelText("Search"), "quarry");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    expect(screen.getByRole("link", { name: "Python Developer" })).toBeInTheDocument();
  });

  it("switches to the kanban view and remembers it", async () => {
    renderApp("/tracker");
    const user = await signIn();
    await screen.findByRole("table", { name: "Applications" });
    await user.click(screen.getByRole("button", { name: "Kanban" }));
    const board = screen.getByRole("region", { name: "Applications by stage" });
    const closed = within(board).getByRole("region", { name: /Closed/ });
    expect(within(closed).getByRole("link", { name: "Data Engineer" })).toBeInTheDocument();
    const progress = within(board).getByRole("region", { name: /In progress/ });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(3);
    expect(window.localStorage.getItem("jf_tracker_view")).toBe("kanban");
  });

  it("sends the old /applications path to the tracker", async () => {
    renderApp("/applications");
    await signIn();
    expect(await screen.findByRole("heading", { name: "Tracker", level: 2 })).toBeInTheDocument();
  });
});

describe("Application detail", () => {
  it("shows the timeline with sources, the rejection note and the email that caused it", async () => {
    renderApp("/tracker/app_4");
    await signIn();
    const timeline = await screen.findByRole("list", { name: /Status history/ });
    const steps = within(timeline).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    const last = steps[2]!;
    expect(within(last).getByText("Rejected")).toBeInTheDocument();
    expect(within(last).getByText("From an email")).toBeInTheDocument();
    expect(
      within(last).getByText(/Orchard Retail told you it will not move forward/),
    ).toBeInTheDocument();
    expect(within(last).getByText("Your application for Data Engineer")).toBeInTheDocument();
    expect(within(last).getByRole("link", { name: "Open in Gmail" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/mail\.google\.com\/mail\/u\/.+#all\/msg_em_rej$/),
    );
    expect(within(steps[0]!).getByText("Apply engine")).toBeInTheDocument();
  });

  it("changes the status by hand, and asks before closing an application", async () => {
    renderApp("/tracker/app_2");
    const user = await signIn();
    await screen.findByRole("list", { name: /Status history/ });
    await user.selectOptions(screen.getByLabelText("New status"), "assessment");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(app("app_2")).toMatchObject({ status: "assessment" }));
    expect(app("app_2").status_source).toBe("manual");
    expect(await screen.findAllByText("Status changed to Assessment.")).not.toHaveLength(0);
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: /Status history/ })).getAllByRole("listitem"),
      ).toHaveLength(3),
    );

    await user.selectOptions(screen.getByLabelText("New status"), "withdrawn");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Mark as Withdrawn?" });
    expect(within(dialog).getByText(/Email tracking never changes a closed/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Mark as Withdrawn" }));
    await waitFor(() => expect(app("app_2").status).toBe("withdrawn"));
  });

  it("says when an application doesn't exist", async () => {
    renderApp("/tracker/nope");
    await signIn();
    expect(
      await screen.findByText("This application doesn't exist or isn't yours."),
    ).toBeInTheDocument();
  });
});

describe("Gmail panel", () => {
  it("lists accounts with their state, checks now and disconnects with a clear confirm", async () => {
    renderApp("/tracker?tab=gmail");
    const user = await signIn();
    const active = (await screen.findByText("demo.jobs@gmail.com")).closest("li")!;
    expect(within(active).getByText("Active")).toBeInTheDocument();
    const stale = screen.getByText("old.inbox@gmail.com").closest("li")!;
    expect(within(stale).getByText("Needs reconnect")).toBeInTheDocument();
    expect(within(stale).getByText(/revoked or expired/)).toBeInTheDocument();
    expect(within(stale).getByRole("button", { name: "Reconnect" })).toBeEnabled();
    expect(screen.getByText(/never the full email/)).toBeInTheDocument();
    expect(screen.getByText(/Read-only access — it can't send/)).toBeInTheDocument();

    await user.click(within(active).getByRole("button", { name: "Check now" }));
    expect(await within(active).findByText(/Checking your inbox/)).toBeInTheDocument();

    await user.click(within(stale).getByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Disconnect old.inbox@gmail.com?",
    });
    expect(within(dialog).getByText(/Google access is revoked/)).toBeInTheDocument();
    expect(within(dialog).getByText(/the job emails found in it/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/your applications and their status history/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByText("old.inbox@gmail.com")).not.toBeInTheDocument());
    expect(f5Db.accounts.map((a) => a.id)).toEqual(["gm_1"]);
  });

  it("connects Gmail and shows the result Google's redirect brings back", async () => {
    f5Db.accounts = [];
    renderApp("/tracker?tab=gmail");
    const user = await signIn();
    expect(await screen.findByText("No Gmail account connected.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect Gmail" }));
    expect(
      await screen.findByText(/Gmail connected\. The first check looks at the last 30 days/),
    ).toBeInTheDocument();
    expect(await screen.findByText("demo@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Gmail" })).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["expired", "The connection took too long — try again."],
    ["denied", "You cancelled on Google's screen. Nothing was connected."],
    ["scope", "Google didn't grant read access to your mailbox. Try again and tick the Gmail box."],
    ["failed", "Couldn't connect Gmail. Try again in a minute."],
  ])("explains a failed connect (%s)", async (reason, text) => {
    renderApp(`/tracker?gmail=error&reason=${reason}`);
    await signIn();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Gmail" })).toHaveAttribute("aria-selected", "true");
  });

  it("explains when Gmail isn't set up on this server", async () => {
    f5Db.configured = false;
    renderApp("/tracker?tab=gmail");
    await signIn();
    expect(
      await screen.findByText(/Gmail tracking isn't set up on this server yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Gmail" })).toBeDisabled();
  });
});

describe("Needs-review inbox", () => {
  it("confirms the top suggestion and updates the application", async () => {
    renderApp("/tracker?tab=review");
    const user = await signIn();
    expect(await screen.findByRole("tab", { name: "Needs review (2)" })).toBeInTheDocument();
    const item = (await screen.findByText("Thanks for applying")).closest("li.review-item")!;
    expect(within(item as HTMLElement).getByText("match 55")).toBeInTheDocument();
    expect(within(item as HTMLElement).getByText(/82% sure/)).toBeInTheDocument();
    await user.click(
      within(item as HTMLElement).getByRole("button", {
        name: "Confirm: Lumen Analytics → Acknowledged",
      }),
    );
    expect(
      (await screen.findAllByText("Lumen Analytics — AI Engineer (LLM apps) is now Acknowledged."))
        .length,
    ).toBeGreaterThan(0);
    expect(app("app_2")).toMatchObject({ status: "acknowledged", status_source: "email_parser" });
    await waitFor(() => expect(screen.queryByText("Thanks for applying")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Needs review (1)" })).toBeInTheDocument();
  });

  it("changes the application and meaning, or ignores an email", async () => {
    renderApp("/tracker?tab=review");
    const user = await signIn();
    const zephyr = (await screen.findByText("Quick chat about a role?")).closest(
      "li.review-item",
    ) as HTMLElement;
    expect(within(zephyr).queryByRole("button", { name: /^Confirm/ })).not.toBeInTheDocument();
    await user.click(within(zephyr).getByRole("button", { name: "Change" }));
    const dialog = await screen.findByRole("dialog", { name: "Which application is this about?" });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("option", { name: /Quarry Systems — Python Developer/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(within(dialog).getByLabelText("Application"), "app_6");
    await user.selectOptions(
      within(dialog).getByLabelText("What the email means"),
      "interview_invite",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(app("app_6").status).toBe("interview"));

    const other = (await screen.findByText("Thanks for applying")).closest(
      "li.review-item",
    ) as HTMLElement;
    await user.click(within(other).getByRole("button", { name: /^Ignore/ }));
    await waitFor(() =>
      expect(f5Db.emails.find((e) => e.id === "em_review_1")?.state).toBe("ignored"),
    );
    expect(
      await screen.findByText("Nothing to review. Emails the tracker is unsure about appear here."),
    ).toBeInTheDocument();
  });
});

describe("Dashboard", () => {
  it("opens at / with the funnel, what needs you and recent changes", async () => {
    renderApp("/");
    await signIn();
    expect(await screen.findByRole("heading", { name: "Dashboard", level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Applied: 3" })).toHaveAttribute(
      "href",
      "/tracker",
    );
    expect(screen.getByRole("link", { name: "Interview: 1" })).toHaveAttribute(
      "href",
      "/tracker?status=interview",
    );
    expect(screen.getByRole("link", { name: "1 rejection" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 emails need review" })).toHaveAttribute(
      "href",
      "/tracker?tab=review",
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByLabelText("2 emails to review")).toBeInTheDocument();
  });

  it("points a new user to Jobs", async () => {
    mockDb.applications = [];
    renderApp("/");
    await signIn();
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "find jobs" })).toHaveAttribute("href", "/jobs");
  });
});

describe("Job sources", () => {
  it("says Job alert emails needs Gmail, with a link to connect it", async () => {
    f5Db.accounts = [];
    renderApp("/providers");
    await signIn();
    expect(
      await screen.findByText("Won't run: connect Gmail to read your job-alert emails."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Gmail" })).toHaveAttribute(
      "href",
      "/tracker?tab=gmail",
    );
  });
});
