import { describe, expect, it } from "vitest";
import { hasSafeReturnTo, safeReturnTo } from "./safeReturnTo";

describe("safeReturnTo", () => {
  it("accepts same-origin application paths", () => {
    expect(hasSafeReturnTo("/me?tab=submissions")).toBe(true);
    expect(safeReturnTo("/me?tab=submissions")).toBe("/me?tab=submissions");
  });

  it("rejects external and missing destinations", () => {
    expect(hasSafeReturnTo("//evil.example")).toBe(false);
    expect(safeReturnTo("//evil.example")).toBe("/me");
    expect(safeReturnTo(undefined)).toBe("/me");
  });
});
