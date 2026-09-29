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
  it("returns every title and map when the catalog outgrows the historical counts", () => {
    const read = readTitleCatalogSnapshot(snapshot(59, 39));

    expect(read.titles.map((title) => title.key)).toEqual([
      "PIONEER",
      "CONQUEROR",
      "DOMINATOR",
      ...Array.from({ length: 56 }, (_, index) => `TITLE_${index}`),
    ]);
    expect(read.maps.map((map) => map.mapId)).toEqual(Array.from({ length: 39 }, (_, index) => `map.${index}`));
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
