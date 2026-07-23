import { describe, expect, it } from "vitest";
import { releaseBuildResultRequestSchema, releaseSnapshotSchema } from "./index";

const hash = "a".repeat(64);

describe("release plane contracts", () => {
  it("accepts a versioned immutable candidate snapshot", () => {
    const result = releaseSnapshotSchema.safeParse({
      schemaVersion: 1,
      candidateId: "candidate-1",
      baseReleaseId: null,
      sourceVersion: "candidate-2026",
      generatedAt: 1,
      items: [{ contentType: "title", contentId: "title.PIONEER", operation: "upsert", data: { label: "开拓者" } }],
      snapshotHash: hash,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported snapshot versions and malformed build hashes", () => {
    expect(releaseSnapshotSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(releaseBuildResultRequestSchema.safeParse({ contractVersion: "1", buildId: "build-1", candidateId: "candidate-1", status: "succeeded", bastionCommitSha: "abc", snapshotHash: "bad", artifactRefs: [], warnings: [], errors: [] }).success).toBe(false);
  });
});
