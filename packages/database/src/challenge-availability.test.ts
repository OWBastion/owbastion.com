import { describe, expect, it } from "vitest";
import { publicTitleChallengeStatus, titleChallengeIsSubmittable } from "./index";

describe("scheduled title challenge availability", () => {
  it("keeps a challenge unavailable before its start time", () => {
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 1_999)).toBe("scheduled");
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 1_999)).toBe(false);
  });

  it("makes a challenge active only inside its time window", () => {
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 2_000)).toBe("active");
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 2_999)).toBe("active");
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 3_000)).toBe(null);
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 2_000)).toBe(true);
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 3_000)).toBe(false);
  });
});
