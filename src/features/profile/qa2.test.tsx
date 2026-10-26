/** QA2 §3: after the resume is read, empty Applicant info fields show what the server filled in. */
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { f3Db } from "../../mocks/f3State";
import { renderApp, signIn } from "../../test/renderApp";

describe("Applicant info from the resume", () => {
  it("fills empty fields after the parse and keeps what was typed", async () => {
    f3Db.resumes.u_demo = [];
    renderApp("/profile");
    const user = await signIn();
    await screen.findByText(/No resume yet/);
    const first = await screen.findByLabelText("First name");
    await user.type(first, "Devi");
    const phone = screen.getByLabelText("Phone") as HTMLInputElement;
    expect(phone.value).toBe("");

    const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Resume file"), file);
    await screen.findByRole("button", { name: "Review" }, { timeout: 8000 });

    await waitFor(() => expect(phone.value).toBe("+91 90000 00000"), { timeout: 5000 });
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Devi");
  }, 20000);
});
