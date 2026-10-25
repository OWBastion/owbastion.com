import { describe, expect, it } from "vitest";
import { playerSubmissionListResponseSchema } from "./index";

describe("player submission history contract", () => {
  it("bounds the player submission history page size", () => {
    const list = { contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
    expect(playerSubmissionListResponseSchema.safeParse(list).success).toBe(true);
    expect(playerSubmissionListResponseSchema.safeParse({ ...list, pageSize: 51 }).success).toBe(false);
    expect(playerSubmissionListResponseSchema.safeParse({ ...list, page: 0 }).success).toBe(false);
  });
});
