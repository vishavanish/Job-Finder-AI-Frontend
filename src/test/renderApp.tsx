import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "../app/App";
import { MOCK_OTP_CODE } from "../mocks/data";

export function renderApp(path = "/") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

/** Email → code flow against the MSW mocks. The sixth digit submits by itself. */
export async function signIn(email = "demo@jobfinder.test", code = MOCK_OTP_CODE) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Work or personal email"), email);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  // A second sign-in within a minute hits the mock's resend cooldown.
  const haveCode = () => screen.queryByRole("button", { name: "I already have a code" });
  await waitFor(() => {
    if (!screen.queryByLabelText("Digit 1 of 6") && !haveCode()) throw new Error("waiting");
  });
  const link = haveCode();
  if (link) await user.click(link);
  await user.click(await screen.findByLabelText("Digit 1 of 6"));
  await user.keyboard(code);
  return user;
}
