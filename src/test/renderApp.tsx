import { render, screen } from "@testing-library/react";
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
  await user.type(await screen.findByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await user.click(await screen.findByLabelText("Digit 1 of 6"));
  await user.keyboard(code);
  return user;
}
