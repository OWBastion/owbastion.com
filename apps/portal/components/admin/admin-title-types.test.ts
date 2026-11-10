import { describe, expect, it } from "vitest";
import { suggestRetiredVersion } from "./admin-title-types";

describe("suggestRetiredVersion", () => {
  it("turns the UTC+8 end day into the first dated build", () => {
    expect(suggestRetiredVersion(Date.UTC(2026, 10, 13, 8))).toBe("26.1113.1");
    expect(suggestRetiredVersion(Date.UTC(2026, 10, 13, 16))).toBe("26.1114.1");
  });

  it("suggests nothing without an end time", () => {
    expect(suggestRetiredVersion(null)).toBe("");
  });
});
