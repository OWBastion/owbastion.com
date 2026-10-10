import { describe, expect, it } from "vitest";
import { mapVariantLabel } from "./map-variant";

describe("mapVariantLabel", () => {
  it("maps the stored variant values to Portal labels", () => {
    expect(mapVariantLabel("classic")).toBe("经典版");
    expect(mapVariantLabel(undefined)).toBe("标准版");
    expect(mapVariantLabel(null)).toBe("标准版");
  });
});
