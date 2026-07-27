import { describe, expect, it } from "vitest";
import { paginateHistoricalHolderNames, summarizeHistoricalTitleGrantStatuses } from "./index";

describe("title migration query helpers", () => {
  it("paginates complete holder groups without splitting their names", () => {
    expect(paginateHistoricalHolderNames(["A", "B", "C"], 2, 2)).toEqual({ holderNames: ["C"], page: 2, pageSize: 2, total: 3, hasMore: false });
  });

  it("counts pending holders, unclaimed grants, and all migrated records", () => {
    expect(summarizeHistoricalTitleGrantStatuses([
      { holderName: "A", grantId: null },
      { holderName: "A", grantId: "active-1" },
      { holderName: "B", grantId: "revoked-1" },
      { holderName: "C", grantId: null },
    ])).toEqual({ pendingHolderCount: 2, unclaimedGrantCount: 2, migratedGrantCount: 2 });
  });
});
