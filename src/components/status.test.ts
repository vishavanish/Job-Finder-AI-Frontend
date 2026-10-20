import { describe, expect, it } from "vitest";
import { statusGroup, statusLabel } from "./status";

describe("status palette mapping", () => {
  it.each([
    ["queued", "neutral"],
    ["running", "active"],
    ["easy_apply_form_filled_awaiting_review", "attention"],
    ["submitted", "progress"],
    ["interview", "positive"],
    ["rejected", "negative"],
    ["open_failed:TimeoutError", "negative"],
    ["withdrawn", "muted"],
    ["needs_user", "attention"],
    ["prefilled", "attention"],
    ["emailed", "progress"],
    ["something_new", "neutral"],
    [null, "neutral"],
  ])("%s → %s", (status, group) => {
    expect(statusGroup(status)).toBe(group);
  });

  it("labels statuses in sentence case and hides raw error detail", () => {
    expect(statusLabel("awaiting_input")).toBe("Needs your input");
    expect(statusLabel("open_failed:TimeoutError page")).toBe("Couldn't open");
    expect(statusLabel("acknowledged")).toBe("Acknowledged");
    expect(statusLabel("needs_more_info")).toBe("Needs more info");
  });

  it("never labels an opened or prefilled application as submitted", () => {
    expect(statusLabel("opened")).not.toMatch(/submitted/i);
    expect(statusLabel("easy_apply_form_filled_awaiting_review")).not.toMatch(/submitted/i);
    expect(statusLabel("prefilled")).not.toMatch(/submitted/i);
    expect(statusLabel("needs_user")).not.toMatch(/submitted/i);
  });
});
