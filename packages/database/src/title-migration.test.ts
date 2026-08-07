import { describe, expect, it } from "vitest";
import {
  filterHistoricalGrantsByStatus,
  filterHistoricalHolders,
  paginateHistoricalGrants,
  paginateHistoricalHolderNames,
  paginateHistoricalHolders,
  summarizeHistoricalHolders,
  summarizeHistoricalTitleGrantStatuses,
} from "./index";

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

  it("builds complete holder totals before pagination and status filtering", () => {
    const holders = summarizeHistoricalHolders([
      { holderName: "Cold", grantId: null, grantStatus: null },
      { holderName: "Cold", grantId: null, grantStatus: null },
      { holderName: "Cold", grantId: "g-1", grantStatus: "active" },
      { holderName: "Boo", grantId: "g-2", grantStatus: "active" },
      { holderName: "Bin", grantId: null, grantStatus: null },
    ]);
    expect(holders).toEqual([
      { holderName: "Bin", totalCount: 1, unclaimedCount: 1, status: "pending" },
      { holderName: "Boo", totalCount: 1, unclaimedCount: 0, status: "completed" },
      { holderName: "Cold", totalCount: 3, unclaimedCount: 2, status: "pending" },
    ]);
    expect(filterHistoricalHolders(holders, "pending").map((holder) => holder.holderName)).toEqual(["Bin", "Cold"]);
    expect(filterHistoricalHolders(holders, "completed").map((holder) => holder.holderName)).toEqual(["Boo"]);
    expect(paginateHistoricalHolders(filterHistoricalHolders(holders, "pending"), 1, 1)).toEqual({
      items: [{ holderName: "Bin", totalCount: 1, unclaimedCount: 1, status: "pending" }],
      page: 1,
      pageSize: 1,
      total: 2,
      hasMore: true,
    });
  });

  it("paginates holder grant detail without changing complete holder totals", () => {
    const grants = [
      { grantId: "1", status: "unclaimed" },
      { grantId: "2", status: "active" },
      { grantId: "3", status: "unclaimed" },
      { grantId: "4", status: "revoked" },
    ];
    const unclaimed = filterHistoricalGrantsByStatus(grants, "unclaimed");
    expect(unclaimed).toHaveLength(2);
    expect(paginateHistoricalGrants(unclaimed, 1, 1)).toEqual({
      items: [{ grantId: "1", status: "unclaimed" }],
      page: 1,
      pageSize: 1,
      total: 2,
      hasMore: true,
    });
  });

  it("keeps holder totals complete when only one title label matches the query", () => {
    const matchingRows = [{ holderName: "Cold", grantId: null, grantStatus: null }];
    const allRows = [
      { holderName: "Cold", grantId: null, grantStatus: null },
      { holderName: "Cold", grantId: "g-1", grantStatus: "active" },
      { holderName: "Cold", grantId: null, grantStatus: null },
      { holderName: "Boo", grantId: null, grantStatus: null },
    ];
    const matchingNames = new Set(matchingRows.map((row) => row.holderName));
    const expanded = allRows.filter((row) => matchingNames.has(row.holderName));
    expect(summarizeHistoricalHolders(expanded)).toEqual([
      { holderName: "Cold", totalCount: 3, unclaimedCount: 2, status: "pending" },
    ]);
  });
});
