import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { API } from "../../mocks/handlers";
import { server } from "../../mocks/server";
import { renderApp, signIn } from "../../test/renderApp";

async function toCodeStep(email = "demo@jobfinder.test") {
  const user = userEvent.setup();
  renderApp("/login");
  await user.type(await screen.findByLabelText("Work or personal email"), email);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByLabelText("Digit 1 of 6");
  return user;
}

const digits = () =>
  Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`Digit ${i + 1} of 6`)).map(
    (el) => (el as HTMLInputElement).value,
  );

describe("sign in with an email code", () => {
  it("asks for a valid email before sending", async () => {
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(await screen.findByLabelText("Work or personal email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });

  it("uses neutral wording and starts a resend countdown", async () => {
    await toCodeStep("nobody@example.com");
    expect(screen.getByText(/If this address can sign in, a code has been sent/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();
  });

  it("signs in when the sixth digit is typed", async () => {
    renderApp("/");
    await signIn();
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("fills every box from a pasted code and signs in", async () => {
    const user = await toCodeStep();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.paste("123 456");
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("moves back with Backspace", async () => {
    const user = await toCodeStep();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("12");
    await user.keyboard("{Backspace}");
    expect(digits().join("")).toBe("1");
    expect(screen.getByLabelText("Digit 2 of 6")).toHaveFocus();
  });

  it("shows attempts left for a wrong code, then locks after too many", async () => {
    const user = await toCodeStep();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("4 attempts left");
    expect(digits().join("")).toBe("");

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByLabelText("Digit 1 of 6"));
      await user.keyboard("000000");
      await screen.findByRole("alert");
    }
    expect(screen.getByRole("alert")).toHaveTextContent("Too many wrong attempts");
    expect(screen.getByLabelText("Digit 1 of 6")).toBeDisabled();
    // The only way forward is a new code, offered right away.
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeEnabled();
  });

  it("stays on the email step with a clear message when the server fails", async () => {
    server.use(
      http.post(
        `${API}/auth/otp/request`,
        () => new HttpResponse("Internal Server Error", { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(await screen.findByLabelText("Work or personal email"), "a@b.test");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The server hit an error, so no code was sent",
    );
    expect(screen.queryByLabelText("Digit 1 of 6")).not.toBeInTheDocument();
  });

  it("does not claim a code was sent when the first request hits the cooldown", async () => {
    server.use(
      http.post(`${API}/auth/otp/request`, () =>
        HttpResponse.json(
          { detail: { code: "otp_cooldown", retry_after: 42, message: "Please wait." } },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(await screen.findByLabelText("Work or personal email"), "a@b.test");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already requested");
    expect(screen.queryByLabelText("Digit 1 of 6")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email me a code in \d+s/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "I already have a code" }));
    expect(screen.getByLabelText("Digit 1 of 6")).toBeInTheDocument();
  });

  it("goes back to change the email", async () => {
    const user = await toCodeStep();
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Work or personal email")).toHaveValue("demo@jobfinder.test");
  });
});
