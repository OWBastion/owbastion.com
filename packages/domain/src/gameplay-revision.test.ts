import { describe, expect, it } from "vitest";
import { initialGameplayRevisionId, legacyGameplayRevisionId } from "./gameplay-revision";

describe("gameplay revision identifiers", () => {
  it("keeps the legacy compatibility revision on a machine sequence", () => {
    expect(initialGameplayRevisionId("map.circuit_royal")).toBe("revision:map.circuit_royal:initial");
    expect(legacyGameplayRevisionId("map.circuit_royal")).toBe("revision:map.circuit_royal:v0");
    expect(legacyGameplayRevisionId("map.circuit_royal")).not.toContain("classic");
  });
});
