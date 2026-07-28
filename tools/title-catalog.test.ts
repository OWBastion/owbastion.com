import { describe, expect, it } from "vitest";
import { readTitleCatalogSnapshot, renderTitlePresentationSeedSql, type TitleCatalogSnapshot } from "./title-catalog.ts";

const title = (key: string, scope: string = "global") => ({
  key,
  label: key,
  category: "test",
  condition: "test",
  availability: "active",
  scope,
  displayKind: "fixed",
});

const map = (mapId: string) => ({
  mapId,
  mapName: mapId,
  gameVersion: "test",
  status: "active",
  pioneerPrefixes: [],
  rewards: [
    { slot: "pioneer", titleKey: "PIONEER", holderNames: [] },
    { slot: "conqueror", titleKey: "CONQUEROR", holderNames: [] },
    { slot: "dominator", titleKey: "DOMINATOR", holderNames: [] },
  ],
});

const snapshot = (titleCount: number, mapCount: number): TitleCatalogSnapshot => ({
  schemaVersion: 1,
  sourceVersion: "test",
  gameVersion: "test",
  titles: [
    title("PIONEER", "map"),
    title("CONQUEROR", "map"),
    title("DOMINATOR", "map"),
    ...Array.from({ length: titleCount - 3 }, (_, index) => title(`TITLE_${index}`)),
  ],
  maps: Array.from({ length: mapCount }, (_, index) => map(`map.${index}`)),
  globalGrants: [],
});

describe("readTitleCatalogSnapshot", () => {
  it("accepts catalogs with more than the historical title count", () => {
    expect(() => readTitleCatalogSnapshot(snapshot(59, 38))).not.toThrow();
  });

  it("accepts catalogs with more than the historical map count", () => {
    expect(() => readTitleCatalogSnapshot(snapshot(58, 39))).not.toThrow();
  });
});

describe("renderTitlePresentationSeedSql", () => {
  it("writes semantic colors through the seed path", () => {
    const source = snapshot(4, 0);
    source.titles[0].colorExpr = "heroColor[12]";
    source.titles[1].colorExpr = "null";
    const sql = renderTitlePresentationSeedSql(source);
    expect(sql).toContain("WHEN 'PIONEER' THEN '{\"kind\":\"heroColor\",\"index\":12}'");
    expect(sql).toContain("WHEN 'CONQUEROR' THEN 'null'");
  });
});
