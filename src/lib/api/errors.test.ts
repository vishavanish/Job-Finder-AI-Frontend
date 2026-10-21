import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, parseErrorBody } from "./errors";

describe("parseErrorBody", () => {
  it("reads the target contract {code, message, details}", () => {
    expect(
      parseErrorBody(409, { code: "duplicate", message: "Already saved.", details: { id: 1 } }),
    ).toEqual({
      code: "duplicate",
      message: "Already saved.",
      details: { id: 1 },
    });
  });

  it("reads FastAPI {detail: string}", () => {
    expect(parseErrorBody(401, { detail: "Incorrect email or password." })).toEqual({
      code: "unauthorized",
      message: "Incorrect email or password.",
    });
  });

  it("reads {detail: {code, message}} (account_disabled)", () => {
    expect(
      parseErrorBody(403, { detail: { code: "account_disabled", message: "Disabled." } }),
    ).toEqual({ code: "account_disabled", message: "Disabled.", details: undefined });
  });

  it("reads 422 validation lists", () => {
    const body = {
      detail: [{ loc: ["body", "email"], msg: "value is not a valid email address", type: "x" }],
    };
    expect(parseErrorBody(422, body)).toMatchObject({
      code: "validation_error",
      message: "email: value is not a valid email address",
    });
  });

  it("falls back to a status-based message", () => {
    expect(parseErrorBody(502, undefined)).toEqual({
      code: "server_error",
      message: "The server hit an error. Try again in a minute.",
    });
    expect(parseErrorBody(500, "Internal Server Error").message).toBe(
      "The server hit an error. Try again in a minute.",
    );
    expect(parseErrorBody(500, "<html>huge proxy page</html>".repeat(30)).code).toBe(
      "server_error",
    );
  });
});

describe("errorMessage", () => {
  it("handles ApiError, Error, strings and unknowns", () => {
    expect(errorMessage(new ApiError(400, { code: "x", message: "Bad input." }))).toBe(
      "Bad input.",
    );
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage({}, "Fallback.")).toBe("Fallback.");
  });
});
