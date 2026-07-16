import { describe, expect, it } from "vitest";
import { userEvidenceObjectKey } from "./object-key";

describe("user evidence object keys", () => {
  it("uses the OCRKit uploads namespace for portal uploads", () => {
    expect(userEvidenceObjectKey("submission-1", "a".repeat(64), "upload")).toBe(
      `uploads/submissions/submission-1/${"a".repeat(64)}.upload`,
    );
  });

  it("uses the same namespace for persisted image extensions", () => {
    expect(userEvidenceObjectKey("submission-1", "b".repeat(64), "png")).toMatch(
      /^uploads\/submissions\/submission-1\/b{64}\.png$/,
    );
  });
});
