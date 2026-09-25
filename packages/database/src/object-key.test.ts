import { describe, expect, it } from "vitest";
import { userEvidenceObjectKey } from "./object-key";

describe("user evidence object keys", () => {
  it("uses the same namespace for persisted image extensions", () => {
    expect(userEvidenceObjectKey("submission-1", "b".repeat(64), "png")).toMatch(
      /^uploads\/submissions\/submission-1\/b{64}\.png$/,
    );
  });
});
