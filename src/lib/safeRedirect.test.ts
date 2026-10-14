import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it.each(["/", "/applications", "/keywords?x=1#y"])("allows in-app path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    undefined,
    null,
    42,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "javascript:alert(1)",
    "/login",
  ])("rejects %s", (target) => {
    expect(safeRedirectPath(target)).toBe("/");
  });
});
