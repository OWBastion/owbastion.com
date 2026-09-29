import { describe, expect, it } from "vitest";
import { randomEventRarityForWeight } from "./random-event";

describe("randomEventRarityForWeight", () => {
  it("maps weight bands to rarity", () => {
    expect(randomEventRarityForWeight(0.4)).toBe("SSR");
    expect(randomEventRarityForWeight(0.5)).toBe("SR");
    expect(randomEventRarityForWeight(0.8)).toBe("SR");
    expect(randomEventRarityForWeight(0.9)).toBe("R");
    expect(randomEventRarityForWeight(1.2)).toBe("R");
    expect(randomEventRarityForWeight(1.3)).toBe("N");
    expect(randomEventRarityForWeight(2)).toBe("N");
  });

  it("returns empty rarity for events without a weight", () => {
    expect(randomEventRarityForWeight(null)).toBe("");
  });
});
